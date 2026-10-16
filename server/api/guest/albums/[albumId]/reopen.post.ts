import { getAppPool } from '../../../../db/pool'
import { reopenManagedSelection } from '../../../../albums/selection'
import { guestManager, guestNoStore } from '../../../../utils/guest-api'
import { studioApi } from '../../../../utils/studio-api'

export default defineEventHandler(async event => {
  guestNoStore(event)
  const manager = guestManager(event)
  return studioApi(() => reopenManagedSelection(getAppPool(), manager, manager.albumId))
})
