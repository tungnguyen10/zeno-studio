import { getAppPool } from '../../../../db/pool'
import { listManagedProductionTasks } from '../../../../albums/production'
import { guestManager, guestNoStore } from '../../../../utils/guest-api'
import { studioApi } from '../../../../utils/studio-api'

export default defineEventHandler(async event => {
  guestNoStore(event)
  const manager = guestManager(event)
  return studioApi(() => listManagedProductionTasks(getAppPool(), manager, manager.albumId))
})
