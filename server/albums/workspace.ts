import type { ConnectionPool } from '../db/context'
import { StudioOperationError } from '../studios/error'
import { withManagedAlbum, type AlbumManager } from './manager'

export interface StudioAlbumWorkspace {
  id: string
  title: string
  status: string
  expiresAt: Date
  canFinalize: boolean
  hasResults: boolean
  settings: { limitKind: string; limitMin: number | null; limitMax: number | null; collaborationMode: string }
  photos: { id: string; filename: string; sortOrder: number; selectedBy: string[] }[]
}

export async function getStudioAlbumWorkspace(pool: ConnectionPool, studioId: string, userId: string, albumId: string): Promise<StudioAlbumWorkspace> {
  return getManagedAlbumWorkspace(pool, { kind: 'member', studioId, userId }, albumId)
}

export async function getManagedAlbumWorkspace(pool: ConnectionPool, manager: AlbumManager, albumId: string): Promise<StudioAlbumWorkspace> {
  return withManagedAlbum(pool, manager, albumId, 'album.view', async (client, session) => {
    const result = await client.query<{ id: string; title: string; status: string; expires_at: Date; current_cycle: number; limit_kind: string; limit_min: number | null; limit_max: number | null; collaboration_mode: string }>(
      `SELECT a.id, a.title, a.status, a.expires_at, a.current_cycle, s.limit_kind, s.limit_min, s.limit_max, s.collaboration_mode
       FROM albums a JOIN album_settings s ON s.album_id = a.id WHERE a.id = $1`, [albumId])
    const album = result.rows[0]
    if (!album) throw new StudioOperationError('Album không tồn tại', 404)
    const photoRows = await client.query<{ id: string; filename: string; sort_order: number }>(
      'SELECT id, filename, sort_order FROM photos WHERE album_id = $1 ORDER BY sort_order, id', [albumId])
    const resultVersion = await client.query<{ exists: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM selection_versions WHERE album_id = $1) AS exists', [albumId])
    const chosen = await client.query<{ photo_id: string; display_name: string | null }>(
      `SELECT s.photo_id, p.display_name FROM selections s
       JOIN selection_lists l ON l.id = s.list_id
       JOIN selection_rounds r ON r.id = l.round_id
       LEFT JOIN participants p ON p.id = s.selected_by
       WHERE s.album_id = $1 AND r.cycle = $2 AND r.round_number = 1
       ORDER BY s.selected_at`, [albumId, album.current_cycle])
    const selectedBy = new Map<string, string[]>()
    for (const row of chosen.rows) selectedBy.set(row.photo_id, [...(selectedBy.get(row.photo_id) ?? []), row.display_name ?? 'Người tham gia'])
    return {
      id: album.id, title: album.title, status: album.status, expiresAt: album.expires_at,
      canFinalize: session.canFinalize, hasResults: resultVersion.rows[0]?.exists ?? false,
      settings: { limitKind: album.limit_kind, limitMin: album.limit_min, limitMax: album.limit_max, collaborationMode: album.collaboration_mode },
      photos: photoRows.rows.map(row => ({ id: row.id, filename: row.filename, sortOrder: row.sort_order, selectedBy: selectedBy.get(row.id) ?? [] })),
    }
  })
}
