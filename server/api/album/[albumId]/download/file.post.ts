import { getAppPool } from '../../../../db/pool'
import { contentDisposition } from '../../../../downloads/names'
import { originalSourceError } from '../../../../downloads/original'
import { enforceDownloadRate } from '../../../../downloads/rate-limit'
import { readDownloadTicketBody } from '../../../../downloads/request'
import { authorizeDownloadTicket } from '../../../../downloads/transfer'
import { albumIdParam, requireAlbumAccess } from '../../../../utils/album-api'
import { requireVerifiedDriveSource } from '../../../../utils/drive-gate'
import { studioApi } from '../../../../utils/studio-api'

export default defineEventHandler(async event => {
  albumIdParam(event)
  const access = await requireAlbumAccess(event)
  return studioApi(async () => {
    const ticket = await readDownloadTicketBody(event)
    await enforceDownloadRate(event, getAppPool(), access)
    const source = requireVerifiedDriveSource()
    const verified = await authorizeDownloadTicket(getAppPool(), access, source, ticket, 'file')
    const file = verified.files[0]!
    let response: Response
    try { response = await source.readPhoto(file.sourceFileId, file.resourceKey) }
    catch (error) { throw originalSourceError(error) }
    return new Response(response.body, { status: 200, headers: {
      'content-type': file.mimeType,
      'content-disposition': contentDisposition(file.filename),
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    } })
  })
})
