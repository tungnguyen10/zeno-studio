import { withDatabaseContext, type ConnectionPool } from '../db/context'
import { requireCustomerDownload } from '../albums/download-policy'
import type { AlbumAccess } from '../albums/access'
import type { GoogleDriveAdapter } from '../photo-sources/google-drive'
import { StudioOperationError } from '../studios/error'
import { DOWNLOAD_LIMITS } from './limits'
import { originalSourceError } from './original'
import { verifyDownloadTicket, type DownloadTicket } from './ticket'

export type VerifiedDownloadFile = {
  photoId: string; sourceFileId: string; resourceKey?: string;
  filename: string; mimeType: string; sizeBytes: number
}
export type VerifiedDownload = { ticket: DownloadTicket; files: VerifiedDownloadFile[] }

export async function authorizeDownloadTicket(
  pool: ConnectionPool, access: AlbumAccess, source: GoogleDriveAdapter,
  value: string, format: 'file' | 'zip',
): Promise<VerifiedDownload> {
  const secret = process.env.NUXT_DOWNLOAD_TICKET_SECRET
  if (!secret || secret.length < 32) throw new StudioOperationError('Máy chủ chưa cấu hình vé tải ảnh', 503)
  let ticket: DownloadTicket
  try { ticket = verifyDownloadTicket(value, secret) }
  catch { throw new StudioOperationError('Vé tải không hợp lệ hoặc đã hết hạn', 403) }
  if (ticket.albumId !== access.albumId || ticket.format !== format) throw new StudioOperationError('Vé tải không hợp lệ', 403)
  const capabilities = await requireCustomerDownload(pool, access, ticket.kind === 'all' ? 'all' : 'selected')
  const rows = await withDatabaseContext(pool, {
    albumId: access.albumId, scope: access.scope, participantId: access.participantId ?? undefined,
  }, async client => {
    const state = await client.query<{ current_cycle: number }>('SELECT current_cycle FROM albums WHERE id = $1', [access.albumId])
    if (state.rows[0]?.current_cycle !== ticket.cycle) throw new StudioOperationError('Vòng chọn đã thay đổi, hãy lập lại kế hoạch tải', 403)
    const found = await client.query<{ id: string; source_file_id: string; resource_key: string | null; status: string }>(
      `SELECT id, source_file_id, resource_key, status FROM photos
       WHERE album_id = $1 AND id = ANY($2::uuid[])`, [access.albumId, ticket.photoIds])
    if (found.rows.length !== ticket.photoIds.length || found.rows.some(row => row.status !== 'READY')) {
      throw new StudioOperationError('Ảnh không thuộc album hoặc không còn khả dụng', 404)
    }
    if (ticket.kind === 'selected') {
      const selected = capabilities.selectedSource === 'live'
        ? await client.query<{ id: string }>(`SELECT s.photo_id AS id FROM selections s
          JOIN selection_lists l ON l.id = s.list_id JOIN selection_rounds r ON r.id = l.round_id
          WHERE s.album_id = $1 AND l.kind = 'shared' AND r.cycle = $2`, [access.albumId, ticket.cycle])
        : await client.query<{ id: string }>(`SELECT i.photo_id AS id FROM selection_version_items i
          JOIN selection_versions v ON v.id = i.selection_version_id
          WHERE i.album_id = $1 AND v.cycle = $2`, [access.albumId, ticket.cycle])
      const allowed = new Set(selected.rows.map(row => row.id))
      if (ticket.photoIds.some(id => !allowed.has(id))) throw new StudioOperationError('Bộ ảnh đã chọn đã thay đổi, hãy lập lại kế hoạch tải', 403)
    }
    const map = new Map(found.rows.map(row => [row.id, row]))
    return ticket.photoIds.map(id => map.get(id)!)
  })
  const files: VerifiedDownloadFile[] = []
  for (const row of rows) {
    let metadata: Awaited<ReturnType<GoogleDriveAdapter['getOriginalMetadata']>>
    try { metadata = await source.getOriginalMetadata(row.source_file_id, row.resource_key ?? undefined) }
    catch (error) { throw originalSourceError(error) }
    if (metadata.sizeBytes === null) throw new StudioOperationError('Drive không cung cấp kích thước ảnh gốc', 422)
    files.push({ photoId: row.id, sourceFileId: row.source_file_id, resourceKey: row.resource_key ?? undefined,
      filename: metadata.filename, mimeType: metadata.mimeType, sizeBytes: metadata.sizeBytes })
  }
  if (format === 'zip' && (files.length > DOWNLOAD_LIMITS.maxFiles ||
    files.reduce((sum, file) => sum + file.sizeBytes, 0) > DOWNLOAD_LIMITS.maxBytes)) {
    throw new StudioOperationError('Ảnh gốc đã thay đổi kích thước, hãy lập lại kế hoạch tải', 409)
  }
  return { ticket, files }
}
