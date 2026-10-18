import { getAppPool } from '../../../../../../../db/pool'
import { withManagedAlbum } from '../../../../../../../albums/manager'
import { albumIdParam } from '../../../../../../../utils/album-api'
import { requireVerifiedDriveSource } from '../../../../../../../utils/drive-gate'
import { requireStudioUser } from '../../../../../../../utils/require-studio-user'
import { studioApi, studioIdParam } from '../../../../../../../utils/studio-api'

export default defineEventHandler(async event => {
  const user = await requireStudioUser(event)
  const studioId = studioIdParam(event)
  const albumId = albumIdParam(event)
  const photoId = getRouterParam(event, 'photoId')
  if (!photoId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(photoId)) throw createError({ statusCode: 400, statusMessage: 'Photo ID không hợp lệ' })
  const photo = await studioApi(() => withManagedAlbum(getAppPool(), { kind: 'member', studioId, userId: user.id }, albumId, 'album.view', async client => {
    const found = await client.query<{ source_file_id: string; resource_key: string | null; status: string; thumbnail_url: string | null; thumbnail_checked_at: Date | null }>(
      'SELECT source_file_id, resource_key, status, thumbnail_url, thumbnail_checked_at FROM photos WHERE album_id = $1 AND id = $2', [albumId, photoId])
    return found.rows[0]
  }))
  if (!photo || photo.status === 'MISSING') throw createError({ statusCode: 404, statusMessage: 'Ảnh không còn khả dụng' })
  const source = requireVerifiedDriveSource()
  try {
    const recent = photo.thumbnail_checked_at && new Date(photo.thumbnail_checked_at).getTime() > Date.now() - 60 * 60 * 1000
    const thumbnail = await source.readThumbnail(photo.source_file_id, photo.resource_key ?? undefined, recent ? photo.thumbnail_url ?? undefined : undefined)
    return new Response(thumbnail.response.body, { headers: { 'content-type': thumbnail.response.headers.get('content-type') || 'image/jpeg', 'cache-control': 'private, max-age=60', 'x-content-type-options': 'nosniff' } })
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Không tải được ảnh từ Google Drive' })
  }
})
