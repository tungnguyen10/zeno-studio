import { getAppPool } from '../../../../db/pool'
import { deleteDraftAlbum } from '../../../../albums/album'
import { albumIdParam } from '../../../../utils/album-api'
import { requireStudioUser } from '../../../../utils/require-studio-user'
import { studioApi, studioIdParam } from '../../../../utils/studio-api'

export default defineEventHandler(async event => {
  const user = await requireStudioUser(event)
  const studioId = studioIdParam(event)
  const albumId = albumIdParam(event)
  await studioApi(() => deleteDraftAlbum(getAppPool(), studioId, user.id, albumId))
  setHeader(event, 'cache-control', 'no-store')
  return { ok: true }
})
