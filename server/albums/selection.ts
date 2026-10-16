import { randomUUID } from 'node:crypto'
import { withDatabaseContext, type ConnectionPool, type QueryClient } from '../db/context'
import { StudioOperationError } from '../studios/error'
import { canPerform } from '../../shared/domain/workflow'
import { canFinalizeSelection, canSelectAnother, type SelectionLimit } from '../../shared/domain/selection'
import type { AlbumAccess } from './access'
import { withManagedAlbum, type AlbumManager } from './manager'

type SaveStatus = 'saved' | 'conflict' | 'limit_reached'
type LimitRow = { limit_kind: SelectionLimit['kind']; limit_min: number | null; limit_max: number | null; collaboration_mode: 'shared' | 'individual' | 'voting' }
type WorkingAlbum = { status: string; current_cycle: number; round_id: string; limit_kind: SelectionLimit['kind']; limit_min: number | null; limit_max: number | null; collaboration_mode: LimitRow['collaboration_mode'] }

function selectionLimit(row: LimitRow): SelectionLimit {
  switch (row.limit_kind) {
    case 'exact': return { kind: 'exact', count: row.limit_max! }
    case 'maximum': return { kind: 'maximum', count: row.limit_max! }
    case 'minimum': return { kind: 'minimum', count: row.limit_min! }
    case 'range': return { kind: 'range', min: row.limit_min!, max: row.limit_max! }
    default: return { kind: 'unlimited' }
  }
}

function requireParticipant(access: AlbumAccess): string {
  if (!access.participantId || !canPerform(access.scope, 'selection.select')) throw new StudioOperationError('Cần tham gia album trước khi chọn ảnh', 403)
  return access.participantId
}

async function workingAlbum(client: QueryClient, albumId: string, lock = false): Promise<WorkingAlbum> {
  const album = await client.query<{ status: string; current_cycle: number }>(
    `SELECT status, current_cycle FROM albums WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [albumId])
  if (!album.rows[0]) throw new StudioOperationError('Album không tồn tại hoặc đã hết hạn', 410)
  const settings = await client.query<LimitRow>('SELECT * FROM app_private.album_public_settings($1)', [albumId])
  if (!settings.rows[0]) throw new StudioOperationError('Cài đặt album không truy cập được', 403)
  const round = await client.query<{ id: string }>(
    "SELECT id FROM selection_rounds WHERE album_id = $1 AND cycle = $2 AND round_number = 1 AND status = 'OPEN'",
    [albumId, album.rows[0].current_cycle])
  if (!round.rows[0]) throw new StudioOperationError('Vòng chọn ảnh đã đóng', 409)
  return { ...album.rows[0], ...settings.rows[0], round_id: round.rows[0].id }
}

async function requirePhoto(client: QueryClient, albumId: string, photoId: string): Promise<void> {
  const result = await client.query<{ id: string }>('SELECT id FROM photos WHERE id = $1 AND album_id = $2', [photoId, albumId])
  if (!result.rows[0]) throw new StudioOperationError('Ảnh không thuộc album', 404)
}

async function selectionList(client: QueryClient, album: WorkingAlbum, albumId: string, participantId: string, create: boolean): Promise<{ id: string; version: number } | null> {
  const kind = album.collaboration_mode === 'shared' ? 'shared' : 'individual'
  if (create && kind !== 'shared') {
    await client.query(
      `INSERT INTO selection_lists (id, album_id, round_id, participant_id, kind)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
      [randomUUID(), albumId, album.round_id, participantId, kind],
    )
  }
  const result = await client.query<{ id: string; version: number }>(
    `SELECT id, version FROM selection_lists WHERE round_id = $1 AND kind = $2
     AND ($2 = 'shared' OR participant_id = $3)${create ? ' FOR UPDATE' : ''}`,
    [album.round_id, kind, participantId])
  return result.rows[0] ?? null
}

export async function getSelectionState(pool: ConnectionPool, access: AlbumAccess): Promise<{ version: number; selectedPhotoIds: string[] }> {
  const participantId = requireParticipant(access)
  return withDatabaseContext(pool, { albumId: access.albumId, scope: access.scope, participantId }, async client => {
    const album = await workingAlbum(client, access.albumId)
    const list = await selectionList(client, album, access.albumId, participantId, false)
    if (!list) return { version: 0, selectedPhotoIds: [] }
    const selected = await client.query<{ photo_id: string }>(
      'SELECT s.photo_id FROM selections s JOIN photos p ON p.id = s.photo_id WHERE s.list_id = $1 ORDER BY p.sort_order, p.id', [list.id])
    return { version: list.version, selectedPhotoIds: selected.rows.map(row => row.photo_id) }
  })
}

export async function setPhotoSelection(pool: ConnectionPool, access: AlbumAccess, photoId: string, selected: boolean, expectedVersion: number): Promise<{ status: SaveStatus; version: number; selected: boolean; count: number }> {
  const participantId = requireParticipant(access)
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0 || typeof selected !== 'boolean') throw new StudioOperationError('Phiên bản hoặc lựa chọn không hợp lệ', 400)
  return withDatabaseContext(pool, { albumId: access.albumId, scope: access.scope, participantId }, async client => {
    const album = await workingAlbum(client, access.albumId)
    if (album.status !== 'PUBLISHED') throw new StudioOperationError('Album không nhận lựa chọn mới', 409)
    await requirePhoto(client, access.albumId, photoId)
    const list = await selectionList(client, album, access.albumId, participantId, true)
    if (!list) throw new StudioOperationError('Không thể tạo danh sách chọn', 409)
    const current = await client.query<{ photo_id: string }>('SELECT photo_id FROM selections WHERE list_id = $1', [list.id])
    const currentIds = new Set(current.rows.map(row => row.photo_id))
    const isSelected = currentIds.has(photoId)
    if (list.version !== expectedVersion) return { status: 'conflict', version: list.version, selected: isSelected, count: currentIds.size }
    if (selected === isSelected) return { status: 'saved', version: list.version, selected, count: currentIds.size }
    if (selected && album.collaboration_mode !== 'voting' && !canSelectAnother(selectionLimit(album), currentIds.size)) {
      return { status: 'limit_reached', version: list.version, selected: false, count: currentIds.size }
    }
    if (selected) await client.query('INSERT INTO selections (album_id, list_id, photo_id, selected_by) VALUES ($1, $2, $3, $4)', [access.albumId, list.id, photoId, participantId])
    else await client.query('DELETE FROM selections WHERE list_id = $1 AND photo_id = $2', [list.id, photoId])
    const next = await client.query<{ version: number }>('UPDATE selection_lists SET version = version + 1, updated_at = now() WHERE id = $1 RETURNING version', [list.id])
    return { status: 'saved', version: next.rows[0]!.version, selected, count: currentIds.size + (selected ? 1 : -1) }
  })
}

export async function savePhotoNote(pool: ConnectionPool, access: AlbumAccess, photoId: string, body: string, expectedVersion: number): Promise<{ status: 'saved' | 'conflict'; version: number; body: string }> {
  const participantId = requireParticipant(access)
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0 || typeof body !== 'string' || body.length > 5000) throw new StudioOperationError('Nội dung hoặc phiên bản ghi chú không hợp lệ', 400)
  return withDatabaseContext(pool, { albumId: access.albumId, scope: access.scope, participantId }, async client => {
    const album = await workingAlbum(client, access.albumId)
    if (album.status !== 'PUBLISHED') throw new StudioOperationError('Album không nhận ghi chú mới', 409)
    await requirePhoto(client, access.albumId, photoId)
    const active = await client.query<{ id: string }>('SELECT id FROM participants WHERE id = $1 AND album_id = $2 AND revoked_at IS NULL', [participantId, access.albumId])
    if (!active.rows[0]) throw new StudioOperationError('Người tham gia không còn quyền truy cập', 403)
    const note = await client.query<{ id: string; body: string; version: number }>(
      'SELECT id, body, version FROM photo_notes WHERE photo_id = $1 AND participant_id = $2 FOR UPDATE', [photoId, participantId])
    const previous = note.rows[0]
    if ((previous?.version ?? 0) !== expectedVersion) return { status: 'conflict', version: previous?.version ?? 0, body: previous?.body ?? '' }
    if (previous?.body === body) return { status: 'saved', version: previous.version, body }
    const noteId = previous?.id ?? randomUUID()
    const version = expectedVersion + 1
    if (previous) await client.query('UPDATE photo_notes SET body = $1, version = $2, updated_at = now() WHERE id = $3', [body, version, noteId])
    else {
      const inserted = await client.query<{ id: string }>(
        'INSERT INTO photo_notes (id, album_id, photo_id, participant_id, body, version) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (photo_id, participant_id) DO NOTHING RETURNING id',
        [noteId, access.albumId, photoId, participantId, body, version])
      if (!inserted.rows[0]) {
        const latest = await client.query<{ body: string; version: number }>('SELECT body, version FROM photo_notes WHERE photo_id = $1 AND participant_id = $2', [photoId, participantId])
        return { status: 'conflict', version: latest.rows[0]?.version ?? 0, body: latest.rows[0]?.body ?? '' }
      }
    }
    await client.query('INSERT INTO photo_note_revisions (id, album_id, note_id, version, body) VALUES ($1, $2, $3, $4, $5)', [randomUUID(), access.albumId, noteId, version, body])
    return { status: 'saved', version, body }
  })
}

export async function getPhotoNote(pool: ConnectionPool, access: AlbumAccess, photoId: string): Promise<{ body: string; version: number }> {
  const participantId = requireParticipant(access)
  return withDatabaseContext(pool, { albumId: access.albumId, scope: access.scope, participantId }, async client => {
    await requirePhoto(client, access.albumId, photoId)
    const note = await client.query<{ body: string; version: number }>(
      'SELECT body, version FROM photo_notes WHERE album_id = $1 AND photo_id = $2 AND participant_id = $3',
      [access.albumId, photoId, participantId])
    return note.rows[0] ?? { body: '', version: 0 }
  })
}

export async function finalizeStudioSelection(pool: ConnectionPool, studioId: string, userId: string, albumId: string, chosenPhotoIds?: string[]): Promise<{ versionNumber: number; count: number }> {
  return finalizeManagedSelection(pool, { kind: 'member', studioId, userId }, albumId, chosenPhotoIds)
}

export async function finalizeManagedSelection(pool: ConnectionPool, manager: AlbumManager, albumId: string, chosenPhotoIds?: string[]): Promise<{ versionNumber: number; count: number }> {
  return withManagedAlbum(pool, manager, albumId, 'selection.finalize', async client => {
    const album = await workingAlbum(client, albumId, true)
    if (album.status !== 'PUBLISHED') throw new StudioOperationError('Album không ở trạng thái có thể chốt', 409)
    const selected = chosenPhotoIds ?? (await client.query<{ photo_id: string }>(
      `SELECT s.photo_id FROM selections s JOIN selection_lists l ON l.id = s.list_id
       WHERE l.round_id = $1 AND l.kind = 'shared' ORDER BY s.selected_at, s.photo_id`, [album.round_id])).rows.map(row => row.photo_id)
    if (new Set(selected).size !== selected.length) throw new StudioOperationError('Danh sách ảnh bị trùng', 400)
    if (album.collaboration_mode !== 'shared' && !chosenPhotoIds) throw new StudioOperationError('Cần chọn bộ ảnh cuối từ các danh sách hoặc phiếu', 400)
    if (!canFinalizeSelection(selectionLimit(album), selected.length)) throw new StudioOperationError('Số ảnh chưa đáp ứng giới hạn chốt', 409)
    const photos = selected.length ? await client.query<{ id: string; filename: string }>(
      'SELECT id, filename FROM photos WHERE album_id = $1 AND id = ANY($2::uuid[])', [albumId, selected]) : { rows: [] }
    const byId = new Map(photos.rows.map(photo => [photo.id, photo]))
    if (byId.size !== selected.length) throw new StudioOperationError('Có ảnh không thuộc album', 400)
    const latest = await client.query<{ version_number: number }>('SELECT coalesce(max(version_number), 0)::integer AS version_number FROM selection_versions WHERE album_id = $1', [albumId])
    const versionNumber = latest.rows[0]!.version_number + 1
    const versionId = randomUUID()
    await client.query('INSERT INTO selection_versions (id, album_id, version_number, cycle) VALUES ($1, $2, $3, $4)', [versionId, albumId, versionNumber, album.current_cycle])
    for (const photoId of selected) {
      const notes = await client.query<{ participant: string; text: string }>(
        `SELECT p.display_name AS participant, n.body AS text FROM photo_notes n JOIN participants p ON p.id = n.participant_id
         WHERE n.album_id = $1 AND n.photo_id = $2 AND n.body <> '' ORDER BY n.created_at, n.id`, [albumId, photoId])
      const itemId = randomUUID()
      await client.query('INSERT INTO selection_version_items (id, album_id, selection_version_id, photo_id, filename, notes) VALUES ($1, $2, $3, $4, $5, $6::jsonb)',
        [itemId, albumId, versionId, photoId, byId.get(photoId)!.filename, JSON.stringify(notes.rows)])
      await client.query('INSERT INTO production_tasks (id, album_id, selection_version_item_id) VALUES ($1, $2, $3)', [randomUUID(), albumId, itemId])
    }
    await client.query("UPDATE selection_rounds SET status = 'CLOSED' WHERE id = $1", [album.round_id])
    await client.query("UPDATE albums SET status = 'FINALIZED', updated_at = now() WHERE id = $1", [albumId])
    return { versionNumber, count: selected.length }
  })
}

export async function reopenStudioSelection(pool: ConnectionPool, studioId: string, userId: string, albumId: string): Promise<{ cycle: number }> {
  return reopenManagedSelection(pool, { kind: 'member', studioId, userId }, albumId)
}

export async function reopenManagedSelection(pool: ConnectionPool, manager: AlbumManager, albumId: string): Promise<{ cycle: number }> {
  return withManagedAlbum(pool, manager, albumId, 'selection.finalize', async client => {
    const current = await client.query<{ status: string; current_cycle: number; collaboration_mode: string }>(
      'SELECT a.status, a.current_cycle, s.collaboration_mode FROM albums a JOIN album_settings s ON s.album_id = a.id WHERE a.id = $1 FOR UPDATE OF a', [albumId])
    if (current.rows[0]?.status !== 'FINALIZED') throw new StudioOperationError('Chỉ mở lại album đã chốt', 409)
    const cycle = current.rows[0].current_cycle + 1
    const roundId = randomUUID()
    await client.query('INSERT INTO selection_rounds (id, album_id, cycle, round_number) VALUES ($1, $2, $3, 1)', [roundId, albumId, cycle])
    if (current.rows[0].collaboration_mode === 'shared') await client.query('INSERT INTO selection_lists (id, album_id, round_id, kind) VALUES ($1, $2, $3, $4)', [randomUUID(), albumId, roundId, 'shared'])
    await client.query("UPDATE albums SET status = 'PUBLISHED', current_cycle = $1, updated_at = now() WHERE id = $2", [cycle, albumId])
    return { cycle }
  })
}

export async function getSelectionResults(pool: ConnectionPool, studioId: string, userId: string, albumId: string): Promise<{ versionNumber: number; items: { photoId: string; filename: string; notes: { participant: string; text: string }[] }[] }> {
  return getManagedSelectionResults(pool, { kind: 'member', studioId, userId }, albumId)
}

export async function getManagedSelectionResults(pool: ConnectionPool, manager: AlbumManager, albumId: string): Promise<{ versionNumber: number; items: { photoId: string; filename: string; notes: { participant: string; text: string }[] }[] }> {
  return withManagedAlbum(pool, manager, albumId, 'album.view', async client => {
    const version = await client.query<{ id: string; version_number: number }>('SELECT id, version_number FROM selection_versions WHERE album_id = $1 ORDER BY version_number DESC LIMIT 1', [albumId])
    if (!version.rows[0]) throw new StudioOperationError('Album chưa được chốt', 404)
    const items = await client.query<{ photo_id: string; filename: string; notes: { participant: string; text: string }[] }>(
      'SELECT photo_id, filename, notes FROM selection_version_items WHERE selection_version_id = $1 ORDER BY filename, photo_id', [version.rows[0].id])
    return { versionNumber: version.rows[0].version_number, items: items.rows.map(row => ({ photoId: row.photo_id, filename: row.filename, notes: row.notes })) }
  })
}
