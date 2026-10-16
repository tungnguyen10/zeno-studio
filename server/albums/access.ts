import { withDatabaseContext, type ConnectionPool } from '../db/context'
import { hashAccessToken, issueAccessToken } from '../security/access-token'
import { StudioOperationError } from '../studios/error'
import { queryPhotoPage, type PhotoFilter, type PhotoPage } from './photo-page'

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
  id: string; title: string; status: string; expiresAt: Date; joined: boolean; canJoin: boolean
  settings: { limitKind: string; limitMin: number | null; limitMax: number | null }
}> {
  return withDatabaseContext(pool, { albumId: access.albumId, scope: access.scope }, async client => {
    const album = await client.query<{ id: string; title: string; status: string; expires_at: Date }>(
      'SELECT id, title, status, expires_at FROM albums WHERE id = $1', [access.albumId])
    if (!album.rows[0]) throw new StudioOperationError('Album không còn truy cập được', 410)
    const settings = await client.query<{ limit_kind: string; limit_min: number | null; limit_max: number | null }>(
      'SELECT limit_kind, limit_min, limit_max FROM app_private.album_public_settings($1)', [access.albumId])
    return {
      id: album.rows[0].id, title: album.rows[0].title, status: album.rows[0].status, expiresAt: album.rows[0].expires_at,
      joined: access.participantId !== null,
      canJoin: access.scope === 'customer' && access.participantId === null,
      settings: { limitKind: settings.rows[0]!.limit_kind, limitMin: settings.rows[0]!.limit_min, limitMax: settings.rows[0]!.limit_max },
    }
  })
}

export async function resolveAlbumAccess(pool: ConnectionPool, token: string): Promise<AlbumAccess | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null
  const resolved = await withDatabaseContext(pool, { scope: 'token_lookup' },
    client => client.query<{ album_id: string; participant_id: string | null; access_scope: AlbumAccess['scope'] }>(
      'SELECT album_id, participant_id, access_scope FROM app_private.resolve_album_token($1)', [hashAccessToken(token)]))
  const row = resolved.rows[0]
  return row ? { albumId: row.album_id, participantId: row.participant_id, scope: row.access_scope } : null
}

export async function listAlbumPhotos(pool: ConnectionPool, access: AlbumAccess, pageSize = 60, cursor?: string, filter: PhotoFilter = 'all'): Promise<PhotoPage> {
  return withDatabaseContext(pool, { albumId: access.albumId, scope: access.scope, participantId: access.participantId ?? undefined },
    client => queryPhotoPage(client, access.albumId, { limit: pageSize, cursor, filter }))
}

export async function joinAlbum(pool: ConnectionPool, access: AlbumAccess): Promise<{ token: string }> {
  if (access.scope !== 'customer' || access.participantId) throw new StudioOperationError('Link này không thể tạo thêm người tham gia', 403)
  const token = issueAccessToken()
  const joined = await withDatabaseContext(pool, { albumId: access.albumId, scope: 'customer' }, client =>
    client.query<{ participant_id: string | null }>('SELECT app_private.join_shared_participant($1, $2) AS participant_id', [access.albumId, token.tokenHash]))
  if (!joined.rows[0]?.participant_id) throw new StudioOperationError('Album không còn nhận người tham gia', 403)
  return { token: token.token }
}
