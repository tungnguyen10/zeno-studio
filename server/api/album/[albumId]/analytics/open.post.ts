import { getAppPool } from '../../../../db/pool'
import { withDatabaseContext } from '../../../../db/context'
import { requireAlbumAccess } from '../../../../utils/album-api'

export default defineEventHandler(async event => {
  setHeader(event, 'cache-control', 'no-store')
  const access = await requireAlbumAccess(event)
  if (!['customer', 'participant', 'finalizer'].includes(access.scope)) {
    throw createError({ statusCode: 403, statusMessage: 'Không có quyền mở gallery' })
  }
  if (getCookie(event, 'zeno_analytics_consent') !== 'accepted') {
    throw createError({ statusCode: 403, statusMessage: 'Chưa đồng ý thống kê lượt xem' })
  }
  const config = useRuntimeConfig(event).public
  if (String(config.ga4Enabled) !== 'true' || String(config.studioGalleryAnalyticsEnabled) !== 'true') {
    throw createError({ statusCode: 404, statusMessage: 'Thống kê lượt mở chưa được bật' })
  }
  try {
    await withDatabaseContext(getAppPool(), {
      albumId: access.albumId, participantId: access.participantId ?? undefined, scope: access.scope,
    }, client => client.query('SELECT app_private.record_gallery_open($1)', [access.albumId]))
  } catch (cause) {
    if ((cause as { code?: string }).code === '22023') throw createError({ statusCode: 429, statusMessage: 'Quá nhiều lượt mở album' })
    throw cause
  }
  setResponseStatus(event, 204)
  return null
})
