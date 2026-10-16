import { getAppPool } from '../../../../../db/pool'
import { finalizeStudioSelection } from '../../../../../albums/selection'
import { albumIdParam } from '../../../../../utils/album-api'
import { readFinalizeBody } from '../../../../../utils/finalize-body'
import { requireStudioUser } from '../../../../../utils/require-studio-user'
import { studioApi, studioIdParam } from '../../../../../utils/studio-api'

export default defineEventHandler(async event => {
  const user = await requireStudioUser(event)
  const studioId = studioIdParam(event)
  const albumId = albumIdParam(event)
  const adjustments = await readFinalizeBody(event)
  return studioApi(() => finalizeStudioSelection(getAppPool(), studioId, user.id, albumId, adjustments))
})
