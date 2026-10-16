import { getAppPool } from '../../../../db/pool'
import { finalizeManagedSelection } from '../../../../albums/selection'
import { readFinalizeBody } from '../../../../utils/finalize-body'
import { guestManager, guestNoStore } from '../../../../utils/guest-api'
import { studioApi } from '../../../../utils/studio-api'

export default defineEventHandler(async event => {
  guestNoStore(event)
  const manager = guestManager(event)
  const adjustments = await readFinalizeBody(event)
  return studioApi(() => finalizeManagedSelection(getAppPool(), manager, manager.albumId, adjustments))
})
