import { afterAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { createAlbum, publishAlbum } from '../../server/albums/album'
import { getAlbumOverview, joinAlbum, listAlbumPhotos, resolveAlbumAccess } from '../../server/albums/access'
import { ensureStudio } from '../../server/studios/studio'
import type { PhotoSourceAdapter } from '../../server/photo-sources/photo-source'

const db = await PGlite.create()
for (const name of ['000_auth.sql', '001_core.sql', '002_workflow.sql', '003_rls.sql', '004_expiry.sql', '005_album_owner_guard.sql', '006_auth_column_names.sql', '007_studio_membership_context.sql', '008_studio_invitations.sql', '009_studio_bootstrap_guard.sql', '010_album_source_details.sql', '011_album_token_access.sql', '012_selection_cycles.sql', '013_participant_rls.sql', '016_photo_thumbnails.sql', '019_shared_customer_participant.sql', '021_album_download.sql', '022_album_download_public_settings.sql']) {
  await db.exec(await readFile(new URL(`../../db/migrations/${name}`, import.meta.url), 'utf8'))
}
await db.exec('SET ROLE app_runtime')
const pool = { async connect() { return { query: (sql: string, values?: unknown[]) => db.query(sql, values), release() {} } } }
afterAll(async () => { await db.close() })
const source: PhotoSourceAdapter = {
  async listPhotos() { return { items: Array.from({ length: 3 }, (_, index) => ({ id: `source-${index}`, filename: `${index}.JPG`, mimeType: 'image/jpeg' })) } },
  async readPhoto() { return new Response() },
}

describe('customer album access', () => {
  it('resolves a published token, pages photos, and issues a participant token', async () => {
    const studio = await ensureStudio(pool, 'gallery-owner', 'Gallery Studio')
    const album = await createAlbum(pool, source, { studioId: studio.id, userId: 'gallery-owner', title: 'Gallery', folderUrl: 'https://drive.google.com/drive/folders/folder123', expiresInDays: 15, limit: { kind: 'unlimited' } })
    expect(await resolveAlbumAccess(pool, 'invalid')).toBeNull()
    const { customerToken } = await publishAlbum(pool, studio.id, 'gallery-owner', album.id)
    const access = await resolveAlbumAccess(pool, customerToken)
    expect(access).toEqual({ albumId: album.id, scope: 'customer', participantId: null })
    expect(await getAlbumOverview(pool, access!)).toMatchObject({ joined: false, canJoin: true, settings: { limitKind: 'unlimited' } })
    const first = await listAlbumPhotos(pool, access!, 2)
    expect(first.items.map(item => item.filename)).toEqual(['0.JPG', '1.JPG'])
    expect(first.nextCursor).toBeTruthy()
    const second = await listAlbumPhotos(pool, access!, 2, first.nextCursor!)
    expect(second.items.map(item => item.filename)).toEqual(['2.JPG'])
    const joined = await joinAlbum(pool, access!)
    const participant = await resolveAlbumAccess(pool, joined.token)
    expect(participant).toMatchObject({ albumId: album.id, scope: 'customer' })
    expect(participant!.participantId).toBeTruthy()
    expect(await getAlbumOverview(pool, participant!)).toMatchObject({ joined: true, canJoin: false })
    const otherDevice = await resolveAlbumAccess(pool, (await joinAlbum(pool, access!)).token)
    expect(otherDevice!.participantId).toBe(participant!.participantId)
  })
})
