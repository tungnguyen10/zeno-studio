import { getAppPool } from '../../../db/pool'
import { joinAlbum } from '../../../albums/access'
import { albumIdParam, requireAlbumAccess, setAlbumCookie } from '../../../utils/album-api'
import { studioApi } from '../../../utils/studio-api'

export default defineEventHandler(async event => {
  const albumId = albumIdParam(event)
  const access = await requireAlbumAccess(event)
  const joined = await studioApi(() => joinAlbum(getAppPool(), access))
  setAlbumCookie(event, albumId, joined.token)
  setHeader(event, 'cache-control', 'no-store')
  return { joined: true }
})
