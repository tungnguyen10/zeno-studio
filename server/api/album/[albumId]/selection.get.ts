import { getAppPool } from '../../../db/pool'
import { getSelectionState } from '../../../albums/selection'
import { requireAlbumAccess } from '../../../utils/album-api'
import { studioApi } from '../../../utils/studio-api'

export default defineEventHandler(async event => {
  const access = await requireAlbumAccess(event)
  const since = getQuery(event).since
  const known = typeof since === 'string' && /^\d{1,9}$/.test(since) ? Number(since) : undefined
  if (since !== undefined && known === undefined) throw createError({ statusCode: 400, statusMessage: 'Phiên bản không hợp lệ' })
  setHeader(event, 'cache-control', 'no-store')
  return studioApi(() => getSelectionState(getAppPool(), access, known))
})
