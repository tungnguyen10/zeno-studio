import { getAppPool } from '../../../../db/pool'
import { getManagedSelectionResults } from '../../../../albums/selection'
import { guestManager, guestNoStore } from '../../../../utils/guest-api'
import { studioApi } from '../../../../utils/studio-api'

export default defineEventHandler(async event => {
  guestNoStore(event)
  const manager = guestManager(event)
  return studioApi(() => getManagedSelectionResults(getAppPool(), manager, manager.albumId))
})
