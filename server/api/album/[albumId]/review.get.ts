import { getAppPool } from '../../../db/pool'
import { getCustomerReview } from '../../../albums/production'
import { requireAlbumAccess } from '../../../utils/album-api'
import { studioApi } from '../../../utils/studio-api'

export default defineEventHandler(async event => {
  const access = await requireAlbumAccess(event)
  setHeader(event, 'cache-control', 'no-store')
  return { review: await studioApi(() => getCustomerReview(getAppPool(), access)) }
})
