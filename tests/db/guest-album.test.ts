import { afterAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile, readdir } from 'node:fs/promises'
import { withDatabaseContext } from '../../server/db/context'
import { createGuestAlbum, createGuestShareLink, claimGuestAlbum } from '../../server/albums/guest'
import { joinAlbum, resolveAlbumAccess } from '../../server/albums/access'
import { ensureStudio, getStudiosForUser } from '../../server/studios/studio'
import { getManagedAlbumWorkspace, listManagedAlbumPhotos } from '../../server/albums/workspace'
import { finalizeManagedSelection, getManagedSelectionResults, getSelectionState, setPhotoSelection } from '../../server/albums/selection'
import type { PhotoSourceAdapter } from '../../server/photo-sources/photo-source'
import { hashAccessToken } from '../../server/security/access-token'

const db = await PGlite.create()
const migrationDir = new URL('../../db/migrations/', import.meta.url)
for (const name of (await readdir(migrationDir)).filter(name => name.endsWith('.sql')).sort()) {
  await db.exec(await readFile(new URL(name, migrationDir), 'utf8'))
}
await db.exec('SET ROLE app_runtime')
const pool = { async connect() { return { query: (sql: string, values?: unknown[]) => db.query(sql, values), release() {} } } }
afterAll(async () => { await db.close() })
const source: PhotoSourceAdapter = {
  async listPhotos() { return { items: [{ id: 'guest-image-1', filename: '01.jpg', mimeType: 'image/jpeg' }] } },
  async readPhoto() { return new Response() },
}

describe('guest album ownership', () => {
  it('creates a published album with separate management and customer capabilities', async () => {
    const created = await createGuestAlbum(pool, source, {
      title: 'Guest wedding', folderUrl: 'https://drive.google.com/drive/folders/folder123',
      expiresInDays: 15, limit: { kind: 'unlimited' },
    })
    expect(created.status).toBe('PUBLISHED')
    expect(created.photoCount).toBe(1)
    expect(created.adminToken).not.toBe(created.customerToken)
    expect(await resolveAlbumAccess(pool, created.adminToken)).toMatchObject({ albumId: created.id, scope: 'guest_admin' })
    expect(await resolveAlbumAccess(pool, created.customerToken)).toMatchObject({ albumId: created.id, scope: 'customer' })
    const next = await createGuestShareLink(pool, created.id, created.adminToken)
    expect(await resolveAlbumAccess(pool, next.customerToken)).toMatchObject({ albumId: created.id, scope: 'customer' })
    await expect(createGuestShareLink(pool, created.id, created.customerToken)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('keeps guest albums isolated and claims one into the owner studio', async () => {
    const first = await createGuestAlbum(pool, source, {
      title: 'First', folderUrl: 'https://drive.google.com/drive/folders/folder123', expiresInDays: 15, limit: { kind: 'unlimited' },
    })
    const second = await createGuestAlbum(pool, source, {
      title: 'Second', folderUrl: 'https://drive.google.com/drive/folders/folder123', expiresInDays: 15, limit: { kind: 'unlimited' },
    })
    const studio = await ensureStudio(pool, 'claim-owner', 'Claim Studio')
    const unrelated = await ensureStudio(pool, 'other-owner', 'Other Studio')
    const participant = (await resolveAlbumAccess(pool, (await joinAlbum(pool, (await resolveAlbumAccess(pool, first.customerToken))!)).token))!
    const firstPhotoId = (await listManagedAlbumPhotos(pool, { kind: 'guest', albumId: first.id, token: first.adminToken }, first.id, { limit: 10, filter: 'all' })).items[0]!.id
    await setPhotoSelection(pool, participant, firstPhotoId, true, 0)
    await withDatabaseContext(pool, { albumId: first.id, scope: 'guest_admin' }, client =>
      client.query("INSERT INTO audit_logs (studio_id, album_id, actor_kind, action) SELECT studio_id, id, 'guest_admin', 'guest.created' FROM albums WHERE id = $1", [first.id]))
    await expect(claimGuestAlbum(pool, first.id, first.adminToken, unrelated.id, 'claim-owner')).rejects.toMatchObject({ statusCode: 403 })
    await expect(claimGuestAlbum(pool, first.id, second.adminToken, studio.id, 'claim-owner')).rejects.toMatchObject({ statusCode: 403 })
    await claimGuestAlbum(pool, first.id, first.adminToken, studio.id, 'claim-owner')
    expect(await resolveAlbumAccess(pool, first.adminToken)).toBeNull()
    expect(await resolveAlbumAccess(pool, first.customerToken)).toMatchObject({ albumId: first.id, scope: 'customer' })
    expect((await getSelectionState(pool, participant)).selectedPhotoIds).toEqual([firstPhotoId])
    expect(await resolveAlbumAccess(pool, second.adminToken)).toMatchObject({ albumId: second.id, scope: 'guest_admin' })
    const claimed = await withDatabaseContext(pool, { studioId: studio.id, userId: 'claim-owner', scope: 'member' },
      client => client.query<{ id: string }>('SELECT id FROM albums WHERE id = $1 AND studio_id = $2', [first.id, studio.id]))
    expect(claimed.rows).toHaveLength(1)
    const audit = await withDatabaseContext(pool, { studioId: studio.id, userId: 'claim-owner', scope: 'member' }, client =>
      client.query<{ action: string }>('SELECT action FROM audit_logs WHERE album_id = $1', [first.id]))
    expect(audit.rows).toMatchObject([{ action: 'guest.created' }])
    expect(await getStudiosForUser(pool, 'claim-owner')).toHaveLength(1)
  })

  it('lets a guest manager finalize and read the immutable result without creating production tasks', async () => {
    const created = await createGuestAlbum(pool, source, {
      title: 'Guest selection', folderUrl: 'https://drive.google.com/drive/folders/folder123',
      expiresInDays: 15, limit: { kind: 'unlimited' },
    })
    const manager = { kind: 'guest' as const, albumId: created.id, token: created.adminToken }
    const workspace = await getManagedAlbumWorkspace(pool, manager, created.id)
    expect(workspace.canFinalize).toBe(true)
    expect(workspace.photoCount).toBe(1)
    const photoId = (await listManagedAlbumPhotos(pool, manager, created.id, { limit: 10, filter: 'all' })).items[0]!.id
    const result = await finalizeManagedSelection(pool, manager, created.id, { include: [photoId] })
    expect(result).toMatchObject({ versionNumber: 1, count: 1 })
    expect((await getManagedAlbumWorkspace(pool, manager, created.id)).hasResults).toBe(true)
    expect((await getManagedSelectionResults(pool, manager, created.id)).items[0]?.filename).toBe('01.jpg')
    const taskCount = await withDatabaseContext(pool, { albumId: created.id, scope: 'guest_admin' }, client =>
      client.query<{ count: string }>('SELECT count(*)::text AS count FROM production_tasks WHERE album_id = $1', [created.id]))
    expect(taskCount.rows[0]?.count).toBe('0')
    const finalized = await getManagedSelectionResults(pool, manager, created.id)
    expect((await getManagedSelectionResults(pool, manager, created.id, { versionId: finalized.selectionVersionId })).items[0]?.filename).toBe('01.jpg')
    const other = await createGuestAlbum(pool, source, {
      title: 'Other album', folderUrl: 'https://drive.google.com/drive/folders/folder123',
      expiresInDays: 15, limit: { kind: 'unlimited' },
    })
    await expect(getManagedSelectionResults(pool, { kind: 'guest', albumId: other.id, token: other.adminToken }, other.id,
      { versionId: finalized.selectionVersionId })).rejects.toMatchObject({ statusCode: 404 })
    await expect(getManagedSelectionResults(pool, { kind: 'guest', albumId: created.id, token: created.customerToken }, created.id,
      { versionId: finalized.selectionVersionId })).rejects.toMatchObject({ statusCode: 403 })
    await withDatabaseContext(pool, { albumId: created.id, scope: 'guest_admin' }, client =>
      client.query('UPDATE albums SET expires_at = now() - interval \'1 day\', status = \'EXPIRED\' WHERE id = $1', [created.id]))
    expect(await getManagedAlbumWorkspace(pool, manager, created.id)).toMatchObject({ canFinalize: false, hasResults: true })
    expect((await getManagedSelectionResults(pool, manager, created.id)).items).toHaveLength(1)
    await withDatabaseContext(pool, { albumId: created.id, scope: 'guest_admin' }, client =>
      client.query("UPDATE albums SET expires_at = now() + interval '1 day', status = 'DELIVERED' WHERE id = $1", [created.id]))
    expect((await getManagedSelectionResults(pool, manager, created.id, { versionId: finalized.selectionVersionId })).items).toHaveLength(1)
    await db.exec('RESET ROLE')
    const revoked = await db.query('UPDATE album_tokens SET revoked_at = now() WHERE token_hash = $1', [hashAccessToken(created.adminToken)])
    await db.exec('SET ROLE app_runtime')
    expect(revoked.affectedRows).toBe(1)
    await expect(getManagedSelectionResults(pool, manager, created.id, { versionId: finalized.selectionVersionId }))
      .rejects.toMatchObject({ statusCode: 403 })
    await expect(getManagedAlbumWorkspace(pool, { kind: 'guest', albumId: created.id, token: created.customerToken }, created.id))
      .rejects.toMatchObject({ statusCode: 403 })
  })

  it('preserves read access and claim during the metadata retention period, then rejects expired management', async () => {
    const created = await createGuestAlbum(pool, source, {
      title: 'Expiring album', folderUrl: 'https://drive.google.com/drive/folders/folder123',
      expiresInDays: 15, limit: { kind: 'unlimited' },
    })
    const manager = { kind: 'guest' as const, albumId: created.id, token: created.adminToken }
    const studio = await ensureStudio(pool, 'expiry-owner', 'Expiry Studio')
    await withDatabaseContext(pool, { albumId: created.id, scope: 'guest_admin' }, client =>
      client.query('UPDATE albums SET expires_at = now() - interval \'1 day\' WHERE id = $1', [created.id]))
    expect(await getManagedAlbumWorkspace(pool, manager, created.id)).toMatchObject({ id: created.id, canFinalize: false, hasResults: false })
    await expect(createGuestShareLink(pool, created.id, created.adminToken)).rejects.toMatchObject({ statusCode: 409 })
    await expect(finalizeManagedSelection(pool, manager, created.id)).rejects.toMatchObject({ statusCode: 410 })
    await claimGuestAlbum(pool, created.id, created.adminToken, studio.id, 'expiry-owner')
    expect(await resolveAlbumAccess(pool, created.adminToken)).toBeNull()
    const claimed = await withDatabaseContext(pool, { studioId: studio.id, userId: 'expiry-owner', scope: 'member' }, client =>
      client.query<{ status: string; expired: boolean }>('SELECT status, expires_at < now() AS expired FROM albums WHERE id = $1', [created.id]))
    expect(claimed.rows[0]).toMatchObject({ status: 'PUBLISHED', expired: true })
  })

  it('purges an unclaimed guest studio when album metadata is removed', async () => {
    const created = await createGuestAlbum(pool, source, {
      title: 'Purge guest studio', folderUrl: 'https://drive.google.com/drive/folders/folder123',
      expiresInDays: 15, limit: { kind: 'unlimited' },
    })
    const sourceStudio = await withDatabaseContext(pool, { albumId: created.id, scope: 'guest_admin' }, async client => {
      const result = await client.query<{ studio_id: string }>('SELECT studio_id FROM albums WHERE id = $1', [created.id])
      await client.query("UPDATE albums SET expires_at = now() - interval '31 days' WHERE id = $1", [created.id])
      return result.rows[0]!.studio_id
    })
    await withDatabaseContext(pool, { scope: 'expiry_job' }, client => client.query('SELECT * FROM app_private.expire_and_purge()'))
    const remaining = await withDatabaseContext(pool, { studioId: sourceStudio, scope: 'member' }, client =>
      client.query<{ id: string }>('SELECT id FROM studios WHERE id = $1', [sourceStudio]))
    expect(remaining.rows).toHaveLength(0)
    expect(await resolveAlbumAccess(pool, created.adminToken)).toBeNull()
  })
})
