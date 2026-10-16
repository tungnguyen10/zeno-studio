import { getAppPool } from '../../../../db/pool'
import { getManagedSelectionResults } from '../../../../albums/selection'
import { guestManager, guestNoStore } from '../../../../utils/guest-api'
import { resultPageQuery } from '../../../../utils/result-export'
import { studioApi } from '../../../../utils/studio-api'

export default defineEventHandler(async event => {
  guestNoStore(event)
  const manager = guestManager(event)
  const page = resultPageQuery(event)
  return studioApi(() => getManagedSelectionResults(getAppPool(), manager, manager.albumId, page))
})
