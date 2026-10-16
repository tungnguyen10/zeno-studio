import { getAppPool } from '../../../../../db/pool'
import { getSelectionResults } from '../../../../../albums/selection'
import { albumIdParam } from '../../../../../utils/album-api'
import { resultPageQuery } from '../../../../../utils/result-export'
import { requireStudioUser } from '../../../../../utils/require-studio-user'
import { studioApi, studioIdParam } from '../../../../../utils/studio-api'

export default defineEventHandler(async event => {
  const user = await requireStudioUser(event)
  const studioId = studioIdParam(event)
  const albumId = albumIdParam(event)
  const page = resultPageQuery(event)
  setHeader(event, 'cache-control', 'no-store')
  return studioApi(() => getSelectionResults(getAppPool(), studioId, user.id, albumId, page))
})
