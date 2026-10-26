import { afterAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile, readdir } from 'node:fs/promises'
import { createAlbum } from '../../server/albums/album'
import { createGuestAlbum } from '../../server/albums/guest'
import { getManagedAlbumWorkspace } from '../../server/albums/workspace'
import { parseDownloadSettings, updateManagedDownloadSettings } from '../../server/albums/download-settings'
import { withDatabaseContext } from '../../server/db/context'
import { ensureStudio } from '../../server/studios/studio'
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
  async listPhotos() { return { items: [{ id: 'settings-photo', filename: 'A.JPG', mimeType: 'image/jpeg' }] } },
  async readPhoto() { return new Response() },
}
const settings = { enabled: true, allowSingle: true, allowSelected: false, allowAll: true, availableWhen: 'after_finalize' as const }

describe('album download settings', () => {
  it('rejects missing, extra and mistyped fields', () => {
    for (const bad of [null, {}, { ...settings, extra: 1 }, { ...settings, enabled: 'true' }, { ...settings, availableWhen: 'later' }]) {
      expect(() => parseDownloadSettings(bad)).toThrow()
    }
    expect(parseDownloadSettings(settings)).toEqual(settings)
  })

  it('enforces manager rights and audits updates atomically', async () => {
    const studio = await ensureStudio(pool, 'download-settings-owner', 'Settings')
    const album = await createAlbum(pool, source, { studioId: studio.id, userId: 'download-settings-owner', title: 'Settings', folderUrl: 'https://drive.google.com/drive/folders/folder123', expiresInDays: 15, limit: { kind: 'unlimited' } })
    await db.exec('RESET ROLE')
    await db.query("INSERT INTO studio_members (studio_id, user_id, role) VALUES ($1, 'download-settings-manager', 'manager'), ($1, 'download-settings-member', 'member'), ($1, 'download-settings-retoucher', 'retoucher')", [studio.id])
    await db.exec('SET ROLE app_runtime')
    const owner = { kind: 'member' as const, studioId: studio.id, userId: 'download-settings-owner' }
    const manager = { kind: 'member' as const, studioId: studio.id, userId: 'download-settings-manager' }
    expect((await getManagedAlbumWorkspace(pool, owner, album.id)).canEditDownloadSettings).toBe(true)
    await updateManagedDownloadSettings(pool, owner, album.id, settings)
    expect((await getManagedAlbumWorkspace(pool, owner, album.id)).downloadSettings).toEqual(settings)
    await updateManagedDownloadSettings(pool, manager, album.id, { ...settings, allowSelected: true })
    for (const role of ['download-settings-member', 'download-settings-retoucher']) {
      const denied = { kind: 'member' as const, studioId: studio.id, userId: role }
      expect((await getManagedAlbumWorkspace(pool, denied, album.id)).canEditDownloadSettings).toBe(false)
      await expect(updateManagedDownloadSettings(pool, denied, album.id, settings)).rejects.toMatchObject({ statusCode: 403 })
    }
    const audit = await withDatabaseContext(pool, { studioId: studio.id, userId: 'download-settings-owner', scope: 'member' }, client =>
      client.query<{ action: string; details: { previous: unknown; next: unknown } }>('SELECT action, details FROM audit_logs WHERE album_id = $1 ORDER BY created_at', [album.id]))
    expect(audit.rows).toHaveLength(2)
    expect(audit.rows[0]).toMatchObject({ action: 'album.download_settings.updated', details: { next: settings } })
    const other = await ensureStudio(pool, 'download-settings-other', 'Other')
    await expect(updateManagedDownloadSettings(pool, { kind: 'member', studioId: other.id, userId: 'download-settings-other' }, album.id, settings)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('allows the correct guest admin token and rejects the wrong one', async () => {
    const album = await createGuestAlbum(pool, source, { title: 'Guest settings', folderUrl: 'https://drive.google.com/drive/folders/folder123', expiresInDays: 15, limit: { kind: 'unlimited' } })
    const guest = { kind: 'guest' as const, albumId: album.id, token: album.adminToken }
    await updateManagedDownloadSettings(pool, guest, album.id, settings)
    expect((await getManagedAlbumWorkspace(pool, guest, album.id)).downloadSettings).toEqual(settings)
    await expect(updateManagedDownloadSettings(pool, { ...guest, token: album.customerToken }, album.id, settings)).rejects.toMatchObject({ statusCode: 403 })
  })
})
