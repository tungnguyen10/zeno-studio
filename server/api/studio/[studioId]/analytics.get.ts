import { getAppPool } from '../../../db/pool'
import { getStudioAnalytics } from '../../../analytics/studio-report'
import { parseSiteReportDays } from '../../../analytics/site-report'
import { requireStudioUser } from '../../../utils/require-studio-user'
import { studioApi, studioIdParam } from '../../../utils/studio-api'

export default defineEventHandler(async event => {
  const user = await requireStudioUser(event)
  const studioId = studioIdParam(event)
  let days: 7 | 30 | 90
  try { days = parseSiteReportDays(getQuery(event).days) }
  catch { throw createError({ statusCode: 400, statusMessage: 'Khoảng ngày không hợp lệ' }) }
  setHeader(event, 'cache-control', 'private, no-store')
  return { report: await studioApi(() => getStudioAnalytics(getAppPool(), studioId, user.id, days)) }
})
