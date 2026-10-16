import { afterAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { createAlbum, publishAlbum } from '../../server/albums/album'
import { joinAlbum, resolveAlbumAccess, listAlbumPhotos } from '../../server/albums/access'
import { setPhotoSelection, finalizeStudioSelection } from '../../server/albums/selection'
import { completeDelivery, getCustomerReview, listProductionTasks, startReviewRound, submitCustomerReview, updateProductionTask } from '../../server/albums/production'
import { ensureStudio } from '../../server/studios/studio'
import type { PhotoSourceAdapter } from '../../server/photo-sources/photo-source'

const db = await PGlite.create()
for (const name of ['000_auth.sql', '001_core.sql', '002_workflow.sql', '003_rls.sql', '004_expiry.sql', '005_album_owner_guard.sql', '006_auth_column_names.sql', '007_studio_membership_context.sql', '008_studio_invitations.sql', '009_studio_bootstrap_guard.sql', '010_album_source_details.sql', '011_album_token_access.sql', '012_selection_cycles.sql', '013_participant_rls.sql', '014_review_delivery.sql', '015_review_policy_lockdown.sql', '016_photo_thumbnails.sql']) {
  await db.exec(await readFile(new URL(`../../db/migrations/${name}`, import.meta.url), 'utf8'))
}
await db.exec('SET ROLE app_runtime')
const pool = { async connect() { return { query: (sql: string, values?: unknown[]) => db.query(sql, values), release() {} } } }
afterAll(async () => { await db.close() })
const source: PhotoSourceAdapter = { async listPhotos() { return { items: [{ id: 'edit-a', filename: 'A.JPG', mimeType: 'image/jpeg' }] } }, async readPhoto() { return new Response() } }

describe('production, review, and delivery', () => {
  it('tracks revision rounds and delivers only the approved snapshot', async () => {
    const studio = await ensureStudio(pool, 'production-owner', 'Production Studio')
    const album = await createAlbum(pool, source, { studioId: studio.id, userId: 'production-owner', title: 'Production', folderUrl: 'https://drive.google.com/drive/folders/folder123', expiresInDays: 15, limit: { kind: 'exact', count: 1 } })
    const { customerToken } = await publishAlbum(pool, studio.id, 'production-owner', album.id)
    const access = (await resolveAlbumAccess(pool, (await joinAlbum(pool, (await resolveAlbumAccess(pool, customerToken))!, 'Lan')).token))!
    const photo = (await listAlbumPhotos(pool, access)).items[0]!
    await setPhotoSelection(pool, access, photo.id, true, 0)
    await finalizeStudioSelection(pool, studio.id, 'production-owner', album.id)
    let task = (await listProductionTasks(pool, studio.id, 'production-owner', album.id)).items[0]!
    expect(task.status).toBe('PENDING')
    await expect(startReviewRound(pool, studio.id, 'production-owner', album.id, 'https://drive.google.com/drive/folders/edited')).rejects.toThrow()
    await updateProductionTask(pool, studio.id, 'production-owner', album.id, task.id, 'RETOUCHING')
    await updateProductionTask(pool, studio.id, 'production-owner', album.id, task.id, 'WAITING_REVIEW')
    expect((await startReviewRound(pool, studio.id, 'production-owner', album.id, 'https://drive.google.com/drive/folders/edited')).roundNumber).toBe(1)
    expect((await getCustomerReview(pool, access))?.status).toBe('WAITING_REVIEW')
    expect((await submitCustomerReview(pool, access, 'request_revision', 'Chỉnh sáng')).status).toBe('REVISION_REQUESTED')
    task = (await listProductionTasks(pool, studio.id, 'production-owner', album.id)).items[0]!
    expect(task.status).toBe('REVISION_REQUESTED')
    await updateProductionTask(pool, studio.id, 'production-owner', album.id, task.id, 'RETOUCHING')
    await updateProductionTask(pool, studio.id, 'production-owner', album.id, task.id, 'WAITING_REVIEW')
    expect((await startReviewRound(pool, studio.id, 'production-owner', album.id, 'https://drive.google.com/drive/folders/edited2')).roundNumber).toBe(2)
    expect((await submitCustomerReview(pool, access, 'approve', '')).status).toBe('APPROVED')
    expect((await completeDelivery(pool, studio.id, 'production-owner', album.id, 'https://drive.google.com/drive/folders/final')).versionNumber).toBe(1)
    task = (await listProductionTasks(pool, studio.id, 'production-owner', album.id)).items[0]!
    expect(task.status).toBe('DELIVERED')
  })
})
