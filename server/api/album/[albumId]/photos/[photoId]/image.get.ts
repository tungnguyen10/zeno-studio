import { getAppPool } from '../../../../../db/pool'
import { withDatabaseContext } from '../../../../../db/context'
import { albumIdParam, requireAlbumAccess } from '../../../../../utils/album-api'
import { requireVerifiedDriveSource } from '../../../../../utils/drive-gate'

export default defineEventHandler(async event => {
  const albumId = albumIdParam(event)
  const access = await requireAlbumAccess(event)
  const photoId = getRouterParam(event, 'photoId')
  if (!photoId || !/^[0-9a-f-]{36}$/i.test(photoId)) throw createError({ statusCode: 400, statusMessage: 'Photo ID không hợp lệ' })
  const variant = getQuery(event).variant
  if (variant !== undefined && variant !== 'thumbnail') throw createError({ statusCode: 400, statusMessage: 'Biến thể ảnh không hợp lệ' })
  const source = requireVerifiedDriveSource()
  const photo = await withDatabaseContext(getAppPool(), { albumId, scope: access.scope }, async client => {
    const result = await client.query<{ source_file_id: string; resource_key: string | null; status: string; thumbnail_url: string | null; thumbnail_checked_at: Date | null }>(
      'SELECT source_file_id, resource_key, status, thumbnail_url, thumbnail_checked_at FROM photos WHERE id = $1 AND album_id = $2', [photoId, albumId])
    return result.rows[0]
  })
  if (!photo || photo.status === 'MISSING') throw createError({ statusCode: 404, statusMessage: 'Ảnh không còn khả dụng' })
  let response: Response
  let refreshedLink: string | undefined
  try {
    if (variant === 'thumbnail') {
      const checkedAt = photo.thumbnail_checked_at ? new Date(photo.thumbnail_checked_at).getTime() : 0
      const cachedLink = checkedAt > Date.now() - 60 * 60 * 1000 ? photo.thumbnail_url ?? undefined : undefined
      const thumbnail = await source.readThumbnail(photo.source_file_id, photo.resource_key ?? undefined, cachedLink)
      response = thumbnail.response
      if (thumbnail.refreshed) refreshedLink = thumbnail.thumbnailLink
    } else {
      response = await source.readPhoto(photo.source_file_id, photo.resource_key ?? undefined)
    }
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Không tải được ảnh từ Google Drive' })
  }
  if (refreshedLink) {
    await withDatabaseContext(getAppPool(), { albumId, scope: access.scope }, async client => {
      await client.query('SELECT app_private.set_photo_thumbnail_cache($1, $2, $3)', [photoId, albumId, refreshedLink])
    })
  }
  return new Response(response.body, {
    status: 200,
    headers: { 'content-type': response.headers.get('content-type') || 'image/jpeg', 'cache-control': 'private, max-age=60', 'x-content-type-options': 'nosniff' },
  })
})
