import type { ConnectionPool } from '../db/context'
import { StudioOperationError } from '../studios/error'
import { withManagedAlbum, type AlbumManager } from './manager'
import { queryPhotoPage, type PhotoPage, type PhotoPageOptions } from './photo-page'
import type { DownloadSettings } from '../../shared/domain/download-policy'

export interface StudioAlbumWorkspace {
  id: string
  title: string
  status: string
  expiresAt: Date
  canFinalize: boolean
  hasResults: boolean
  previousCount: number
  settings: { limitKind: string; limitMin: number | null; limitMax: number | null; durationDays: 15 | 30 }
  downloadSettings: DownloadSettings
  canEditDownloadSettings: boolean
  photoCount: number
  selectedCount: number
}

export async function getStudioAlbumWorkspace(pool: ConnectionPool, studioId: string, userId: string, albumId: string): Promise<StudioAlbumWorkspace> {
  return getManagedAlbumWorkspace(pool, { kind: 'member', studioId, userId }, albumId)
}

export async function getManagedAlbumWorkspace(pool: ConnectionPool, manager: AlbumManager, albumId: string): Promise<StudioAlbumWorkspace> {
  return withManagedAlbum(pool, manager, albumId, 'album.view', async (client, session) => {
    const result = await client.query<{ id: string; title: string; status: string; expires_at: Date; limit_kind: string; limit_min: number | null; limit_max: number | null; duration_days: 15 | 30; has_results: boolean; download_enabled: boolean; download_allow_single: boolean; download_allow_selected: boolean; download_allow_all: boolean; download_available_when: DownloadSettings['availableWhen'] }>(
      `SELECT a.id, a.title, a.status, a.expires_at, s.limit_kind, s.limit_min, s.limit_max, s.duration_days,
         s.download_enabled, s.download_allow_single, s.download_allow_selected, s.download_allow_all, s.download_available_when,
         EXISTS (SELECT 1 FROM selection_versions v WHERE v.album_id = a.id) AS has_results
       FROM albums a JOIN album_settings s ON s.album_id = a.id WHERE a.id = $1`, [albumId])
    const album = result.rows[0]
    if (!album) throw new StudioOperationError('Album không tồn tại', 404)
    const counts = await queryPhotoPage(client, albumId, { limit: 1, filter: 'all' })
    const previous = await client.query<{ count: number }>(
      `SELECT (SELECT count(*)::integer FROM selection_version_items i WHERE i.selection_version_id = v.id) AS count
       FROM selection_versions v WHERE v.album_id = $1 ORDER BY v.version_number DESC LIMIT 1`, [albumId])
    return {
      id: album.id, title: album.title, status: album.status, expiresAt: album.expires_at,
      canFinalize: session.canFinalize, hasResults: album.has_results,
      previousCount: previous.rows[0]?.count ?? 0,
      settings: { limitKind: album.limit_kind, limitMin: album.limit_min, limitMax: album.limit_max, durationDays: album.duration_days },
      downloadSettings: { enabled: album.download_enabled, allowSingle: album.download_allow_single,
        allowSelected: album.download_allow_selected, allowAll: album.download_allow_all,
        availableWhen: album.download_available_when },
      canEditDownloadSettings: session.canEditDownloadSettings && album.status !== 'EXPIRED' && new Date(album.expires_at).getTime() > Date.now(),
      photoCount: counts.total, selectedCount: counts.selectedCount,
    }
  })
}

export async function listManagedAlbumPhotos(pool: ConnectionPool, manager: AlbumManager, albumId: string, options: PhotoPageOptions): Promise<PhotoPage> {
  return withManagedAlbum(pool, manager, albumId, 'album.view', client => queryPhotoPage(client, albumId, { ...options, includePrevious: true }))
}
