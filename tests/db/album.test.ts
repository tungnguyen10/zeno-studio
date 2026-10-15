import { afterAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { createAlbum, getStudioAlbums, publishAlbum } from '../../server/albums/album'
import { DriveSourceError } from '../../server/photo-sources/google-drive'
import { ensureStudio } from '../../server/studios/studio'
import type { PhotoSourceAdapter } from '../../server/photo-sources/photo-source'

const db = await PGlite.create()
for (const name of ['000_auth.sql', '001_core.sql', '002_workflow.sql', '003_rls.sql', '004_expiry.sql', '005_album_owner_guard.sql', '006_auth_column_names.sql', '007_studio_membership_context.sql', '008_studio_invitations.sql', '009_studio_bootstrap_guard.sql', '010_album_source_details.sql']) {
  await db.exec(await readFile(new URL(`../../db/migrations/${name}`, import.meta.url), 'utf8'))
}
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
