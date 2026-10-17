import { randomUUID } from 'node:crypto'
import { withDatabaseContext, type ConnectionPool, type QueryClient } from '../db/context'
import { DriveSourceError, InvalidDriveFolderLinkError, parseGoogleDriveFolderLink } from '../photo-sources/google-drive'
import type { PhotoSourceAdapter, SourcePhoto } from '../photo-sources/photo-source'
import { issueAccessToken } from '../security/access-token'
import { StudioOperationError } from '../studios/error'
import { canPerform, type Role } from '../../shared/domain/workflow'
import type { SelectionLimit } from '../../shared/domain/selection'

export interface AlbumSummary {
  id: string
  title: string
  status: 'DRAFT' | 'PUBLISHED' | 'FINALIZED' | 'EXPIRED' | 'DELIVERED'
  expiresAt: Date
  photoCount: number
  // Customer's shared list in the current cycle; 0 when the caller's role cannot read selections.
  selectedCount: number
  // Upper bound of the selection limit, or null when there is none.
  selectionLimit: number | null
  latestVersionNumber: number | null
}

export interface CreateAlbumInput {
  studioId: string
  userId: string
  folderUrl: string
  title: string
  expiresInDays: 15 | 30
  limit: SelectionLimit
}

async function requireAlbumPermission(client: QueryClient, studioId: string, userId: string, action: 'album.create' | 'album.view' | 'album.publish'): Promise<void> {
  const result = await client.query<{ role: Role }>('SELECT role FROM studio_members WHERE studio_id = $1 AND user_id = $2', [studioId, userId])
  if (!result.rows[0] || !canPerform(result.rows[0].role, action)) throw new StudioOperationError('Không có quyền thao tác album', 403)
}

export function validateAlbumInput(input: Pick<CreateAlbumInput, 'title' | 'expiresInDays' | 'limit'>): void {
  if (!input.title.trim() || input.title.trim().length > 150) throw new StudioOperationError('Tên album phải dài 1–150 ký tự', 400)
  if (input.expiresInDays !== 15 && input.expiresInDays !== 30) throw new StudioOperationError('Hạn album phải là 15 hoặc 30 ngày', 400)
  const limit = input.limit
  if (!limit || !['unlimited', 'maximum', 'minimum', 'exact', 'range'].includes(limit.kind)) {
    throw new StudioOperationError('Giới hạn chọn không hợp lệ', 400)
  }
  if (limit.kind === 'unlimited') return
  if (limit.kind === 'range') {
    if (!Number.isInteger(limit.min) || !Number.isInteger(limit.max) || limit.min < 0 || limit.max < limit.min) throw new StudioOperationError('Giới hạn chọn không hợp lệ', 400)
  } else if (!Number.isInteger(limit.count) || limit.count < 0) throw new StudioOperationError('Giới hạn chọn không hợp lệ', 400)
}

export async function collectPhotos(source: PhotoSourceAdapter, folder: ReturnType<typeof parseGoogleDriveFolderLink>): Promise<SourcePhoto[]> {
  const photos: SourcePhoto[] = []
  const seenIds = new Set<string>()
  const seenPages = new Set<string>()
  let pageToken: string | undefined
  do {
    let page
    try { page = await source.listPhotos(folder, pageToken) }
    catch (error) {
      if (!(error instanceof DriveSourceError)) throw error
      const quotaReasons = new Set(['rateLimitExceeded', 'userRateLimitExceeded', 'dailyLimitExceeded', 'quotaExceeded', 'RESOURCE_EXHAUSTED'])
      if (error.status === 429 || (error.reason && quotaReasons.has(error.reason))) {
        throw new StudioOperationError('Google Drive đang giới hạn truy cập. Vui lòng thử lại sau.', 503)
      }
      if (error.reason?.startsWith('API_KEY_') || error.reason === 'SERVICE_DISABLED' || error.reason === 'accessNotConfigured') {
        throw new StudioOperationError('Không kết nối được Google Drive. Cấu hình API key cần được kiểm tra.', 503)
      }
      if (error.status === 403 || error.status === 404) {
        throw new StudioOperationError('Không đọc được thư mục Drive. Hãy kiểm tra quyền “Bất kỳ ai có đường liên kết” và thử lại.', 422)
      }
      if (error.status === 400 || error.status === 401) {
        throw new StudioOperationError('Không kết nối được Google Drive. Cấu hình API key cần được kiểm tra.', 503)
      }
      throw new StudioOperationError('Google Drive tạm thời không phản hồi. Vui lòng thử lại sau.', 502)
    }
    for (const photo of page.items) {
      if (!seenIds.has(photo.id)) { seenIds.add(photo.id); photos.push(photo) }
      if (photos.length > 10000) throw new StudioOperationError('Album vượt giới hạn 10.000 ảnh', 400)
    }
    pageToken = page.nextPageToken
    if (pageToken) {
      if (seenPages.has(pageToken)) throw new Error('Google Drive pagination token repeated')
      seenPages.add(pageToken)
    }
  } while (pageToken)
  if (!photos.length) throw new StudioOperationError('Thư mục Drive không có ảnh có thể sử dụng', 400)
  // Plain code-point order, matching migration 018 (COLLATE "C"); Drive returns files in no stable order.
  return photos.sort((a, b) => (a.filename < b.filename ? -1 : a.filename > b.filename ? 1 : 0))
}

export async function createAlbum(pool: ConnectionPool, source: PhotoSourceAdapter, input: CreateAlbumInput): Promise<AlbumSummary> {
  validateAlbumInput(input)
  let folder: ReturnType<typeof parseGoogleDriveFolderLink>
  try { folder = parseGoogleDriveFolderLink(input.folderUrl) }
  catch (error) {
    if (error instanceof InvalidDriveFolderLinkError) throw new StudioOperationError(error.message, 400)
    throw error
  }
  await withDatabaseContext(pool, { studioId: input.studioId, userId: input.userId, scope: 'member' },
    client => requireAlbumPermission(client, input.studioId, input.userId, 'album.create'))
  const photos = await collectPhotos(source, folder)
  const id = randomUUID()
  let expiresAt: Date
  await withDatabaseContext(pool, { studioId: input.studioId, userId: input.userId, scope: 'member' }, async client => {
    await requireAlbumPermission(client, input.studioId, input.userId, 'album.create')
    expiresAt = await insertAlbumRecords(client, input.studioId, id, folder, photos, input, false)
  })
  const limit = input.limit
  const selectionLimit = limit.kind === 'range' ? limit.max : limit.kind === 'maximum' || limit.kind === 'exact' ? limit.count : null
  return { id, title: input.title.trim(), status: 'DRAFT', expiresAt: expiresAt!, photoCount: photos.length, selectedCount: 0, selectionLimit, latestVersionNumber: null }
}

export async function insertAlbumRecords(
  client: QueryClient, studioId: string, albumId: string, folder: ReturnType<typeof parseGoogleDriveFolderLink>,
  photos: SourcePhoto[], input: Pick<CreateAlbumInput, 'title' | 'expiresInDays' | 'limit'>,
  published: boolean,
): Promise<Date> {
  const sourceId = randomUUID()
  const roundId = randomUUID()
  const expiresAt = new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
  const limit = input.limit
  const minimum = limit.kind === 'range' ? limit.min : limit.kind === 'minimum' || limit.kind === 'exact' ? limit.count : null
  const maximum = limit.kind === 'range' ? limit.max : limit.kind === 'maximum' || limit.kind === 'exact' ? limit.count : null
  await client.query('INSERT INTO albums (id, studio_id, title, status, expires_at, published_at) VALUES ($1, $2, $3, $4, $5, $6)',
    [albumId, studioId, input.title.trim(), published ? 'PUBLISHED' : 'DRAFT', expiresAt, published ? new Date() : null])
  await client.query(
    'INSERT INTO album_settings (album_id, limit_kind, limit_min, limit_max, duration_days) VALUES ($1, $2, $3, $4, $5)',
    [albumId, limit.kind, minimum, maximum, input.expiresInDays],
  )
  await client.query('INSERT INTO photo_sources (id, album_id, kind, folder_id, resource_key, sync_status, last_sync_at) VALUES ($1, $2, $3, $4, $5, $6, now())',
    [sourceId, albumId, 'google_drive', folder.folderId, folder.resourceKey ?? null, 'READY'])
  for (let start = 0; start < photos.length; start += 250) {
    const batch = photos.slice(start, start + 250)
    const values: unknown[] = []
    const placeholders = batch.map((photo, offset) => {
      const base = offset * 12
      values.push(randomUUID(), albumId, sourceId, photo.id, photo.filename, photo.mimeType,
        photo.resourceKey ?? null, photo.width ?? null, photo.height ?? null, start + offset,
        photo.thumbnailLink ?? null, photo.thumbnailLink ? new Date() : null)
      return `(${Array.from({ length: 12 }, (_, column) => `$${base + column + 1}`).join(', ')})`
    })
    await client.query(
      `INSERT INTO photos (id, album_id, source_id, source_file_id, filename, mime_type, resource_key, width, height, sort_order, thumbnail_url, thumbnail_checked_at) VALUES ${placeholders.join(', ')}`,
      values,
    )
  }
  await client.query('INSERT INTO selection_rounds (id, album_id, round_number) VALUES ($1, $2, 1)', [roundId, albumId])
  await client.query('INSERT INTO selection_lists (id, album_id, round_id, kind) VALUES ($1, $2, $3, $4)', [randomUUID(), albumId, roundId, 'shared'])
  return expiresAt
}

export async function getStudioAlbums(pool: ConnectionPool, studioId: string, userId: string): Promise<AlbumSummary[]> {
  return withDatabaseContext(pool, { studioId, userId, scope: 'member' }, async client => {
    await requireAlbumPermission(client, studioId, userId, 'album.view')
    const result = await client.query<{ id: string; title: string; status: AlbumSummary['status']; expires_at: Date; photo_count: number; selected_count: number; limit_max: number | null; latest_version: number | null }>(
      `SELECT a.id, a.title, a.status, a.expires_at,
         (SELECT count(*)::integer FROM photos p WHERE p.album_id = a.id) AS photo_count,
         (SELECT count(*)::integer FROM selections s
            JOIN selection_lists l ON l.id = s.list_id
            JOIN selection_rounds r ON r.id = l.round_id
          WHERE s.album_id = a.id AND l.kind = 'shared' AND r.round_number = 1 AND r.cycle = a.current_cycle) AS selected_count,
         st.limit_max,
         (SELECT max(v.version_number)::integer FROM selection_versions v WHERE v.album_id = a.id) AS latest_version
       FROM albums a LEFT JOIN album_settings st ON st.album_id = a.id
       WHERE a.studio_id = $1 ORDER BY a.created_at DESC`, [studioId])
    return result.rows.map(row => ({
      id: row.id, title: row.title, status: row.status, expiresAt: row.expires_at, photoCount: row.photo_count,
      selectedCount: row.selected_count, selectionLimit: row.limit_max, latestVersionNumber: row.latest_version,
    }))
  })
}

export async function publishAlbum(pool: ConnectionPool, studioId: string, userId: string, albumId: string): Promise<{ customerToken: string }> {
  return withDatabaseContext(pool, { studioId, userId, scope: 'member' }, async client => {
    await requireAlbumPermission(client, studioId, userId, 'album.publish')
    const album = await client.query<{ id: string; photo_count: number; duration_days: number }>(
      "SELECT a.id, s.duration_days, count(p.id)::integer AS photo_count FROM albums a JOIN album_settings s ON s.album_id = a.id LEFT JOIN photos p ON p.album_id = a.id WHERE a.id = $1 AND a.studio_id = $2 AND a.status = 'DRAFT' GROUP BY a.id, s.duration_days", [albumId, studioId])
    if (!album.rows[0]?.photo_count) throw new StudioOperationError('Album chưa có ảnh hoặc đã xuất bản', 409)
    const token = issueAccessToken()
    await client.query("UPDATE albums SET status = 'PUBLISHED', published_at = now(), expires_at = now() + ($1::integer * interval '1 day'), updated_at = now() WHERE id = $2", [album.rows[0].duration_days, albumId])
    await client.query('INSERT INTO album_tokens (id, album_id, scope, token_hash) VALUES ($1, $2, $3, $4)', [randomUUID(), albumId, 'customer', token.tokenHash])
    return { customerToken: token.token }
  })
}

export async function createAlbumShareLink(pool: ConnectionPool, studioId: string, userId: string, albumId: string): Promise<{ customerToken: string }> {
  return withDatabaseContext(pool, { studioId, userId, scope: 'member' }, async client => {
    await requireAlbumPermission(client, studioId, userId, 'album.publish')
    const album = await client.query<{ status: AlbumSummary['status']; active: boolean }>(
      'SELECT status, expires_at > now() AS active FROM albums WHERE id = $1 AND studio_id = $2 FOR UPDATE', [albumId, studioId])
    if (!album.rows[0]) throw new StudioOperationError('Album không tồn tại', 404)
    if (!album.rows[0].active || !['PUBLISHED', 'FINALIZED', 'DELIVERED'].includes(album.rows[0].status)) {
      throw new StudioOperationError('Album chưa xuất bản hoặc đã hết hạn', 409)
    }
    const token = issueAccessToken()
    await client.query('INSERT INTO album_tokens (id, album_id, scope, token_hash) VALUES ($1, $2, $3, $4)',
      [randomUUID(), albumId, 'customer', token.tokenHash])
    return { customerToken: token.token }
  })
}
