import { getAppPool } from '../../../../../db/pool'
import { getManagedSelectionResults } from '../../../../../albums/selection'
import { guestManager, guestNoStore } from '../../../../../utils/guest-api'
import { exportFormat, resultPageQuery, sendResultExport } from '../../../../../utils/result-export'
import { studioApi } from '../../../../../utils/studio-api'

export default defineEventHandler(async event => {
  guestNoStore(event)
  const manager = guestManager(event)
  const format = exportFormat(event)
  const versionId = resultPageQuery(event).versionId
  const results = await studioApi(() => getManagedSelectionResults(getAppPool(), manager, manager.albumId, { versionId }))
  return sendResultExport(event, format, results)
})
