import { getAppPool } from '../../../db/pool'
import { listAlbumPhotos } from '../../../albums/access'
import { readPhotoPageQuery } from '../../../albums/photo-page'
import { requireAlbumAccess } from '../../../utils/album-api'
import { studioApi } from '../../../utils/studio-api'

export default defineEventHandler(async event => {
  const access = await requireAlbumAccess(event)
  setHeader(event, 'cache-control', 'no-store')
  return studioApi(async () => {
    const options = readPhotoPageQuery(getQuery(event))
    return listAlbumPhotos(getAppPool(), access, options.limit, options.cursor, options.filter)
  })
})
