import type { ConnectionPool } from '../db/context'
import { StudioOperationError } from '../studios/error'
import { withManagedAlbum, type AlbumManager } from './manager'
import { queryPhotoPage, type PhotoPage, type PhotoPageOptions } from './photo-page'

export interface StudioAlbumWorkspace {
  id: string
  title: string
  status: string
  expiresAt: Date
  canFinalize: boolean
  hasResults: boolean
  settings: { limitKind: string; limitMin: number | null; limitMax: number | null }
  photoCount: number
  selectedCount: number
}

export async function getStudioAlbumWorkspace(pool: ConnectionPool, studioId: string, userId: string, albumId: string): Promise<StudioAlbumWorkspace> {
  return getManagedAlbumWorkspace(pool, { kind: 'member', studioId, userId }, albumId)
}

export async function getManagedAlbumWorkspace(pool: ConnectionPool, manager: AlbumManager, albumId: string): Promise<StudioAlbumWorkspace> {
  return withManagedAlbum(pool, manager, albumId, 'album.view', async (client, session) => {
    const result = await client.query<{ id: string; title: string; status: string; expires_at: Date; limit_kind: string; limit_min: number | null; limit_max: number | null; has_results: boolean }>(
      `SELECT a.id, a.title, a.status, a.expires_at, s.limit_kind, s.limit_min, s.limit_max,
         EXISTS (SELECT 1 FROM selection_versions v WHERE v.album_id = a.id) AS has_results
       FROM albums a JOIN album_settings s ON s.album_id = a.id WHERE a.id = $1`, [albumId])
    const album = result.rows[0]
    if (!album) throw new StudioOperationError('Album không tồn tại', 404)
    const counts = await queryPhotoPage(client, albumId, { limit: 1, filter: 'all' })
    return {
      id: album.id, title: album.title, status: album.status, expiresAt: album.expires_at,
      canFinalize: session.canFinalize, hasResults: album.has_results,
      settings: { limitKind: album.limit_kind, limitMin: album.limit_min, limitMax: album.limit_max },
      photoCount: counts.total, selectedCount: counts.selectedCount,
    }
  })
}

export async function listManagedAlbumPhotos(pool: ConnectionPool, manager: AlbumManager, albumId: string, options: PhotoPageOptions): Promise<PhotoPage> {
  return withManagedAlbum(pool, manager, albumId, 'album.view', client => queryPhotoPage(client, albumId, options))
}
