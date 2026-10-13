import { getAppPool } from '../../../db/pool'
import { listAlbumPhotos } from '../../../albums/access'
import { requireAlbumAccess } from '../../../utils/album-api'
import { studioApi } from '../../../utils/studio-api'

export default defineEventHandler(async event => {
  const access = await requireAlbumAccess(event)
  const query = getQuery(event)
  const cursor = typeof query.cursor === 'string' ? query.cursor : undefined
  const requestedSize = typeof query.limit === 'string' ? Number(query.limit) : 60
  setHeader(event, 'cache-control', 'no-store')
  return studioApi(() => listAlbumPhotos(getAppPool(), access, requestedSize, cursor))
})
