import { getAppPool } from '../../../../../db/pool'
import { listManagedAlbumPhotos } from '../../../../../albums/workspace'
import { readPhotoPageQuery } from '../../../../../albums/photo-page'
import { albumIdParam } from '../../../../../utils/album-api'
import { requireStudioUser } from '../../../../../utils/require-studio-user'
import { studioApi, studioIdParam } from '../../../../../utils/studio-api'

export default defineEventHandler(async event => {
  const user = await requireStudioUser(event)
  const studioId = studioIdParam(event)
  const albumId = albumIdParam(event)
  setHeader(event, 'cache-control', 'no-store')
  return studioApi(async () => listManagedAlbumPhotos(getAppPool(), { kind: 'member', studioId, userId: user.id }, albumId, readPhotoPageQuery(getQuery(event), 120, true)))
})
