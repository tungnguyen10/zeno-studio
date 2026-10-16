import { getAppPool } from '../../../../db/pool'
import { listManagedAlbumPhotos } from '../../../../albums/workspace'
import { readPhotoPageQuery } from '../../../../albums/photo-page'
import { guestManager, guestNoStore } from '../../../../utils/guest-api'
import { studioApi } from '../../../../utils/studio-api'

export default defineEventHandler(async event => {
  guestNoStore(event)
  const manager = guestManager(event)
  return studioApi(async () => listManagedAlbumPhotos(getAppPool(), manager, manager.albumId, readPhotoPageQuery(getQuery(event), 120)))
})
