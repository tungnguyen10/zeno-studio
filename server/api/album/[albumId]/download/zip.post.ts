import { getAppPool } from '../../../../db/pool'
import { contentDisposition } from '../../../../downloads/names'
import { enforceDownloadRate } from '../../../../downloads/rate-limit'
import { readDownloadTicketBody } from '../../../../downloads/request'
import { authorizeDownloadTicket } from '../../../../downloads/transfer'
import { createStoredZip } from '../../../../downloads/zip'
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
    const verified = await authorizeDownloadTicket(getAppPool(), access, source, ticket, 'zip')
    const abort = new AbortController()
    event.node.res.once('close', () => abort.abort())
    const stream = createStoredZip(verified.files.map(file => ({
      name: file.filename, sizeBytes: file.sizeBytes,
      open: async () => {
        const response = await source.readPhoto(file.sourceFileId, file.resourceKey)
        if (!response.body) throw new Error('Google Drive không trả về ảnh gốc')
        return response.body
      },
    })), abort.signal)
    return new Response(stream, { status: 200, headers: {
      'content-type': 'application/zip',
      'content-disposition': contentDisposition(`album-${access.albumId.slice(0, 8)}-${String(verified.ticket.part + 1).padStart(3, '0')}.zip`),
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    } })
  })
})
