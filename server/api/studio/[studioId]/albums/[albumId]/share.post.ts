import { getAppPool } from '../../../../../db/pool'
import { createAlbumShareLink } from '../../../../../albums/album'
import { albumIdParam } from '../../../../../utils/album-api'
import { requireVerifiedDriveSource } from '../../../../../utils/drive-gate'
import { requireStudioUser } from '../../../../../utils/require-studio-user'
import { studioApi, studioIdParam } from '../../../../../utils/studio-api'

export default defineEventHandler(async event => {
  const user = await requireStudioUser(event)
  const studioId = studioIdParam(event)
  const albumId = albumIdParam(event)
  requireVerifiedDriveSource()
  setHeader(event, 'cache-control', 'no-store')
  return studioApi(() => createAlbumShareLink(getAppPool(), studioId, user.id, albumId))
})
