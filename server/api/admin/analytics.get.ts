import { requirePlatformAdmin } from '../../analytics/platform-admin'
import { Ga4UpstreamError } from '../../analytics/ga4-report'
import { getCachedSiteReport, parseSiteReportDays } from '../../analytics/site-report'

export default defineEventHandler(async event => {
  await requirePlatformAdmin(event)
  let days: 7 | 30 | 90
  try { days = parseSiteReportDays(getQuery(event).days) }
  catch { throw createError({ statusCode: 400, statusMessage: 'Khoảng ngày không hợp lệ' }) }
  const config = useRuntimeConfig(event)
  if (!config.ga4PropertyId || !config.ga4PropertyTimezone || !config.ga4ServiceAccountJson) {
    throw createError({ statusCode: 503, statusMessage: 'Báo cáo GA4 chưa được cấu hình' })
  }
  setHeader(event, 'cache-control', 'private, no-store')
  try {
    return { report: await getCachedSiteReport({
      propertyId: config.ga4PropertyId,
      propertyTimezone: config.ga4PropertyTimezone,
      serviceAccountJson: config.ga4ServiceAccountJson,
    }, days) }
  } catch (error) {
    if (error instanceof Ga4UpstreamError && error.status === 429) {
      throw createError({ statusCode: 503, statusMessage: 'GA4 đang giới hạn truy vấn, vui lòng thử lại' })
    }
    throw createError({ statusCode: 502, statusMessage: 'Không tải được báo cáo GA4' })
  }
})
