import { withDatabaseContext, type ConnectionPool, type QueryClient } from '../db/context'
import { StudioOperationError } from '../studios/error'
import { effectiveStatus, type AlbumStatus } from '../../shared/domain/album-status'
import { evaluateDownload, type DownloadAction, type DownloadCapabilities, type DownloadSettings } from '../../shared/domain/download-policy'
import type { AlbumAccess } from './access'

interface DownloadAlbumState {
  id: string
  status: string
  currentCycle: number
  expiresAt: Date
}

type SettingsRow = {
  download_enabled: boolean
  download_allow_single: boolean
  download_allow_selected: boolean
  download_allow_all: boolean
  download_available_when: DownloadSettings['availableWhen']
}

export async function readDownloadCapabilities(client: QueryClient, album: DownloadAlbumState): Promise<DownloadCapabilities> {
  const result = await client.query<SettingsRow>(
    `SELECT download_enabled, download_allow_single, download_allow_selected,
      download_allow_all, download_available_when
     FROM app_private.album_download_settings($1)`, [album.id])
  const row = result.rows[0]
  if (!row) throw new StudioOperationError('Cài đặt tải ảnh không truy cập được', 403)

  const counts = await client.query<{ has_snapshot: boolean; live_count: number; snapshot_count: number }>(
    `SELECT
       EXISTS (SELECT 1 FROM selection_versions v WHERE v.album_id = $1 AND v.cycle = $2) AS has_snapshot,
       (SELECT count(*)::integer FROM selections s
         JOIN selection_lists l ON l.id = s.list_id
         JOIN selection_rounds r ON r.id = l.round_id
        WHERE s.album_id = $1 AND l.kind = 'shared' AND r.cycle = $2) AS live_count,
       (SELECT count(*)::integer FROM selection_version_items i
         JOIN selection_versions v ON v.id = i.selection_version_id
        WHERE v.album_id = $1 AND v.cycle = $2) AS snapshot_count`,
    [album.id, album.currentCycle])
  const count = counts.rows[0]!
  const settings: DownloadSettings = {
    enabled: row.download_enabled,
    allowSingle: row.download_allow_single,
    allowSelected: row.download_allow_selected,
    allowAll: row.download_allow_all,
    availableWhen: row.download_available_when,
  }
  const status = effectiveStatus({ status: album.status as AlbumStatus, expiresAt: album.expiresAt })
  return evaluateDownload(settings, status, count.has_snapshot, status === 'PUBLISHED' ? count.live_count : count.snapshot_count)
}

export async function getCustomerDownloadCapabilities(pool: ConnectionPool, access: AlbumAccess): Promise<DownloadCapabilities> {
  return withDatabaseContext(pool, { albumId: access.albumId, scope: access.scope, participantId: access.participantId ?? undefined }, async client => {
    const album = await client.query<{ id: string; status: string; current_cycle: number; expires_at: Date }>(
      'SELECT id, status, current_cycle, expires_at FROM albums WHERE id = $1', [access.albumId])
    const row = album.rows[0]
    if (!row) throw new StudioOperationError('Album không còn truy cập được', 410)
    return readDownloadCapabilities(client, {
      id: row.id, status: row.status, currentCycle: row.current_cycle, expiresAt: row.expires_at,
    })
  })
}

export async function requireCustomerDownload(pool: ConnectionPool, access: AlbumAccess, action: DownloadAction): Promise<DownloadCapabilities> {
  if (access.scope === 'guest_admin') throw new StudioOperationError('Link này không có quyền tải ảnh khách', 403)
  const capabilities = await getCustomerDownloadCapabilities(pool, access)
  const permitted = action === 'single' ? capabilities.canSingle : action === 'selected' ? capabilities.canSelected : capabilities.canAll
  if (!permitted) {
    throw new StudioOperationError(capabilities.reason === 'waiting_for_finalize'
      ? 'Studio chỉ cho tải sau khi chốt vòng chọn hiện tại'
      : 'Studio chưa cho phép tải ảnh này', 403)
  }
  return capabilities
}
