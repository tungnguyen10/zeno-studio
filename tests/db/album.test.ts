import { afterAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { createAlbum, getStudioAlbums, publishAlbum } from '../../server/albums/album'
import { ensureStudio } from '../../server/studios/studio'
import type { PhotoSourceAdapter } from '../../server/photo-sources/photo-source'

const db = await PGlite.create()
for (const name of ['000_auth.sql', '001_core.sql', '002_workflow.sql', '003_rls.sql', '004_expiry.sql', '005_album_owner_guard.sql', '006_auth_column_names.sql', '007_studio_membership_context.sql', '008_studio_invitations.sql', '009_studio_bootstrap_guard.sql', '010_album_source_details.sql']) {
  await db.exec(await readFile(new URL(`../../db/migrations/${name}`, import.meta.url), 'utf8'))
}
await db.exec('SET ROLE app_runtime')
const pool = { async connect() { return { query: (sql: string, values?: unknown[]) => db.query(sql, values), release() {} } } }
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
})
