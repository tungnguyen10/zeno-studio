import { getAppPool } from '../../../db/pool'
import { getSelectionState } from '../../../albums/selection'
import { requireAlbumAccess } from '../../../utils/album-api'
import { studioApi } from '../../../utils/studio-api'

export default defineEventHandler(async event => {
  const access = await requireAlbumAccess(event)
  setHeader(event, 'cache-control', 'no-store')
  return studioApi(() => getSelectionState(getAppPool(), access))
})
