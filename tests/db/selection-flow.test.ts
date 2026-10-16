import { afterAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { createAlbum, publishAlbum } from '../../server/albums/album'
import { joinAlbum, listAlbumPhotos, resolveAlbumAccess } from '../../server/albums/access'
import { getSelectionState, setPhotoSelection, savePhotoNote, finalizeStudioSelection, reopenStudioSelection, getSelectionResults } from '../../server/albums/selection'
import { getStudioAlbumWorkspace } from '../../server/albums/workspace'
import { ensureStudio } from '../../server/studios/studio'
import { withDatabaseContext } from '../../server/db/context'
import type { PhotoSourceAdapter } from '../../server/photo-sources/photo-source'

const db = await PGlite.create()
for (const name of ['000_auth.sql', '001_core.sql', '002_workflow.sql', '003_rls.sql', '004_expiry.sql', '005_album_owner_guard.sql', '006_auth_column_names.sql', '007_studio_membership_context.sql', '008_studio_invitations.sql', '009_studio_bootstrap_guard.sql', '010_album_source_details.sql', '011_album_token_access.sql', '012_selection_cycles.sql', '013_participant_rls.sql', '016_photo_thumbnails.sql']) {
  await db.exec(await readFile(new URL(`../../db/migrations/${name}`, import.meta.url), 'utf8'))
}
await db.exec('SET ROLE app_runtime')
const pool = { async connect() { return { query: (sql: string, values?: unknown[]) => db.query(sql, values), release() {} } } }
afterAll(async () => { await db.close() })
const source: PhotoSourceAdapter = {
  async listPhotos() { return { items: [{ id: 'photo-a', filename: 'A.JPG', mimeType: 'image/jpeg' }, { id: 'photo-b', filename: 'B.JPG', mimeType: 'image/jpeg' }] } },
  async readPhoto() { return new Response() },
}

describe('selection workflow', () => {
  it('saves with versions, keeps independent notes, snapshots, and reopens a new cycle', async () => {
    const studio = await ensureStudio(pool, 'selection-owner', 'Selection Studio')
    const album = await createAlbum(pool, source, { studioId: studio.id, userId: 'selection-owner', title: 'Wedding', folderUrl: 'https://drive.google.com/drive/folders/folder123', expiresInDays: 15, limit: { kind: 'exact', count: 1 } })
    const { customerToken } = await publishAlbum(pool, studio.id, 'selection-owner', album.id)
    const joined = await joinAlbum(pool, (await resolveAlbumAccess(pool, customerToken))!, 'Lan')
    const access = (await resolveAlbumAccess(pool, joined.token))!
    const photos = (await listAlbumPhotos(pool, access)).items
    const first = await setPhotoSelection(pool, access, photos[0]!.id, true, 0)
    expect(first).toMatchObject({ status: 'saved', version: 1, selected: true, count: 1 })
    expect((await setPhotoSelection(pool, access, photos[0]!.id, false, 0)).status).toBe('conflict')
    expect((await setPhotoSelection(pool, access, photos[1]!.id, true, 1)).status).toBe('limit_reached')
    const note = await savePhotoNote(pool, access, photos[0]!.id, 'Chỉnh sáng', 0)
    expect(note).toMatchObject({ status: 'saved', version: 1 })
    expect((await savePhotoNote(pool, access, photos[0]!.id, 'Khác', 0)).status).toBe('conflict')
    expect((await getSelectionState(pool, access)).selectedPhotoIds).toEqual([photos[0]!.id])
    const finalized = await finalizeStudioSelection(pool, studio.id, 'selection-owner', album.id)
    expect(finalized.versionNumber).toBe(1)
    expect((await getSelectionResults(pool, studio.id, 'selection-owner', album.id)).items).toMatchObject([
      { photoId: photos[0]!.id, filename: 'A.JPG', notes: [{ participant: 'Lan', text: 'Chỉnh sáng' }] },
    ])
    await reopenStudioSelection(pool, studio.id, 'selection-owner', album.id)
    expect((await getSelectionState(pool, access)).selectedPhotoIds).toEqual([])
    expect((await getSelectionResults(pool, studio.id, 'selection-owner', album.id)).versionNumber).toBe(1)
  })

  it('keeps voting lists per participant and lets the studio choose the final set', async () => {
    const studio = await ensureStudio(pool, 'vote-owner', 'Vote Studio')
    const album = await createAlbum(pool, source, { studioId: studio.id, userId: 'vote-owner', title: 'Vote', folderUrl: 'https://drive.google.com/drive/folders/folder456', expiresInDays: 15, limit: { kind: 'exact', count: 1 }, collaborationMode: 'voting' })
    const { customerToken } = await publishAlbum(pool, studio.id, 'vote-owner', album.id)
    const customer = (await resolveAlbumAccess(pool, customerToken))!
    const lan = (await resolveAlbumAccess(pool, (await joinAlbum(pool, customer, 'Lan')).token))!
    const minh = (await resolveAlbumAccess(pool, (await joinAlbum(pool, customer, 'Minh')).token))!
    const photos = (await listAlbumPhotos(pool, lan)).items
    expect((await setPhotoSelection(pool, lan, photos[0]!.id, true, 0)).status).toBe('saved')
    expect((await setPhotoSelection(pool, lan, photos[1]!.id, true, 1)).status).toBe('saved')
    expect((await setPhotoSelection(pool, minh, photos[1]!.id, true, 0)).status).toBe('saved')
    await savePhotoNote(pool, lan, photos[0]!.id, 'Lan note', 0)
    await savePhotoNote(pool, minh, photos[0]!.id, 'Minh note', 0)
    const visible = await withDatabaseContext(pool, { albumId: album.id, scope: 'customer', participantId: lan.participantId! },
      client => client.query<{ body: string }>('SELECT body FROM photo_notes WHERE album_id = $1 ORDER BY body', [album.id]))
    expect(visible.rows.map(row => row.body)).toEqual(['Lan note'])
    const roundWrite = await withDatabaseContext(pool, { albumId: album.id, scope: 'customer', participantId: lan.participantId! },
      client => client.query<{ id: string }>("UPDATE selection_rounds SET status = 'CLOSED' WHERE album_id = $1 RETURNING id", [album.id]))
    expect(roundWrite.rows).toEqual([])
    await expect(withDatabaseContext(pool, { albumId: album.id, scope: 'customer', participantId: lan.participantId! },
      client => client.query('INSERT INTO photo_notes (album_id, photo_id, participant_id, body) VALUES ($1, $2, $3, $4)',
        [album.id, photos[1]!.id, minh.participantId, 'forged']))).rejects.toThrow()
    expect((await getSelectionState(pool, minh)).selectedPhotoIds).toEqual([photos[1]!.id])
    const workspace = await getStudioAlbumWorkspace(pool, studio.id, 'vote-owner', album.id)
    expect(workspace.photos.find(photo => photo.id === photos[1]!.id)?.selectedBy).toEqual(['Lan', 'Minh'])
    expect((await finalizeStudioSelection(pool, studio.id, 'vote-owner', album.id, [photos[1]!.id])).count).toBe(1)
    expect((await getSelectionResults(pool, studio.id, 'vote-owner', album.id)).items[0]?.filename).toBe('B.JPG')
  })
})
