import type { ConnectionPool } from '../db/context'
import { StudioOperationError } from '../studios/error'
import type { DownloadSettings } from '../../shared/domain/download-policy'
import { withManagedAlbum, type AlbumManager } from './manager'

const fields = ['enabled', 'allowSingle', 'allowSelected', 'allowAll', 'availableWhen'] as const

export function parseDownloadSettings(value: unknown): DownloadSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new StudioOperationError('Cài đặt tải ảnh không hợp lệ', 400)
  const input = value as Record<string, unknown>
  if (Object.keys(input).length !== fields.length || Object.keys(input).some(key => !fields.includes(key as typeof fields[number])) ||
    typeof input.enabled !== 'boolean' || typeof input.allowSingle !== 'boolean' ||
    typeof input.allowSelected !== 'boolean' || typeof input.allowAll !== 'boolean' ||
    !['anytime', 'after_finalize'].includes(String(input.availableWhen))) {
    throw new StudioOperationError('Cài đặt tải ảnh không hợp lệ', 400)
  }
  return {
    enabled: input.enabled as boolean, allowSingle: input.allowSingle as boolean,
    allowSelected: input.allowSelected as boolean, allowAll: input.allowAll as boolean,
    availableWhen: input.availableWhen as DownloadSettings['availableWhen'],
  }
}

export async function updateManagedDownloadSettings(
  pool: ConnectionPool, manager: AlbumManager, albumId: string, settings: DownloadSettings,
): Promise<void> {
  const next = parseDownloadSettings(settings)
  await withManagedAlbum(pool, manager, albumId, 'album.settings', async (client, session) => {
    const album = await client.query<{ expires_at: Date; status: string }>(
      'SELECT expires_at, status FROM albums WHERE id = $1 FOR UPDATE', [albumId])
    if (!album.rows[0] || album.rows[0].status === 'EXPIRED' || new Date(album.rows[0].expires_at).getTime() <= Date.now()) {
      throw new StudioOperationError('Album đã hết hạn', 410)
    }
    const current = await client.query<{
      download_enabled: boolean; download_allow_single: boolean; download_allow_selected: boolean;
      download_allow_all: boolean; download_available_when: DownloadSettings['availableWhen']
    }>(`SELECT download_enabled, download_allow_single, download_allow_selected,
      download_allow_all, download_available_when FROM album_settings WHERE album_id = $1 FOR UPDATE`, [albumId])
    const row = current.rows[0]
    if (!row) throw new StudioOperationError('Cài đặt album không tồn tại', 404)
    const previous: DownloadSettings = {
      enabled: row.download_enabled, allowSingle: row.download_allow_single,
      allowSelected: row.download_allow_selected, allowAll: row.download_allow_all,
      availableWhen: row.download_available_when,
    }
    await client.query(`UPDATE album_settings SET download_enabled = $2, download_allow_single = $3,
      download_allow_selected = $4, download_allow_all = $5, download_available_when = $6 WHERE album_id = $1`,
    [albumId, next.enabled, next.allowSingle, next.allowSelected, next.allowAll, next.availableWhen])
    await client.query(`INSERT INTO audit_logs (studio_id, album_id, actor_kind, actor_id, action, details)
      VALUES ($1, $2, $3, $4, 'album.download_settings.updated', $5::jsonb)`,
    [session.studioId, albumId, session.actorKind, session.actorId, JSON.stringify({ previous, next })])
  })
}
