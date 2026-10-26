import { getAppPool } from '../../../../../db/pool'
import { requireCustomerDownload } from '../../../../../albums/download-policy'
import { contentDisposition } from '../../../../../downloads/names'
import { originalSourceError, resolveOriginal } from '../../../../../downloads/original'
import { albumIdParam, requireAlbumAccess } from '../../../../../utils/album-api'
import { requireVerifiedDriveSource } from '../../../../../utils/drive-gate'
import { studioApi } from '../../../../../utils/studio-api'

export default defineEventHandler(async event => {
  albumIdParam(event)
  const photoId = getRouterParam(event, 'photoId')
  if (!photoId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(photoId)) {
    throw createError({ statusCode: 400, statusMessage: 'Photo ID không hợp lệ' })
  }
  const access = await requireAlbumAccess(event)
  return studioApi(async () => {
    await requireCustomerDownload(getAppPool(), access, 'single')
    const source = requireVerifiedDriveSource()
    const original = await resolveOriginal(getAppPool(), access, photoId, source)
    let response: Response
    try { response = await source.readPhoto(original.sourceFileId, original.resourceKey) }
    catch (error) { throw originalSourceError(error) }
    return new Response(response.body, { status: 200, headers: {
      'content-type': original.metadata.mimeType,
      'content-disposition': contentDisposition(original.metadata.filename),
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    } })
  })
})
