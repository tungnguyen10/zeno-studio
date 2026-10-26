import { withDatabaseContext, type ConnectionPool } from '../db/context'
import type { AlbumAccess } from '../albums/access'
import { requireCustomerDownload } from '../albums/download-policy'
import type { GoogleDriveAdapter } from '../photo-sources/google-drive'
import { StudioOperationError } from '../studios/error'
import { DOWNLOAD_LIMITS } from './limits'
import { signDownloadTicket, type DownloadPlanKind, type DownloadTicket } from './ticket'

export type PlannedFile = { photoId: string; filename: string; mimeType: string; sizeBytes: number }
export type PartitionLimits = { maxFiles: number; maxBytes: number }

export function partitionFiles(files: PlannedFile[], limits: PartitionLimits): PlannedFile[][] {
  if (!files.length || !Number.isInteger(limits.maxFiles) || limits.maxFiles < 1 ||
    !Number.isInteger(limits.maxBytes) || limits.maxBytes < 1 ||
    files.some(file => !Number.isSafeInteger(file.sizeBytes) || file.sizeBytes < 0)) throw new Error('Danh sách tải không hợp lệ')
  const parts: PlannedFile[][] = []
  let part: PlannedFile[] = []
  let bytes = 0
  for (const file of files) {
    if (part.length && (part.length >= limits.maxFiles || bytes + file.sizeBytes > limits.maxBytes)) {
      parts.push(part)
      part = []
      bytes = 0
    }
    part.push(file)
    bytes += file.sizeBytes
    if (file.sizeBytes > limits.maxBytes) {
      parts.push(part)
      part = []
      bytes = 0
    }
  }
  if (part.length) parts.push(part)
  return parts
}

export type DownloadPlanRequest = { kind: DownloadPlanKind; photoIds?: string[] }
export type DownloadPlanPart = {
  index: number; format: 'file' | 'zip'; filename: string; count: number; byteLength: number;
  photoIds: string[]; ticket: string; fileTickets: Array<{ photoId: string; ticket: string }>
}
export type DownloadPlan = { kind: DownloadPlanKind; cycle: number; totalFiles: number; totalBytes: number;
  parts: DownloadPlanPart[]; unavailable: Array<{ photoId: string; reason: string }> }

type CatalogRow = { id: string; source_file_id: string; resource_key: string | null; filename: string;
  mime_type: string; source_size_bytes: string | number | null; status: string }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function parseDownloadPlanRequest(input: unknown): DownloadPlanRequest {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new StudioOperationError('Yêu cầu tải không hợp lệ', 400)
  const body = input as Record<string, unknown>
  if (!['selected', 'basket', 'all'].includes(String(body.kind)) ||
    Object.keys(body).some(key => !['kind', 'photoIds'].includes(key)) ||
    (body.kind !== 'basket' && body.photoIds !== undefined)) throw new StudioOperationError('Yêu cầu tải không hợp lệ', 400)
  if (body.kind === 'basket') {
    if (!Array.isArray(body.photoIds) || body.photoIds.length < 1 || body.photoIds.length > DOWNLOAD_LIMITS.maxPlanFiles ||
      body.photoIds.some(id => typeof id !== 'string' || !uuid.test(id)) ||
      new Set(body.photoIds).size !== body.photoIds.length) throw new StudioOperationError('Danh sách ảnh tải không hợp lệ', 400)
    return { kind: 'basket', photoIds: body.photoIds as string[] }
  }
  return { kind: body.kind as 'selected' | 'all' }
}

function knownSize(value: string | number | null): number | null {
  if (value === null) return null
  const number = Number(value)
  return Number.isSafeInteger(number) && number >= 0 ? number : null
}

export async function createDownloadPlan(pool: ConnectionPool, access: AlbumAccess, source: GoogleDriveAdapter, request: DownloadPlanRequest): Promise<DownloadPlan> {
  const parsed = parseDownloadPlanRequest(request)
  const secret = process.env.NUXT_DOWNLOAD_TICKET_SECRET
  if (!secret || secret.length < 32) throw new StudioOperationError('Máy chủ chưa cấu hình vé tải ảnh', 503)
  const capabilities = await requireCustomerDownload(pool, access, parsed.kind === 'all' ? 'all' : 'selected')
  const catalog = await withDatabaseContext(pool, {
    albumId: access.albumId, scope: access.scope, participantId: access.participantId ?? undefined,
  }, async client => {
    const album = await client.query<{ current_cycle: number }>('SELECT current_cycle FROM albums WHERE id = $1', [access.albumId])
    if (!album.rows[0]) throw new StudioOperationError('Album không còn truy cập được', 410)
    const cycle = album.rows[0].current_cycle
    let rows: CatalogRow[]
    if (parsed.kind === 'all') {
      rows = (await client.query<CatalogRow>(`SELECT id, source_file_id, resource_key, filename, mime_type, source_size_bytes, status
        FROM photos WHERE album_id = $1 ORDER BY sort_order, id`, [access.albumId])).rows
    } else if (parsed.kind === 'basket') {
      const found = (await client.query<CatalogRow>(`SELECT id, source_file_id, resource_key, filename, mime_type, source_size_bytes, status
        FROM photos WHERE album_id = $1 AND id = ANY($2::uuid[])`, [access.albumId, parsed.photoIds])).rows
      const map = new Map(found.map(row => [row.id, row]))
      if (found.length !== parsed.photoIds!.length) throw new StudioOperationError('Ảnh không thuộc album', 404)
      rows = parsed.photoIds!.map(id => map.get(id)!)
    } else if (capabilities.selectedSource === 'live') {
      rows = (await client.query<CatalogRow>(`SELECT p.id, p.source_file_id, p.resource_key, p.filename, p.mime_type, p.source_size_bytes, p.status
        FROM photos p JOIN selections s ON s.photo_id = p.id
        JOIN selection_lists l ON l.id = s.list_id JOIN selection_rounds r ON r.id = l.round_id
        WHERE p.album_id = $1 AND l.kind = 'shared' AND r.cycle = $2 ORDER BY p.sort_order, p.id`, [access.albumId, cycle])).rows
    } else {
      rows = (await client.query<CatalogRow>(`SELECT p.id, p.source_file_id, p.resource_key, p.filename, p.mime_type, p.source_size_bytes, p.status
        FROM photos p JOIN selection_version_items i ON i.photo_id = p.id
        JOIN selection_versions v ON v.id = i.selection_version_id
        WHERE p.album_id = $1 AND v.cycle = $2 ORDER BY p.sort_order, p.id`, [access.albumId, cycle])).rows
    }
    return { cycle, rows }
  })
  if (catalog.rows.length > DOWNLOAD_LIMITS.maxPlanFiles) throw new StudioOperationError('Album có quá nhiều ảnh cho một lượt tải', 413)
  const files: PlannedFile[] = []
  const unavailable: DownloadPlan['unavailable'] = []
  for (const row of catalog.rows) {
    if (row.status !== 'READY') { unavailable.push({ photoId: row.id, reason: 'Ảnh không còn khả dụng' }); continue }
    let sizeBytes = knownSize(row.source_size_bytes)
    let filename = row.filename
    let mimeType = row.mime_type
    if (sizeBytes === null) {
      try {
        const metadata = await source.getOriginalMetadata(row.source_file_id, row.resource_key ?? undefined)
        sizeBytes = metadata.sizeBytes
        filename = metadata.filename
        mimeType = metadata.mimeType
      } catch { unavailable.push({ photoId: row.id, reason: 'Không lấy được ảnh gốc từ Drive' }); continue }
    }
    if (sizeBytes === null) { unavailable.push({ photoId: row.id, reason: 'Drive không cung cấp kích thước ảnh' }); continue }
    files.push({ photoId: row.id, filename, mimeType, sizeBytes })
  }
  if (!files.length) throw new StudioOperationError('Không có ảnh khả dụng để tải', 422)
  const totalBytes = files.reduce((sum, file) => sum + file.sizeBytes, 0)
  const shareAllowed = files.length <= DOWNLOAD_LIMITS.shareMaxFiles && totalBytes <= DOWNLOAD_LIMITS.shareMaxBytes
  const now = Math.floor(Date.now() / 1000)
  const base = { v: 1 as const, albumId: access.albumId, cycle: catalog.cycle, kind: parsed.kind,
    issuedAt: now, expiresAt: now + DOWNLOAD_LIMITS.ticketSeconds }
  const parts = partitionFiles(files, DOWNLOAD_LIMITS).map((part, index): DownloadPlanPart => {
    const byteLength = part.reduce((sum, file) => sum + file.sizeBytes, 0)
    const format = part.length === 1 && part[0]!.sizeBytes > DOWNLOAD_LIMITS.maxBytes ? 'file' : 'zip'
    const ticket = signDownloadTicket({ ...base, format, photoIds: part.map(file => file.photoId), part: index }, secret)
    const fileTickets = shareAllowed ? part.map(file => ({ photoId: file.photoId,
      ticket: signDownloadTicket({ ...base, format: 'file', photoIds: [file.photoId], part: index }, secret) })) : []
    return { index, format, filename: format === 'file' ? part[0]!.filename : `album-${access.albumId.slice(0, 8)}-${String(index + 1).padStart(3, '0')}.zip`,
      count: part.length, byteLength, photoIds: part.map(file => file.photoId), ticket, fileTickets }
  })
  return { kind: parsed.kind, cycle: catalog.cycle, totalFiles: files.length, totalBytes, parts, unavailable }
}

export { DOWNLOAD_LIMITS }
