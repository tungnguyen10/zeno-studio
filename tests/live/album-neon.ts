import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { createAlbum, publishAlbum } from '../../server/albums/album'
import { joinAlbum, listAlbumPhotos, resolveAlbumAccess } from '../../server/albums/access'
import { finalizeStudioSelection, getSelectionResults, getSelectionState, reopenStudioSelection, savePhotoNote, setPhotoSelection } from '../../server/albums/selection'
import { ensureStudio } from '../../server/studios/studio'
import type { PhotoSourceAdapter } from '../../server/photo-sources/photo-source'
import { hashAccessToken } from '../../server/security/access-token'

const pooledUrl = process.env.NUXT_DATABASE_TEST_URL
const directUrl = process.env.NUXT_DATABASE_TEST_DIRECT_URL
if (!pooledUrl || !directUrl || !new URL(pooledUrl).hostname.includes('-pooler')) throw new Error('Neon dev pooled and direct test URLs are required')
const runtime = new Pool({ connectionString: pooledUrl, max: 4 })
const owner = new Pool({ connectionString: directUrl, max: 1 })
const actor = `album-live-${randomUUID()}`
let studioId: string | undefined
const source: PhotoSourceAdapter = {
  async listPhotos() { return { items: [{ id: 'neon-a', filename: 'Ảnh A.JPG', mimeType: 'image/jpeg' }, { id: 'neon-b', filename: 'Ảnh B.JPG', mimeType: 'image/jpeg' }] } },
  async readPhoto() { return new Response() },
}

async function main() {
  try {
    const studio = await ensureStudio(runtime, actor, 'Album Neon test')
    studioId = studio.id
    const album = await createAlbum(runtime, source, { studioId, userId: actor, title: 'Album thử', folderUrl: 'https://drive.google.com/drive/folders/folder123', expiresInDays: 15, limit: { kind: 'exact', count: 1 } })
    const { customerToken } = await publishAlbum(runtime, studioId, actor, album.id)
    const joined = await joinAlbum(runtime, (await resolveAlbumAccess(runtime, customerToken))!)
    const access = (await resolveAlbumAccess(runtime, joined.token))!
    const photos = (await listAlbumPhotos(runtime, access)).items
    if (photos.length !== 2) throw new Error('Photo catalog incomplete')
    const saved = await setPhotoSelection(runtime, access, photos[0]!.id, true, 0)
    if (saved.status !== 'saved' || saved.version !== 1) throw new Error('Selection save failed')
    if ((await setPhotoSelection(runtime, access, photos[1]!.id, true, 1)).status !== 'limit_reached') throw new Error('Selection limit not enforced')
    if ((await savePhotoNote(runtime, access, photos[0]!.id, 'Chỉnh màu', 0)).status !== 'saved') throw new Error('Note save failed')
    if ((await finalizeStudioSelection(runtime, studioId, actor, album.id)).versionNumber !== 1) throw new Error('Finalize failed')
    const results = await getSelectionResults(runtime, studioId, actor, album.id)
    if (results.items[0]?.filename !== 'Ảnh A.JPG' || results.items[0].notes[0]?.text !== 'Chỉnh màu') throw new Error('Snapshot content missing')
    await reopenStudioSelection(runtime, studioId, actor, album.id)
    if ((await getSelectionState(runtime, access)).selectedPhotoIds.length) throw new Error('New cycle retained selections')
    if ((await getSelectionResults(runtime, studioId, actor, album.id)).versionNumber !== 1) throw new Error('Old snapshot lost')
    const concurrent = await Promise.all([
      setPhotoSelection(runtime, access, photos[0]!.id, true, 0),
      setPhotoSelection(runtime, access, photos[1]!.id, true, 0),
    ])
    if (concurrent.filter(result => result.status === 'saved').length !== 1 || concurrent.filter(result => result.status === 'conflict').length !== 1) throw new Error('Concurrent selection version lock failed')
    const concurrentNotes = await Promise.all([
      savePhotoNote(runtime, access, photos[0]!.id, 'Bản A', 1),
      savePhotoNote(runtime, access, photos[0]!.id, 'Bản B', 1),
    ])
    if (concurrentNotes.filter(result => result.status === 'saved').length !== 1 || concurrentNotes.filter(result => result.status === 'conflict').length !== 1) throw new Error('Concurrent note version lock failed')
    const revoked = await owner.query('UPDATE album_tokens SET revoked_at = now() WHERE token_hash = $1', [hashAccessToken(joined.token)])
    if (revoked.rowCount !== 1) throw new Error('Token revocation fixture failed')
    if (await resolveAlbumAccess(runtime, joined.token)) throw new Error('Revoked token still resolves')
    process.stdout.write('Neon pooled album, concurrent saves, snapshots and revocation passed\n')
  } finally {
    if (studioId) await owner.query('DELETE FROM studios WHERE id = $1', [studioId])
    await runtime.end()
    await owner.end()
  }
}

main().catch(error => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1 })
