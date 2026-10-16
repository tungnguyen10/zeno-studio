import { randomUUID } from 'node:crypto'
import { withDatabaseContext, type ConnectionPool } from '../db/context'
import { hashAccessToken, issueAccessToken } from '../security/access-token'
import { StudioOperationError } from '../studios/error'

export interface AlbumAccess {
  albumId: string
  scope: 'guest_admin' | 'customer' | 'participant' | 'finalizer'
  participantId: string | null
}

export interface GalleryPhoto {
  id: string
  sourceFileId: string
  filename: string
  width: number | null
  height: number | null
  status: 'READY' | 'MISSING' | 'BROKEN'
  sortOrder: number
}

export async function getAlbumOverview(pool: ConnectionPool, access: AlbumAccess): Promise<{
  id: string; title: string; status: string; expiresAt: Date; participant: { id: string; displayName: string } | null
  settings: { limitKind: string; limitMin: number | null; limitMax: number | null; collaborationMode: string; shortlistRounds: number }
}> {
  return withDatabaseContext(pool, { albumId: access.albumId, scope: access.scope }, async client => {
    const album = await client.query<{ id: string; title: string; status: string; expires_at: Date }>(
      'SELECT id, title, status, expires_at FROM albums WHERE id = $1', [access.albumId])
    if (!album.rows[0]) throw new StudioOperationError('Album không còn truy cập được', 410)
    const settings = await client.query<{ limit_kind: string; limit_min: number | null; limit_max: number | null; collaboration_mode: string; shortlist_rounds: number }>(
      'SELECT * FROM app_private.album_public_settings($1)', [access.albumId])
    const participant = access.participantId
      ? (await client.query<{ id: string; display_name: string }>('SELECT id, display_name FROM participants WHERE id = $1', [access.participantId])).rows[0]
      : null
    return {
      id: album.rows[0].id, title: album.rows[0].title, status: album.rows[0].status, expiresAt: album.rows[0].expires_at,
      participant: participant ? { id: participant.id, displayName: participant.display_name } : null,
      settings: {
        limitKind: settings.rows[0]!.limit_kind, limitMin: settings.rows[0]!.limit_min, limitMax: settings.rows[0]!.limit_max,
        collaborationMode: settings.rows[0]!.collaboration_mode, shortlistRounds: settings.rows[0]!.shortlist_rounds,
      },
    }
  })
}

function parseCursor(value: string): { sortOrder: number; id: string } {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as { sortOrder: number; id: string }
    if (Number.isInteger(parsed.sortOrder) && parsed.sortOrder >= 0 && /^[0-9a-f-]{36}$/i.test(parsed.id)) return parsed
  } catch { /* Invalid cursor is reported below. */ }
  throw new StudioOperationError('Cursor ảnh không hợp lệ', 400)
}

export async function resolveAlbumAccess(pool: ConnectionPool, token: string): Promise<AlbumAccess | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null
  const resolved = await withDatabaseContext(pool, { scope: 'token_lookup' },
    client => client.query<{ album_id: string; participant_id: string | null; access_scope: AlbumAccess['scope'] }>(
      'SELECT album_id, participant_id, access_scope FROM app_private.resolve_album_token($1)', [hashAccessToken(token)]))
  const row = resolved.rows[0]
  return row ? { albumId: row.album_id, participantId: row.participant_id, scope: row.access_scope } : null
}

export async function listAlbumPhotos(pool: ConnectionPool, access: AlbumAccess, pageSize = 60, cursor?: string): Promise<{ items: GalleryPhoto[]; nextCursor: string | null }> {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new StudioOperationError('Kích thước trang không hợp lệ', 400)
  const after = cursor ? parseCursor(cursor) : null
  return withDatabaseContext(pool, { albumId: access.albumId, scope: access.scope }, async client => {
    const result = await client.query<{ id: string; source_file_id: string; filename: string; width: number | null; height: number | null; status: GalleryPhoto['status']; sort_order: number }>(
      `SELECT id, source_file_id, filename, width, height, status, sort_order FROM photos
       WHERE album_id = $1 AND ($2::integer IS NULL OR (sort_order, id) > ($2::integer, $3::uuid))
       ORDER BY sort_order, id LIMIT $4`, [access.albumId, after?.sortOrder ?? null, after?.id ?? null, pageSize + 1])
    const hasMore = result.rows.length > pageSize
    const rows = result.rows.slice(0, pageSize)
    const items = rows.map(row => ({ id: row.id, sourceFileId: row.source_file_id, filename: row.filename, width: row.width, height: row.height, status: row.status, sortOrder: row.sort_order }))
    const last = items.at(-1)
    return { items, nextCursor: hasMore && last ? Buffer.from(JSON.stringify({ sortOrder: last.sortOrder, id: last.id })).toString('base64url') : null }
  })
}

export async function joinAlbum(pool: ConnectionPool, access: AlbumAccess, displayName: string): Promise<{ participant: { id: string; displayName: string }; token: string }> {
  if (access.scope !== 'customer' || access.participantId) throw new StudioOperationError('Link này không thể tạo thêm người tham gia', 403)
  const name = displayName.trim()
  if (!name || name.length > 80) throw new StudioOperationError('Tên người tham gia phải dài 1–80 ký tự', 400)
  const participantId = randomUUID()
  const token = issueAccessToken()
  await withDatabaseContext(pool, { albumId: access.albumId, scope: 'customer' }, async client => {
    await client.query('INSERT INTO participants (id, album_id, display_name, role) VALUES ($1, $2, $3, $4)', [participantId, access.albumId, name, 'customer'])
    await client.query('INSERT INTO album_tokens (id, album_id, participant_id, scope, token_hash) VALUES ($1, $2, $3, $4, $5)',
      [randomUUID(), access.albumId, participantId, 'customer', token.tokenHash])
  })
  return { participant: { id: participantId, displayName: name }, token: token.token }
}
