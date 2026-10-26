import { afterAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { withDatabaseContext } from '../../server/db/context'
import { createAlbum, publishAlbum } from '../../server/albums/album'
import { getAlbumOverview, joinAlbum, listAlbumPhotos, resolveAlbumAccess } from '../../server/albums/access'
import { requireCustomerDownload } from '../../server/albums/download-policy'
import { finalizeStudioSelection, reopenStudioSelection, setPhotoSelection } from '../../server/albums/selection'
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
  async listPhotos() { return { items: [{ id: 'download-photo-a', filename: 'A.JPG', mimeType: 'image/jpeg' }] } },
  async readPhoto() { return new Response() },
}

describe('customer download capabilities under RLS', () => {
  it('defaults off and requires the current cycle to be finalized', async () => {
    const studio = await ensureStudio(pool, 'download-owner', 'Download Studio')
    const album = await createAlbum(pool, source, { studioId: studio.id, userId: 'download-owner', title: 'Download', folderUrl: 'https://drive.google.com/drive/folders/folder123', expiresInDays: 15, limit: { kind: 'unlimited' } })
    const { customerToken } = await publishAlbum(pool, studio.id, 'download-owner', album.id)
    const customer = (await resolveAlbumAccess(pool, customerToken))!
    const access = (await resolveAlbumAccess(pool, (await joinAlbum(pool, customer)).token))!

    const privateSettings = await withDatabaseContext(pool, {
      albumId: access.albumId, scope: access.scope, participantId: access.participantId ?? undefined,
    }, client => client.query('SELECT * FROM album_settings WHERE album_id = $1', [album.id]))
    expect(privateSettings.rows).toEqual([])

    expect((await getAlbumOverview(pool, access)).download).toMatchObject({
      canSingle: false, canSelected: false, canAll: false, reason: 'disabled',
    })
    await expect(requireCustomerDownload(pool, access, 'single')).rejects.toMatchObject({ statusCode: 403 })

    await withDatabaseContext(pool, { studioId: studio.id, userId: 'download-owner', scope: 'member' }, client =>
      client.query(`UPDATE album_settings SET download_enabled = true, download_available_when = 'after_finalize'
        WHERE album_id = $1`, [album.id]))
    expect((await getAlbumOverview(pool, access)).download).toMatchObject({
      canSingle: false, canSelected: false, reason: 'waiting_for_finalize',
    })
    await expect(requireCustomerDownload(pool, access, 'single')).rejects.toMatchObject({ statusCode: 403 })

    const photo = (await listAlbumPhotos(pool, access)).items[0]!
    await setPhotoSelection(pool, access, photo.id, true, 0)
    await finalizeStudioSelection(pool, studio.id, 'download-owner', album.id)
    expect((await getAlbumOverview(pool, access)).download).toMatchObject({
      canSingle: true, canSelected: true, canAll: false, selectedSource: 'snapshot', selectedCount: 1,
    })
    await expect(requireCustomerDownload(pool, access, 'single')).resolves.toMatchObject({ canSingle: true })

    await reopenStudioSelection(pool, studio.id, 'download-owner', album.id)
    expect((await getAlbumOverview(pool, access)).download).toMatchObject({
      canSingle: false, canSelected: false, reason: 'waiting_for_finalize',
    })
    await expect(requireCustomerDownload(pool, access, 'selected')).rejects.toMatchObject({ statusCode: 403 })
  })
})
