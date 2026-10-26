import { afterAll, describe, expect, it, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile, readdir } from 'node:fs/promises'
import { createGuestAlbum } from '../../server/albums/guest'
import { updateManagedDownloadSettings } from '../../server/albums/download-settings'
import { joinAlbum, listAlbumPhotos, resolveAlbumAccess } from '../../server/albums/access'
import { finalizeManagedSelection, setPhotoSelection } from '../../server/albums/selection'
import { createDownloadPlan } from '../../server/downloads/plan'
import { authorizeDownloadTicket } from '../../server/downloads/transfer'
import { consumeAlbumDownloadAttempt } from '../../server/downloads/rate-limit'
import { withDatabaseContext } from '../../server/db/context'
import type { GoogleDriveAdapter } from '../../server/photo-sources/google-drive'
import type { PhotoSourceAdapter } from '../../server/photo-sources/photo-source'

const db = await PGlite.create()
const migrationDir = new URL('../../db/migrations/', import.meta.url)
for (const name of (await readdir(migrationDir)).filter(name => name.endsWith('.sql')).sort()) {
  await db.exec(await readFile(new URL(name, migrationDir), 'utf8'))
}
await db.exec('SET ROLE app_runtime')
const pool = { async connect() { return { query: (sql: string, values?: unknown[]) => db.query(sql, values), release() {} } } }
afterAll(async () => { await db.close() })
const source: PhotoSourceAdapter = {
  async listPhotos() { return { items: ['A', 'B', 'C'].map(id => ({ id: `plan-${id}`, filename: `${id}.jpg`, mimeType: 'image/jpeg', sizeBytes: 5 })) } },
  async readPhoto() { return new Response() },
}

describe('download plan under customer RLS', () => {
  it('derives selected/all IDs on server and preserves an independent basket', async () => {
    process.env.NUXT_DOWNLOAD_TICKET_SECRET = 'test-plan-secret-0123456789-abcdef'
    const album = await createGuestAlbum(pool, source, { title: 'Plan', folderUrl: 'https://drive.google.com/drive/folders/folder123', expiresInDays: 15, limit: { kind: 'unlimited' } })
    const manager = { kind: 'guest' as const, albumId: album.id, token: album.adminToken }
    await updateManagedDownloadSettings(pool, manager, album.id,
      { enabled: true, allowSingle: false, allowSelected: true, allowAll: true, availableWhen: 'anytime' })
    const customer = (await resolveAlbumAccess(pool, album.customerToken))!
    const access = (await resolveAlbumAccess(pool, (await joinAlbum(pool, customer)).token))!
    const firstAttempt = await consumeAlbumDownloadAttempt(pool, access, '127.0.0.1', process.env.NUXT_DOWNLOAD_TICKET_SECRET!)
    expect(firstAttempt.allowed).toBe(true)
    await db.exec('RESET ROLE')
    await db.query('UPDATE album_download_rate_windows SET attempts = 600 WHERE album_id = $1', [album.id])
    await db.exec('SET ROLE app_runtime')
    const blockedAttempt = await consumeAlbumDownloadAttempt(pool, access, '127.0.0.1', process.env.NUXT_DOWNLOAD_TICKET_SECRET!)
    expect(blockedAttempt.allowed).toBe(false)
    expect(blockedAttempt.retryAfterSeconds).toBeGreaterThan(0)
    const photos = (await listAlbumPhotos(pool, access)).items
    const metadata = vi.fn()
    const readOriginal = vi.fn()
    const originalSource = { getOriginalMetadata: metadata, readPhoto: readOriginal } as unknown as GoogleDriveAdapter
    await setPhotoSelection(pool, access, photos[0]!.id, true, 0)
    const selected = await createDownloadPlan(pool, access, originalSource, { kind: 'selected' })
    expect(selected.parts[0]?.photoIds).toEqual([photos[0]!.id])
    const basket = await createDownloadPlan(pool, access, originalSource, { kind: 'basket', photoIds: [photos[2]!.id, photos[1]!.id] })
    expect(basket.parts[0]?.photoIds).toEqual([photos[2]!.id, photos[1]!.id])
    const all = await createDownloadPlan(pool, access, originalSource, { kind: 'all' })
    expect(all.parts[0]?.photoIds).toEqual(photos.map(photo => photo.id))
    expect(readOriginal).not.toHaveBeenCalled()
    expect(metadata).not.toHaveBeenCalled()

    const ticket = basket.parts[0]!.ticket
    metadata.mockResolvedValue({ filename: 'Current.jpg', mimeType: 'image/jpeg', sizeBytes: 5 })
    const verified = await authorizeDownloadTicket(pool, access, originalSource, ticket, 'zip')
    expect(verified.files.map(file => file.photoId)).toEqual([photos[2]!.id, photos[1]!.id])
    await updateManagedDownloadSettings(pool, manager, album.id,
      { enabled: false, allowSingle: false, allowSelected: true, allowAll: true, availableWhen: 'anytime' })
    await expect(authorizeDownloadTicket(pool, access, originalSource, ticket, 'zip')).rejects.toMatchObject({ statusCode: 403 })
    expect(readOriginal).not.toHaveBeenCalled()
    await updateManagedDownloadSettings(pool, manager, album.id,
      { enabled: true, allowSingle: false, allowSelected: true, allowAll: true, availableWhen: 'anytime' })

    await finalizeManagedSelection(pool, manager, album.id)
    const finalized = await createDownloadPlan(pool, access, originalSource, { kind: 'selected' })
    expect(finalized.parts[0]?.photoIds).toEqual([photos[0]!.id])
    await expect(createDownloadPlan(pool, access, originalSource, { kind: 'basket', photoIds: [album.id] }))
      .rejects.toMatchObject({ statusCode: 404 })
    await expect(createDownloadPlan(pool, access, originalSource, { kind: 'basket', photoIds: [] }))
      .rejects.toMatchObject({ statusCode: 400 })
    await withDatabaseContext(pool, { albumId: album.id, scope: 'guest_admin' }, client =>
      client.query('UPDATE photos SET source_size_bytes = NULL WHERE id = $1', [photos[1]!.id]))
    metadata.mockResolvedValue({ filename: 'Renamed.jpg', mimeType: 'image/jpeg', sizeBytes: 8 })
    const refreshed = await createDownloadPlan(pool, access, originalSource, { kind: 'basket', photoIds: [photos[1]!.id] })
    expect(refreshed.totalBytes).toBe(8)
    expect(metadata).toHaveBeenCalledWith('plan-B', undefined)
    expect(readOriginal).not.toHaveBeenCalled()
  })
})
