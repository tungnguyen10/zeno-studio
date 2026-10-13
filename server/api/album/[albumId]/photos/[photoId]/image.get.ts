import { getAppPool } from '../../../../../db/pool'
import { withDatabaseContext } from '../../../../../db/context'
import { albumIdParam, requireAlbumAccess } from '../../../../../utils/album-api'
import { requireVerifiedDriveSource } from '../../../../../utils/drive-gate'

export default defineEventHandler(async event => {
  const albumId = albumIdParam(event)
  const access = await requireAlbumAccess(event)
  const photoId = getRouterParam(event, 'photoId')
  if (!photoId || !/^[0-9a-f-]{36}$/i.test(photoId)) throw createError({ statusCode: 400, statusMessage: 'Photo ID không hợp lệ' })
  const source = requireVerifiedDriveSource()
  const photo = await withDatabaseContext(getAppPool(), { albumId, scope: access.scope }, async client => {
    const result = await client.query<{ source_file_id: string; resource_key: string | null; status: string }>(
      'SELECT source_file_id, resource_key, status FROM photos WHERE id = $1 AND album_id = $2', [photoId, albumId])
    return result.rows[0]
  })
  if (!photo || photo.status === 'MISSING') throw createError({ statusCode: 404, statusMessage: 'Ảnh không còn khả dụng' })
  try {
    const response = await source.readPhoto(photo.source_file_id, photo.resource_key ?? undefined)
    return new Response(response.body, {
      status: 200,
      headers: { 'content-type': response.headers.get('content-type') || 'image/jpeg', 'cache-control': 'private, max-age=60' },
    })
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Không tải được ảnh từ Google Drive' })
  }
})
