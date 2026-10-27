import { afterAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { createAlbum, publishAlbum } from '../../server/albums/album'
import { joinAlbum, listAlbumPhotos, resolveAlbumAccess } from '../../server/albums/access'
import { getPhotoNote, getSelectionState, setPhotoSelection, savePhotoNote, finalizeStudioSelection, reopenStudioSelection, getSelectionResults } from '../../server/albums/selection'
import { getStudioAlbumWorkspace, listManagedAlbumPhotos } from '../../server/albums/workspace'
import { ensureStudio } from '../../server/studios/studio'
import { withDatabaseContext } from '../../server/db/context'
import type { PhotoSourceAdapter } from '../../server/photo-sources/photo-source'

const db = await PGlite.create()
for (const name of ['000_auth.sql', '001_core.sql', '002_workflow.sql', '003_rls.sql', '004_expiry.sql', '005_album_owner_guard.sql', '006_auth_column_names.sql', '007_studio_membership_context.sql', '008_studio_invitations.sql', '009_studio_bootstrap_guard.sql', '010_album_source_details.sql', '011_album_token_access.sql', '012_selection_cycles.sql', '013_participant_rls.sql', '016_photo_thumbnails.sql', '017_guest_albums.sql', '019_shared_customer_participant.sql', '021_album_download.sql']) {
  await db.exec(await readFile(new URL(`../../db/migrations/${name}`, import.meta.url), 'utf8'))
}
await db.exec(await readFile(new URL('../../db/migrations/025_studio_analytics.sql', import.meta.url), 'utf8'))
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
    const joined = await joinAlbum(pool, (await resolveAlbumAccess(pool, customerToken))!)
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
      { photoId: photos[0]!.id, filename: 'A.JPG', notes: [{ text: 'Chỉnh sáng' }] },
    ])
    await reopenStudioSelection(pool, studio.id, 'selection-owner', album.id)
    expect((await getSelectionState(pool, access)).selectedPhotoIds).toEqual([photos[0]!.id])
    expect((await getSelectionResults(pool, studio.id, 'selection-owner', album.id)).versionNumber).toBe(1)
    expect(await getPhotoNote(pool, access, photos[0]!.id)).toEqual({ body: 'Chỉnh sáng', version: 1 })
    await savePhotoNote(pool, access, photos[0]!.id, 'Chỉnh màu', 1)
    expect((await finalizeStudioSelection(pool, studio.id, 'selection-owner', album.id)).versionNumber).toBe(2)
    expect((await getSelectionResults(pool, studio.id, 'selection-owner', album.id)).items[0]?.notes).toEqual([{ text: 'Chỉnh màu' }])
    const current = await getSelectionResults(pool, studio.id, 'selection-owner', album.id)
    expect(current.notesCount).toBe(1)
    expect(current.selectionVersionId).toMatch(/^[0-9a-f-]{36}$/i)
    const frozen = await getSelectionResults(pool, studio.id, 'selection-owner', album.id, { limit: 100, versionId: (await withDatabaseContext(pool, { studioId: studio.id, userId: 'selection-owner', scope: 'member' }, client => client.query<{ id: string }>('SELECT id FROM selection_versions WHERE album_id = $1 AND version_number = 1', [album.id]))).rows[0]!.id })
    expect(frozen).toMatchObject({ versionNumber: 1, notesCount: 1, items: [{ filename: 'A.JPG', notes: [{ text: 'Chỉnh sáng' }] }] })
    const original = await withDatabaseContext(pool, { studioId: studio.id, userId: 'selection-owner', scope: 'member' }, client =>
      client.query<{ notes: { text: string }[] }>(`SELECT i.notes FROM selection_version_items i JOIN selection_versions v ON v.id = i.selection_version_id
        WHERE v.album_id = $1 AND v.version_number = 1`, [album.id]))
    expect(original.rows[0]?.notes).toEqual([{ text: 'Chỉnh sáng' }])
  })

  it('shares one selection list and note across devices using the same customer link', async () => {
    const studio = await ensureStudio(pool, 'shared-owner', 'Shared Studio')
    const album = await createAlbum(pool, source, { studioId: studio.id, userId: 'shared-owner', title: 'Shared', folderUrl: 'https://drive.google.com/drive/folders/folder456', expiresInDays: 15, limit: { kind: 'unlimited' } })
    const { customerToken } = await publishAlbum(pool, studio.id, 'shared-owner', album.id)
    const customer = (await resolveAlbumAccess(pool, customerToken))!
    const phone = (await resolveAlbumAccess(pool, (await joinAlbum(pool, customer)).token))!
    const laptop = (await resolveAlbumAccess(pool, (await joinAlbum(pool, customer)).token))!
    expect(laptop.participantId).toBe(phone.participantId)
    const photos = (await listAlbumPhotos(pool, phone)).items
    expect((await setPhotoSelection(pool, phone, photos[0]!.id, true, 0)).status).toBe('saved')
    expect((await getSelectionState(pool, laptop)).selectedPhotoIds).toEqual([photos[0]!.id])
    expect((await setPhotoSelection(pool, laptop, photos[1]!.id, true, 1)).status).toBe('saved')
    expect((await getSelectionState(pool, phone)).selectedPhotoIds).toEqual([photos[0]!.id, photos[1]!.id])
    await savePhotoNote(pool, phone, photos[0]!.id, 'Từ điện thoại', 0)
    expect(await getPhotoNote(pool, laptop, photos[0]!.id)).toEqual({ body: 'Từ điện thoại', version: 1 })
    const roundWrite = await withDatabaseContext(pool, { albumId: album.id, scope: 'customer', participantId: phone.participantId! },
      client => client.query<{ id: string }>("UPDATE selection_rounds SET status = 'CLOSED' WHERE album_id = $1 RETURNING id", [album.id]))
    expect(roundWrite.rows).toEqual([])
    const workspace = await getStudioAlbumWorkspace(pool, studio.id, 'shared-owner', album.id)
    expect(workspace).toMatchObject({ photoCount: 2, selectedCount: 2 })
    const selectedPage = await listAlbumPhotos(pool, laptop, 1, undefined, 'selected')
    expect(selectedPage).toMatchObject({ total: 2, selectedCount: 2 })
    expect(selectedPage.items.map(photo => photo.selected)).toEqual([true])
    expect(selectedPage.nextCursor).toBeTruthy()
    const state = await getSelectionState(pool, phone)
    expect(await getSelectionState(pool, phone, state.version)).toEqual({ version: state.version })
    await finalizeStudioSelection(pool, studio.id, 'shared-owner', album.id)
    const filteredResult = await getSelectionResults(pool, studio.id, 'shared-owner', album.id, { search: 'A.JPG' })
    expect(filteredResult.items).toHaveLength(1)
    const entireSnapshot = await getSelectionResults(pool, studio.id, 'shared-owner', album.id, { versionId: filteredResult.selectionVersionId })
    expect(entireSnapshot.items.map(item => item.filename)).toEqual(['A.JPG', 'B.JPG'])
    expect(entireSnapshot.items[0]?.notes).toEqual([{ text: 'Từ điện thoại' }])
    const manager = { kind: 'member' as const, studioId: studio.id, userId: 'shared-owner' }
    const previousFirst = await listManagedAlbumPhotos(pool, manager, album.id, { limit: 1, filter: 'previous' })
    expect(previousFirst.items).toHaveLength(1)
    expect(previousFirst.nextCursor).toBeTruthy()
    const previousSecond = await listManagedAlbumPhotos(pool, manager, album.id, { limit: 1, cursor: previousFirst.nextCursor!, filter: 'previous' })
    expect(previousSecond.items).toHaveLength(1)
    expect(previousSecond.items[0]?.id).not.toBe(previousFirst.items[0]?.id)
    expect(previousSecond.nextCursor).toBeNull()
  })

  it('pages and filters managed photos and finalizes with include/exclude adjustments', async () => {
    const studio = await ensureStudio(pool, 'adjust-owner', 'Adjust Studio')
    const album = await createAlbum(pool, source, { studioId: studio.id, userId: 'adjust-owner', title: 'Adjust', folderUrl: 'https://drive.google.com/drive/folders/folderadj', expiresInDays: 15, limit: { kind: 'unlimited' } })
    const { customerToken } = await publishAlbum(pool, studio.id, 'adjust-owner', album.id)
    const access = (await resolveAlbumAccess(pool, (await joinAlbum(pool, (await resolveAlbumAccess(pool, customerToken))!)).token))!
    const photos = (await listAlbumPhotos(pool, access)).items
    await setPhotoSelection(pool, access, photos[0]!.id, true, 0)
    const manager = { kind: 'member' as const, studioId: studio.id, userId: 'adjust-owner' }
    const page = await listManagedAlbumPhotos(pool, manager, album.id, { limit: 10, filter: 'selected' })
    expect(page.items.map(photo => photo.id)).toEqual([photos[0]!.id])
    const priorVersion = (await getSelectionState(pool, access)).version
    await expect(finalizeStudioSelection(pool, studio.id, 'adjust-owner', album.id, { include: ['not-a-uuid'] })).rejects.toMatchObject({ statusCode: 400 })
    const finalized = await finalizeStudioSelection(pool, studio.id, 'adjust-owner', album.id, { include: [photos[1]!.id], exclude: [photos[0]!.id] })
    expect(finalized.count).toBe(1)
    const firstPage = await getSelectionResults(pool, studio.id, 'adjust-owner', album.id, { limit: 1 })
    expect(firstPage).toMatchObject({ total: 1, nextCursor: null })
    expect(firstPage.items.map(item => item.photoId)).toEqual([photos[1]!.id])
    expect(await getStudioAlbumWorkspace(pool, studio.id, 'adjust-owner', album.id))
      .toMatchObject({ previousCount: 1 })
    await reopenStudioSelection(pool, studio.id, 'adjust-owner', album.id)
    const reopened = await getSelectionState(pool, access, priorVersion)
    expect(reopened.version).toBeGreaterThan(priorVersion)
    expect(reopened.selectedPhotoIds).toEqual([photos[1]!.id])
    const previousPage = await listManagedAlbumPhotos(pool, manager, album.id, { limit: 10, filter: 'previous' })
    expect(previousPage.items.map(photo => photo.id)).toEqual([photos[1]!.id])
    expect(previousPage.items[0]).toMatchObject({ selected: true, previouslyFinalized: true })
    await setPhotoSelection(pool, access, photos[1]!.id, false, reopened.version)
    const changed = await setPhotoSelection(pool, access, photos[0]!.id, true, reopened.version + 1)
    expect(changed.status).toBe('saved')
    expect((await listManagedAlbumPhotos(pool, manager, album.id, { limit: 10, filter: 'previous' })).items[0])
      .toMatchObject({ selected: false, previouslyFinalized: true })
    expect((await finalizeStudioSelection(pool, studio.id, 'adjust-owner', album.id)).versionNumber).toBe(2)
    expect((await getSelectionResults(pool, studio.id, 'adjust-owner', album.id)).items.map(item => item.photoId)).toEqual([photos[0]!.id])
    const priorItems = await withDatabaseContext(pool, { studioId: studio.id, userId: 'adjust-owner', scope: 'member' }, client =>
      client.query<{ photo_id: string }>(`SELECT i.photo_id FROM selection_version_items i JOIN selection_versions v ON v.id = i.selection_version_id
        WHERE v.album_id = $1 AND v.version_number = 1`, [album.id]))
    expect(priorItems.rows.map(row => row.photo_id)).toEqual([photos[1]!.id])
  })

  it('only accepts notes on selected photos, keeps them hidden after unselect, and snapshots only selected notes', async () => {
    const studio = await ensureStudio(pool, 'note-owner', 'Note Studio')
    const album = await createAlbum(pool, source, { studioId: studio.id, userId: 'note-owner', title: 'Notes', folderUrl: 'https://drive.google.com/drive/folders/folder789', expiresInDays: 15, limit: { kind: 'unlimited' } })
    const { customerToken } = await publishAlbum(pool, studio.id, 'note-owner', album.id)
    const access = (await resolveAlbumAccess(pool, (await joinAlbum(pool, (await resolveAlbumAccess(pool, customerToken))!)).token))!
    const photos = (await listAlbumPhotos(pool, access)).items
    await expect(savePhotoNote(pool, access, photos[0]!.id, 'Chưa chọn', 0)).rejects.toMatchObject({ statusCode: 409 })
    await setPhotoSelection(pool, access, photos[0]!.id, true, 0)
    await setPhotoSelection(pool, access, photos[1]!.id, true, 1)
    expect((await savePhotoNote(pool, access, photos[0]!.id, 'Chỉnh sáng', 0)).status).toBe('saved')
    expect((await savePhotoNote(pool, access, photos[1]!.id, 'Chỉnh da', 0)).status).toBe('saved')
    await setPhotoSelection(pool, access, photos[0]!.id, false, 2)
    await expect(savePhotoNote(pool, access, photos[0]!.id, 'Sau khi bỏ chọn', 1)).rejects.toMatchObject({ statusCode: 409 })
    expect(await getPhotoNote(pool, access, photos[0]!.id)).toEqual({ body: 'Chỉnh sáng', version: 1 })
    await setPhotoSelection(pool, access, photos[0]!.id, true, 3)
    expect((await savePhotoNote(pool, access, photos[0]!.id, 'Chỉnh sáng hơn', 1)).status).toBe('saved')
    await setPhotoSelection(pool, access, photos[0]!.id, false, 4)
    await finalizeStudioSelection(pool, studio.id, 'note-owner', album.id, { include: [photos[0]!.id] })
    const results = (await getSelectionResults(pool, studio.id, 'note-owner', album.id)).items
    expect(results.find(item => item.photoId === photos[0]!.id)?.notes).toEqual([])
    expect(results.find(item => item.photoId === photos[1]!.id)?.notes).toEqual([{ text: 'Chỉnh da' }])
  })
})
