import { randomUUID } from 'node:crypto'
import { withDatabaseContext, type ConnectionPool, type QueryClient } from '../db/context'
import { parseGoogleDriveFolderLink } from '../photo-sources/google-drive'
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
}

export interface CreateAlbumInput {
  studioId: string
  userId: string
  folderUrl: string
  title: string
  expiresInDays: 15 | 30
  limit: SelectionLimit
  collaborationMode?: 'shared' | 'individual' | 'voting'
  shortlistRounds?: 1 | 2
}

async function requireAlbumPermission(client: QueryClient, studioId: string, userId: string, action: 'album.create' | 'album.view' | 'album.publish'): Promise<void> {
  const result = await client.query<{ role: Role }>('SELECT role FROM studio_members WHERE studio_id = $1 AND user_id = $2', [studioId, userId])
  if (!result.rows[0] || !canPerform(result.rows[0].role, action)) throw new StudioOperationError('Không có quyền thao tác album', 403)
}

function validateInput(input: CreateAlbumInput): void {
  if (!input.title.trim() || input.title.trim().length > 150) throw new StudioOperationError('Tên album phải dài 1–150 ký tự', 400)
  if (input.expiresInDays !== 15 && input.expiresInDays !== 30) throw new StudioOperationError('Hạn album phải là 15 hoặc 30 ngày', 400)
  if (input.shortlistRounds !== undefined && input.shortlistRounds !== 1 && input.shortlistRounds !== 2) throw new StudioOperationError('Số vòng shortlist không hợp lệ', 400)
  if (input.collaborationMode && !['shared', 'individual', 'voting'].includes(input.collaborationMode)) throw new StudioOperationError('Chế độ cộng tác không hợp lệ', 400)
  const limit = input.limit
  if (limit.kind === 'unlimited') return
  if (limit.kind === 'range') {
    if (!Number.isInteger(limit.min) || !Number.isInteger(limit.max) || limit.min < 0 || limit.max < limit.min) throw new StudioOperationError('Giới hạn chọn không hợp lệ', 400)
  } else if (!Number.isInteger(limit.count) || limit.count < 0) throw new StudioOperationError('Giới hạn chọn không hợp lệ', 400)
}

async function collectPhotos(source: PhotoSourceAdapter, folder: ReturnType<typeof parseGoogleDriveFolderLink>): Promise<SourcePhoto[]> {
  const photos: SourcePhoto[] = []
  const seenIds = new Set<string>()
  const seenPages = new Set<string>()
  let pageToken: string | undefined
  do {
    const page = await source.listPhotos(folder, pageToken)
    for (const photo of page.items) {
      if (!seenIds.has(photo.id)) { seenIds.add(photo.id); photos.push(photo) }
      if (photos.length > 3000) throw new StudioOperationError('Album vượt giới hạn 3.000 ảnh của V1', 400)
    }
    pageToken = page.nextPageToken
    if (pageToken) {
      if (seenPages.has(pageToken)) throw new Error('Google Drive pagination token repeated')
      seenPages.add(pageToken)
    }
  } while (pageToken)
  if (!photos.length) throw new StudioOperationError('Thư mục Drive không có ảnh có thể sử dụng', 400)
  return photos
}

export async function createAlbum(pool: ConnectionPool, source: PhotoSourceAdapter, input: CreateAlbumInput): Promise<AlbumSummary> {
  validateInput(input)
  const folder = parseGoogleDriveFolderLink(input.folderUrl)
  await withDatabaseContext(pool, { studioId: input.studioId, userId: input.userId, scope: 'member' },
    client => requireAlbumPermission(client, input.studioId, input.userId, 'album.create'))
  const photos = await collectPhotos(source, folder)
  const id = randomUUID()
  const sourceId = randomUUID()
  const roundId = randomUUID()
  const expiresAt = new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
  const limit = input.limit
  const minimum = limit.kind === 'range' ? limit.min : limit.kind === 'minimum' || limit.kind === 'exact' ? limit.count : null
  const maximum = limit.kind === 'range' ? limit.max : limit.kind === 'maximum' || limit.kind === 'exact' ? limit.count : null
  await withDatabaseContext(pool, { studioId: input.studioId, userId: input.userId, scope: 'member' }, async client => {
    await requireAlbumPermission(client, input.studioId, input.userId, 'album.create')
    await client.query('INSERT INTO albums (id, studio_id, title, expires_at) VALUES ($1, $2, $3, $4)', [id, input.studioId, input.title.trim(), expiresAt])
    await client.query(
      'INSERT INTO album_settings (album_id, limit_kind, limit_min, limit_max, collaboration_mode, shortlist_rounds, duration_days) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [id, limit.kind, minimum, maximum, input.collaborationMode ?? 'shared', input.shortlistRounds ?? 1, input.expiresInDays],
    )
    await client.query('INSERT INTO photo_sources (id, album_id, kind, folder_id, resource_key, sync_status, last_sync_at) VALUES ($1, $2, $3, $4, $5, $6, now())',
      [sourceId, id, 'google_drive', folder.folderId, folder.resourceKey ?? null, 'READY'])
    for (let index = 0; index < photos.length; index++) {
      const photo = photos[index]!
      await client.query(
        'INSERT INTO photos (id, album_id, source_id, source_file_id, filename, mime_type, resource_key, width, height, sort_order) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
        [randomUUID(), id, sourceId, photo.id, photo.filename, photo.mimeType, photo.resourceKey ?? null, photo.width ?? null, photo.height ?? null, index],
      )
    }
    await client.query('INSERT INTO selection_rounds (id, album_id, round_number) VALUES ($1, $2, 1)', [roundId, id])
    if ((input.collaborationMode ?? 'shared') === 'shared') {
      await client.query('INSERT INTO selection_lists (id, album_id, round_id, kind) VALUES ($1, $2, $3, $4)', [randomUUID(), id, roundId, 'shared'])
    }
  })
  return { id, title: input.title.trim(), status: 'DRAFT', expiresAt, photoCount: photos.length }
}

export async function getStudioAlbums(pool: ConnectionPool, studioId: string, userId: string): Promise<AlbumSummary[]> {
  return withDatabaseContext(pool, { studioId, userId, scope: 'member' }, async client => {
    await requireAlbumPermission(client, studioId, userId, 'album.view')
    const result = await client.query<{ id: string; title: string; status: AlbumSummary['status']; expires_at: Date; photo_count: number }>(
      'SELECT a.id, a.title, a.status, a.expires_at, count(p.id)::integer AS photo_count FROM albums a LEFT JOIN photos p ON p.album_id = a.id WHERE a.studio_id = $1 GROUP BY a.id ORDER BY a.created_at DESC', [studioId])
    return result.rows.map(row => ({ id: row.id, title: row.title, status: row.status, expiresAt: row.expires_at, photoCount: row.photo_count }))
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
