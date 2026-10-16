import { afterAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { createAlbum, publishAlbum } from '../../server/albums/album'
import { withDatabaseContext } from '../../server/db/context'
import { ensureStudio } from '../../server/studios/studio'
import type { PhotoSourceAdapter } from '../../server/photo-sources/photo-source'

const db = await PGlite.create()
for (const number of Array.from({ length: 17 }, (_, index) => index)) {
  const names = ['auth', 'core', 'workflow', 'rls', 'expiry', 'album_owner_guard', 'auth_column_names', 'studio_membership_context', 'studio_invitations', 'studio_bootstrap_guard', 'album_source_details', 'album_token_access', 'selection_cycles', 'participant_rls', 'review_delivery', 'review_policy_lockdown', 'photo_thumbnails']
  const filename = `${String(number).padStart(3, '0')}_${names[number]}.sql`
  await db.exec(await readFile(new URL(`../../db/migrations/${filename}`, import.meta.url), 'utf8'))
}
await db.exec('SET ROLE app_runtime')
const pool = { async connect() { return { query: (sql: string, values?: unknown[]) => db.query(sql, values), release() {} } } }
afterAll(async () => { await db.close() })

const source: PhotoSourceAdapter = {
  async listPhotos() { return { items: [{ id: 'source-photo-1', filename: 'A.jpg', mimeType: 'image/jpeg', thumbnailLink: 'https://lh3.googleusercontent.com/initial' }] } },
  async readPhoto() { return new Response() },
}

describe('thumbnail metadata under album RLS', () => {
  it('stores the listed thumbnail and refreshes only an album the customer can read', async () => {
    const studio = await ensureStudio(pool, 'thumbnail-owner', 'Thumbnail Studio')
    const first = await createAlbum(pool, source, { studioId: studio.id, userId: 'thumbnail-owner', title: 'First', folderUrl: 'https://drive.google.com/drive/folders/folder123', expiresInDays: 15, limit: { kind: 'unlimited' } })
    const second = await createAlbum(pool, source, { studioId: studio.id, userId: 'thumbnail-owner', title: 'Second', folderUrl: 'https://drive.google.com/drive/folders/folder456', expiresInDays: 15, limit: { kind: 'unlimited' } })
    await publishAlbum(pool, studio.id, 'thumbnail-owner', first.id)
    await publishAlbum(pool, studio.id, 'thumbnail-owner', second.id)

    const firstPhoto = await withDatabaseContext(pool, { albumId: first.id, scope: 'customer' }, async client => {
      const result = await client.query<{ id: string; thumbnail_url: string }>('SELECT id, thumbnail_url FROM photos WHERE album_id = $1', [first.id])
      return result.rows[0]!
    })
    expect(firstPhoto.thumbnail_url).toBe('https://lh3.googleusercontent.com/initial')

    const secondPhoto = await withDatabaseContext(pool, { albumId: second.id, scope: 'customer' }, async client => {
      const result = await client.query<{ id: string }>('SELECT id FROM photos WHERE album_id = $1', [second.id])
      return result.rows[0]!
    })
    const outcome = await withDatabaseContext(pool, { albumId: first.id, scope: 'customer' }, async client => {
      const own = await client.query<{ updated: boolean }>('SELECT app_private.set_photo_thumbnail_cache($1, $2, $3) AS updated', [firstPhoto.id, first.id, 'https://lh3.googleusercontent.com/refreshed'])
      const other = await client.query<{ updated: boolean }>('SELECT app_private.set_photo_thumbnail_cache($1, $2, $3) AS updated', [secondPhoto.id, second.id, 'https://lh3.googleusercontent.com/forbidden'])
      const refreshed = await client.query<{ thumbnail_url: string }>('SELECT thumbnail_url FROM photos WHERE id = $1', [firstPhoto.id])
      return { own: own.rows[0]?.updated, other: other.rows[0]?.updated, url: refreshed.rows[0]?.thumbnail_url }
    })
    expect(outcome).toEqual({ own: true, other: false, url: 'https://lh3.googleusercontent.com/refreshed' })
  })
})
