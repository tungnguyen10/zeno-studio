import { getAppPool } from '../../../../../../db/pool'
import { getSelectionResults } from '../../../../../../albums/selection'
import { albumIdParam } from '../../../../../../utils/album-api'
import { exportFormat, resultPageQuery, sendResultExport } from '../../../../../../utils/result-export'
import { requireStudioUser } from '../../../../../../utils/require-studio-user'
import { studioApi, studioIdParam } from '../../../../../../utils/studio-api'

export default defineEventHandler(async event => {
  const user = await requireStudioUser(event)
  const studioId = studioIdParam(event)
  const albumId = albumIdParam(event)
  const format = exportFormat(event)
  const versionId = resultPageQuery(event).versionId
  const results = await studioApi(() => getSelectionResults(getAppPool(), studioId, user.id, albumId, { versionId }))
  return sendResultExport(event, format, results)
})
