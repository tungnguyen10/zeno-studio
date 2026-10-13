import { getAppPool } from '../../../db/pool'
import { getStudioAlbums } from '../../../albums/album'
import { requireStudioUser } from '../../../utils/require-studio-user'
import { studioApi, studioIdParam } from '../../../utils/studio-api'

export default defineEventHandler(async event => {
  const user = await requireStudioUser(event)
  const studioId = studioIdParam(event)
  return studioApi(async () => ({ albums: await getStudioAlbums(getAppPool(), studioId, user.id) }))
})
