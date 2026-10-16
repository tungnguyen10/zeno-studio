import { withDatabaseContext, type ConnectionPool, type QueryClient } from '../db/context'
import { hashAccessToken } from '../security/access-token'
import { StudioOperationError } from '../studios/error'
import { canPerform, type Role } from '../../shared/domain/workflow'

export type AlbumManager =
  | { kind: 'member'; studioId: string; userId: string }
  | { kind: 'guest'; albumId: string; token: string }

type ManagerAction = 'album.view' | 'selection.finalize' | 'production.update' | 'delivery.manage'
export type ManagerSession = { studioId: string; actorKind: 'member' | 'guest_admin'; actorId: string | null; canFinalize: boolean; canDeliver: boolean }

export async function withManagedAlbum<T>(
  pool: ConnectionPool, manager: AlbumManager, albumId: string, action: ManagerAction,
  work: (client: QueryClient, session: ManagerSession) => Promise<T>,
): Promise<T> {
  if (manager.kind === 'guest') {
    if (manager.albumId !== albumId || !/^[A-Za-z0-9_-]{43}$/.test(manager.token)) {
      throw new StudioOperationError('Link quản trị không hợp lệ', 403)
    }
    return withDatabaseContext(pool, { albumId, scope: 'guest_admin' }, async client => {
      const resolved = await client.query<{ album_id: string; access_scope: string }>(
        'SELECT album_id, access_scope FROM app_private.resolve_album_token($1)', [hashAccessToken(manager.token)])
      if (resolved.rows[0]?.album_id !== albumId || resolved.rows[0]?.access_scope !== 'guest_admin') {
        throw new StudioOperationError('Link quản trị không hợp lệ', 403)
      }
      const album = await client.query<{ studio_id: string; status: string; active: boolean }>(
        'SELECT studio_id, status, expires_at > now() AS active FROM albums WHERE id = $1', [albumId])
      if (!album.rows[0]) throw new StudioOperationError('Album không còn truy cập được', 410)
      if (action !== 'album.view' && (!album.rows[0].active || album.rows[0].status === 'EXPIRED')) {
        throw new StudioOperationError('Album đã hết hạn', 410)
      }
      return work(client, { studioId: album.rows[0].studio_id, actorKind: 'guest_admin', actorId: null,
        canFinalize: album.rows[0].active, canDeliver: album.rows[0].active })
    })
  }
  return withDatabaseContext(pool, { studioId: manager.studioId, userId: manager.userId, scope: 'member' }, async client => {
    const member = await client.query<{ role: Role }>(
      'SELECT role FROM studio_members WHERE studio_id = $1 AND user_id = $2', [manager.studioId, manager.userId])
    if (!member.rows[0] || !canPerform(member.rows[0].role, action)) throw new StudioOperationError('Không có quyền thao tác album', 403)
    const album = await client.query<{ id: string }>('SELECT id FROM albums WHERE id = $1 AND studio_id = $2', [albumId, manager.studioId])
    if (!album.rows[0]) throw new StudioOperationError('Album không tồn tại', 404)
    return work(client, { studioId: manager.studioId, actorKind: 'member', actorId: manager.userId,
      canFinalize: canPerform(member.rows[0].role, 'selection.finalize'), canDeliver: canPerform(member.rows[0].role, 'delivery.manage') })
  })
}
