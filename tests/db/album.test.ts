import { afterAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { withDatabaseContext } from '../../server/db/context'
import { archiveStudioAlbum, createAlbum, createAlbumShareLink, deleteDraftAlbum, getStudioAlbums, publishAlbum, restoreStudioAlbum, updateStudioAlbum } from '../../server/albums/album'
import { joinAlbum, listAlbumPhotos, resolveAlbumAccess } from '../../server/albums/access'
import { finalizeStudioSelection, setPhotoSelection } from '../../server/albums/selection'
import { DriveSourceError } from '../../server/photo-sources/google-drive'
import { ensureStudio } from '../../server/studios/studio'
import type { PhotoSourceAdapter } from '../../server/photo-sources/photo-source'

const db = await PGlite.create()
for (const name of ['000_auth.sql', '001_core.sql', '002_workflow.sql', '003_rls.sql', '004_expiry.sql', '005_album_owner_guard.sql', '006_auth_column_names.sql', '007_studio_membership_context.sql', '008_studio_invitations.sql', '009_studio_bootstrap_guard.sql', '010_album_source_details.sql', '011_album_token_access.sql', '012_selection_cycles.sql', '013_participant_rls.sql', '016_photo_thumbnails.sql', '017_guest_albums.sql', '019_shared_customer_participant.sql', '020_album_archive.sql', '021_album_download.sql']) {
  await db.exec(await readFile(new URL(`../../db/migrations/${name}`, import.meta.url), 'utf8'))
}
await db.exec(await readFile(new URL('../../db/migrations/025_studio_analytics.sql', import.meta.url), 'utf8'))
await db.exec('SET ROLE app_runtime')
let photoInsertQueries = 0
const pool = { async connect() { return { query: (sql: string, values?: unknown[]) => {
  if (sql.startsWith('INSERT INTO photos ')) photoInsertQueries++
  return db.query(sql, values)
}, release() {} } } }
afterAll(async () => { await db.close() })

const source: PhotoSourceAdapter = {
  async listPhotos(_folder, pageToken) {
    return pageToken
      ? { items: [{ id: 'drive-photo-2', filename: 'B.JPG', mimeType: 'image/jpeg' }] }
      : { items: [{ id: 'drive-photo-1', filename: 'A.JPG', mimeType: 'image/jpeg', resourceKey: 'image-key' }], nextPageToken: 'page-2' }
  },
  async readPhoto() { return new Response() },
}

describe('studio album lifecycle', () => {
  it('edits draft settings and only the title after publication', async () => {
    const studio = await ensureStudio(pool, 'settings-owner', 'Settings studio')
    const album = await createAlbum(pool, source, { studioId: studio.id, userId: 'settings-owner', folderUrl: 'https://drive.google.com/drive/folders/folder123', title: 'Before', expiresInDays: 15, limit: { kind: 'maximum', count: 2 } })
    await updateStudioAlbum(pool, studio.id, 'settings-owner', album.id, { title: 'After', expiresInDays: 30, limit: { kind: 'range', min: 1, max: 3 } })
    const draft = await withDatabaseContext(pool, { studioId: studio.id, userId: 'settings-owner', scope: 'member' }, client => client.query<{ title: string; duration_days: number; limit_kind: string; limit_min: number; limit_max: number }>('SELECT a.title, s.duration_days, s.limit_kind, s.limit_min, s.limit_max FROM albums a JOIN album_settings s ON s.album_id = a.id WHERE a.id = $1', [album.id]))
    expect(draft.rows[0]).toMatchObject({ title: 'After', duration_days: 30, limit_kind: 'range', limit_min: 1, limit_max: 3 })
    await publishAlbum(pool, studio.id, 'settings-owner', album.id)
    await updateStudioAlbum(pool, studio.id, 'settings-owner', album.id, { title: 'Published name' })
    await expect(updateStudioAlbum(pool, studio.id, 'settings-owner', album.id, { title: 'No', expiresInDays: 15 })).rejects.toMatchObject({ statusCode: 409 })
    expect((await getStudioAlbums(pool, studio.id, 'settings-owner')).find(item => item.id === album.id)?.title).toBe('Published name')
    await withDatabaseContext(pool, { studioId: studio.id, userId: 'settings-owner', scope: 'member' }, client => client.query("UPDATE albums SET expires_at = now() - interval '1 day' WHERE id = $1", [album.id]))
    await expect(updateStudioAlbum(pool, studio.id, 'settings-owner', album.id, { title: 'Too late' })).rejects.toMatchObject({ statusCode: 409 })
  })

  it('archives and restores without revoking customer access', async () => {
    const studio = await ensureStudio(pool, 'archive-owner', 'Archive studio')
    const album = await createAlbum(pool, source, { studioId: studio.id, userId: 'archive-owner', folderUrl: 'https://drive.google.com/drive/folders/folder123', title: 'Archive', expiresInDays: 15, limit: { kind: 'unlimited' } })
    const { customerToken } = await publishAlbum(pool, studio.id, 'archive-owner', album.id)
    const participant = (await resolveAlbumAccess(pool, (await joinAlbum(pool, (await resolveAlbumAccess(pool, customerToken))!)).token))!
    const photos = (await listAlbumPhotos(pool, participant)).items
    await setPhotoSelection(pool, participant, photos[0]!.id, true, 0)
    await finalizeStudioSelection(pool, studio.id, 'archive-owner', album.id)
    const before = (await getStudioAlbums(pool, studio.id, 'archive-owner')).find(item => item.id === album.id)!
    await archiveStudioAlbum(pool, studio.id, 'archive-owner', album.id)
    expect((await getStudioAlbums(pool, studio.id, 'archive-owner')).find(item => item.id === album.id)).toMatchObject({ archivedAt: expect.any(Date), expiresAt: before.expiresAt, selectedCount: 1, latestVersionNumber: 1 })
    expect(await resolveAlbumAccess(pool, customerToken)).toMatchObject({ albumId: album.id })
    await restoreStudioAlbum(pool, studio.id, 'archive-owner', album.id)
    expect((await getStudioAlbums(pool, studio.id, 'archive-owner')).find(item => item.id === album.id)?.archivedAt).toBeNull()
  })

  it('deletes only unpublished drafts and enforces studio ownership', async () => {
    const studio = await ensureStudio(pool, 'delete-owner', 'Delete studio')
    const other = await ensureStudio(pool, 'delete-other', 'Other studio')
    const draft = await createAlbum(pool, source, { studioId: studio.id, userId: 'delete-owner', folderUrl: 'https://drive.google.com/drive/folders/folder123', title: 'Discard', expiresInDays: 15, limit: { kind: 'unlimited' } })
    await expect(deleteDraftAlbum(pool, other.id, 'delete-other', draft.id)).rejects.toMatchObject({ statusCode: 404 })
    await deleteDraftAlbum(pool, studio.id, 'delete-owner', draft.id)
    expect((await getStudioAlbums(pool, studio.id, 'delete-owner')).some(item => item.id === draft.id)).toBe(false)
    await db.exec('RESET ROLE')
    try {
      const remaining = await db.query<{ count: number }>('SELECT count(*)::integer AS count FROM photos WHERE album_id = $1', [draft.id])
      expect(remaining.rows[0]?.count).toBe(0)
    } finally { await db.exec('SET ROLE app_runtime') }
    const published = await createAlbum(pool, source, { studioId: studio.id, userId: 'delete-owner', folderUrl: 'https://drive.google.com/drive/folders/folder123', title: 'Keep', expiresInDays: 15, limit: { kind: 'unlimited' } })
    await publishAlbum(pool, studio.id, 'delete-owner', published.id)
    await expect(deleteDraftAlbum(pool, studio.id, 'delete-owner', published.id)).rejects.toMatchObject({ statusCode: 409 })
  })

  it('allows only owners and managers to manage album settings and archive state', async () => {
    const studio = await ensureStudio(pool, 'roles-owner', 'Roles studio')
    const album = await createAlbum(pool, source, { studioId: studio.id, userId: 'roles-owner', folderUrl: 'https://drive.google.com/drive/folders/folder123', title: 'Roles', expiresInDays: 15, limit: { kind: 'unlimited' } })
    await db.exec('RESET ROLE')
    try {
      await db.query("INSERT INTO studio_members (studio_id, user_id, role) VALUES ($1, 'roles-manager', 'manager'), ($1, 'roles-member', 'member')", [studio.id])
    } finally { await db.exec('SET ROLE app_runtime') }
    await updateStudioAlbum(pool, studio.id, 'roles-manager', album.id, { title: 'Manager edit' })
    await expect(updateStudioAlbum(pool, studio.id, 'roles-member', album.id, { title: 'Denied' })).rejects.toMatchObject({ statusCode: 403 })
    await expect(archiveStudioAlbum(pool, studio.id, 'roles-member', album.id)).rejects.toMatchObject({ statusCode: 403 })
    await expect(deleteDraftAlbum(pool, studio.id, 'roles-member', album.id)).rejects.toMatchObject({ statusCode: 403 })
    await archiveStudioAlbum(pool, studio.id, 'roles-manager', album.id)
    expect((await getStudioAlbums(pool, studio.id, 'roles-owner')).find(item => item.id === album.id)?.archivedAt).toBeTruthy()
  })

  it('purges archived albums on the existing retention schedule', async () => {
    const studio = await ensureStudio(pool, 'retention-owner', 'Retention studio')
    const album = await createAlbum(pool, source, { studioId: studio.id, userId: 'retention-owner', folderUrl: 'https://drive.google.com/drive/folders/folder123', title: 'Archive expiry', expiresInDays: 15, limit: { kind: 'unlimited' } })
    await archiveStudioAlbum(pool, studio.id, 'retention-owner', album.id)
    await withDatabaseContext(pool, { studioId: studio.id, userId: 'retention-owner', scope: 'member' }, client => client.query("UPDATE albums SET expires_at = now() - interval '31 days' WHERE id = $1", [album.id]))
    await withDatabaseContext(pool, { scope: 'expiry_job' }, client => client.query('SELECT * FROM app_private.expire_and_purge()'))
    expect((await getStudioAlbums(pool, studio.id, 'retention-owner')).some(item => item.id === album.id)).toBe(false)
  })
  it('imports stable Drive IDs, publishes, and lists an album within its studio', async () => {
    const studio = await ensureStudio(pool, 'album-owner', 'Album Studio')
    const album = await createAlbum(pool, source, {
      studioId: studio.id, userId: 'album-owner', folderUrl: 'https://drive.google.com/drive/folders/folder123',
      title: 'Wedding', expiresInDays: 15, limit: { kind: 'exact', count: 2 },
    })
    expect(album.status).toBe('DRAFT')
    expect(album.photoCount).toBe(2)
    expect((await getStudioAlbums(pool, studio.id, 'album-owner')).map(item => item.id)).toContain(album.id)
    const published = await publishAlbum(pool, studio.id, 'album-owner', album.id)
    expect(published.customerToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect((await getStudioAlbums(pool, studio.id, 'album-owner')).find(item => item.id === album.id)?.status).toBe('PUBLISHED')
    await expect(publishAlbum(pool, studio.id, 'album-owner', album.id)).rejects.toThrow()
  })

  it('does not expose another studio album', async () => {
    const other = await ensureStudio(pool, 'other-album-owner', 'Other')
    expect(await getStudioAlbums(pool, other.id, 'other-album-owner')).toEqual([])
  })

  it('reports the customer selection progress, limit and latest finalized version', async () => {
    const studio = await ensureStudio(pool, 'progress-owner', 'Progress studio')
    const album = await createAlbum(pool, source, {
      studioId: studio.id, userId: 'progress-owner', folderUrl: 'https://drive.google.com/drive/folders/folder123',
      title: 'Progress', expiresInDays: 15, limit: { kind: 'maximum', count: 2 },
    })
    const summary = async () => (await getStudioAlbums(pool, studio.id, 'progress-owner')).find(item => item.id === album.id)
    expect(album).toMatchObject({ selectedCount: 0, selectionLimit: 2, latestVersionNumber: null })
    expect(await summary()).toMatchObject({ selectedCount: 0, selectionLimit: 2, latestVersionNumber: null })

    const { customerToken } = await publishAlbum(pool, studio.id, 'progress-owner', album.id)
    const access = (await resolveAlbumAccess(pool, (await joinAlbum(pool, (await resolveAlbumAccess(pool, customerToken))!)).token))!
    const photos = (await listAlbumPhotos(pool, access)).items
    await setPhotoSelection(pool, access, photos[0]!.id, true, 0)
    expect(await summary()).toMatchObject({ photoCount: 2, selectedCount: 1, latestVersionNumber: null })

    await finalizeStudioSelection(pool, studio.id, 'progress-owner', album.id)
    expect(await summary()).toMatchObject({ status: 'FINALIZED', selectedCount: 1, latestVersionNumber: 1 })
  })

  it('creates a fresh customer share link for a published album while earlier links remain valid', async () => {
    const studio = await ensureStudio(pool, 'share-owner', 'Share studio')
    const album = await createAlbum(pool, source, {
      studioId: studio.id, userId: 'share-owner', folderUrl: 'https://drive.google.com/drive/folders/folder123',
      title: 'Shareable', expiresInDays: 15, limit: { kind: 'unlimited' },
    })
    const published = await publishAlbum(pool, studio.id, 'share-owner', album.id)
    const shared = await createAlbumShareLink(pool, studio.id, 'share-owner', album.id)
    expect(shared.customerToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(shared.customerToken).not.toBe(published.customerToken)
    expect(await resolveAlbumAccess(pool, published.customerToken)).toMatchObject({ albumId: album.id, scope: 'customer' })
    expect(await resolveAlbumAccess(pool, shared.customerToken)).toMatchObject({ albumId: album.id, scope: 'customer' })
  })

  it('refuses to share a draft, expired album, or another studio member’s album', async () => {
    const studio = await ensureStudio(pool, 'share-guard-owner', 'Share guard studio')
    const album = await createAlbum(pool, source, {
      studioId: studio.id, userId: 'share-guard-owner', folderUrl: 'https://drive.google.com/drive/folders/folder123',
      title: 'Guarded', expiresInDays: 15, limit: { kind: 'unlimited' },
    })
    await expect(createAlbumShareLink(pool, studio.id, 'share-guard-owner', album.id)).rejects.toMatchObject({ statusCode: 409 })
    await publishAlbum(pool, studio.id, 'share-guard-owner', album.id)
    await expect(createAlbumShareLink(pool, studio.id, 'unrelated-user', album.id)).rejects.toMatchObject({ statusCode: 403 })
    await withDatabaseContext(pool, { studioId: studio.id, userId: 'share-guard-owner', scope: 'member' }, client =>
      client.query("UPDATE albums SET expires_at = now() - interval '1 day' WHERE id = $1", [album.id]))
    await expect(createAlbumShareLink(pool, studio.id, 'share-guard-owner', album.id)).rejects.toMatchObject({ statusCode: 409 })
  })

  it('rejects an invalid Drive folder link with a client error', async () => {
    const studio = await ensureStudio(pool, 'bad-folder-owner', 'Bad folder studio')
    await expect(createAlbum(pool, source, {
      studioId: studio.id, userId: 'bad-folder-owner', folderUrl: 'https://example.com/folders/abc',
      title: 'Invalid', expiresInDays: 15, limit: { kind: 'unlimited' },
    })).rejects.toMatchObject({ statusCode: 400 })
  })

  it('maps an inaccessible Drive folder to an actionable client error', async () => {
    const studio = await ensureStudio(pool, 'denied-folder-owner', 'Denied folder studio')
    const deniedSource: PhotoSourceAdapter = {
      async listPhotos() { throw new DriveSourceError(404, 'Google Drive folder request failed (404)') },
      async readPhoto() { return new Response() },
    }
    await expect(createAlbum(pool, deniedSource, {
      studioId: studio.id, userId: 'denied-folder-owner', folderUrl: 'https://drive.google.com/drive/folders/folder123',
      title: 'Denied', expiresInDays: 15, limit: { kind: 'unlimited' },
    })).rejects.toMatchObject({ statusCode: 422, message: expect.stringContaining('quyền') })
  })

  it('distinguishes Google quota errors from folder permissions', async () => {
    const studio = await ensureStudio(pool, 'quota-folder-owner', 'Quota folder studio')
    const quotaSource: PhotoSourceAdapter = {
      async listPhotos() { throw new DriveSourceError(403, 'Google Drive folder request failed (403)', 'rateLimitExceeded') },
      async readPhoto() { return new Response() },
    }
    await expect(createAlbum(pool, quotaSource, {
      studioId: studio.id, userId: 'quota-folder-owner', folderUrl: 'https://drive.google.com/drive/folders/folder123',
      title: 'Quota', expiresInDays: 15, limit: { kind: 'unlimited' },
    })).rejects.toMatchObject({ statusCode: 503, message: expect.stringContaining('giới hạn') })
  })

  it('reports an API key restriction as server configuration rather than folder permissions', async () => {
    const studio = await ensureStudio(pool, 'restricted-key-owner', 'Restricted key studio')
    const restrictedSource: PhotoSourceAdapter = {
      async listPhotos() { throw new DriveSourceError(403, 'Google Drive folder request failed (403)', 'API_KEY_SERVICE_BLOCKED') },
      async readPhoto() { return new Response() },
    }
    await expect(createAlbum(pool, restrictedSource, {
      studioId: studio.id, userId: 'restricted-key-owner', folderUrl: 'https://drive.google.com/drive/folders/folder123',
      title: 'Restricted', expiresInDays: 15, limit: { kind: 'unlimited' },
    })).rejects.toMatchObject({ statusCode: 503, message: expect.stringContaining('API key') })
  })

  it('imports 1,001 photos with bounded database round trips', async () => {
    const studio = await ensureStudio(pool, 'large-album-owner', 'Large album studio')
    const largeSource: PhotoSourceAdapter = {
      async listPhotos(_folder, pageToken) {
        const start = pageToken ? 1000 : 0
        const end = pageToken ? 1001 : 1000
        return { items: Array.from({ length: end - start }, (_, index) => ({
          id: `photo-${start + index}`, filename: `${start + index}.jpg`, mimeType: 'image/jpeg',
        })), ...(pageToken ? {} : { nextPageToken: 'page-2' }) }
      },
      async readPhoto() { return new Response() },
    }
    const before = photoInsertQueries
    const album = await createAlbum(pool, largeSource, {
      studioId: studio.id, userId: 'large-album-owner', folderUrl: 'https://drive.google.com/drive/folders/folder123',
      title: 'Large', expiresInDays: 15, limit: { kind: 'unlimited' },
    })
    expect(album.photoCount).toBe(1001)
    expect(photoInsertQueries - before).toBeLessThanOrEqual(5)
    expect((await getStudioAlbums(pool, studio.id, 'large-album-owner'))[0]?.photoCount).toBe(1001)
  })
})
