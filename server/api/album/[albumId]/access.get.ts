import { getAppPool } from '../../../db/pool'
import { getAlbumOverview } from '../../../albums/access'
import { requireAlbumAccess } from '../../../utils/album-api'

export default defineEventHandler(async event => {
  const access = await requireAlbumAccess(event)
  setHeader(event, 'cache-control', 'no-store')
  return { album: await getAlbumOverview(getAppPool(), access) }
})
