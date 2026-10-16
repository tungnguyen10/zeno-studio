import { getAppPool } from '../../../../db/pool'
import { getManagedAlbumWorkspace } from '../../../../albums/workspace'
import { guestManager, guestNoStore } from '../../../../utils/guest-api'
import { studioApi } from '../../../../utils/studio-api'

export default defineEventHandler(async event => {
  guestNoStore(event)
  const manager = guestManager(event)
  return studioApi(() => getManagedAlbumWorkspace(getAppPool(), manager, manager.albumId))
})
