import { randomUUID } from 'node:crypto'
import { withDatabaseContext, type ConnectionPool, type QueryClient } from '../db/context'
import { StudioOperationError } from '../studios/error'
import { canPerform } from '../../shared/domain/workflow'
import { canFinalizeSelection, canSelectAnother, type SelectionLimit } from '../../shared/domain/selection'
import type { AlbumAccess } from './access'
import { withManagedAlbum, type AlbumManager } from './manager'

type SaveStatus = 'saved' | 'conflict' | 'limit_reached'
type LimitRow = { limit_kind: SelectionLimit['kind']; limit_min: number | null; limit_max: number | null }
type WorkingAlbum = { status: string; current_cycle: number; round_id: string; limit_kind: SelectionLimit['kind']; limit_min: number | null; limit_max: number | null }

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

async function selectionList(client: QueryClient, album: WorkingAlbum, lock: boolean): Promise<{ id: string; version: number } | null> {
  const result = await client.query<{ id: string; version: number }>(
    `SELECT id, version FROM selection_lists WHERE round_id = $1 AND kind = 'shared'${lock ? ' FOR UPDATE' : ''}`, [album.round_id])
  return result.rows[0] ?? null
}

export async function getSelectionState(pool: ConnectionPool, access: AlbumAccess, knownVersion?: number): Promise<{ version: number; selectedPhotoIds?: string[] }> {
  const participantId = requireParticipant(access)
  return withDatabaseContext(pool, { albumId: access.albumId, scope: access.scope, participantId }, async client => {
    const album = await workingAlbum(client, access.albumId)
    const list = await selectionList(client, album, false)
    if (!list) return { version: 0, selectedPhotoIds: [] }
    if (knownVersion === list.version) return { version: list.version }
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
    const list = await selectionList(client, album, true)
    if (!list) throw new StudioOperationError('Không thể tạo danh sách chọn', 409)
    const current = await client.query<{ photo_id: string }>('SELECT photo_id FROM selections WHERE list_id = $1', [list.id])
    const currentIds = new Set(current.rows.map(row => row.photo_id))
    const isSelected = currentIds.has(photoId)
    if (list.version !== expectedVersion) return { status: 'conflict', version: list.version, selected: isSelected, count: currentIds.size }
    if (selected === isSelected) return { status: 'saved', version: list.version, selected, count: currentIds.size }
    if (selected && !canSelectAnother(selectionLimit(album), currentIds.size)) {
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
    const chosen = await client.query(
      `SELECT 1 FROM selections s JOIN selection_lists l ON l.id = s.list_id
       WHERE l.round_id = $1 AND l.kind = 'shared' AND s.photo_id = $2`, [album.round_id, photoId])
    if (!chosen.rows[0]) throw new StudioOperationError('Hãy chọn ảnh trước khi ghi chú chỉnh sửa', 409)
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

export interface FinalizeAdjustments { include?: string[]; exclude?: string[] }
const MAX_ADJUSTED_PHOTOS = 10000

function adjustmentIds(value: unknown): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > MAX_ADJUSTED_PHOTOS || value.some(id => typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id))) {
    throw new StudioOperationError('Danh sách ảnh không hợp lệ', 400)
  }
  return value as string[]
}

export async function finalizeStudioSelection(pool: ConnectionPool, studioId: string, userId: string, albumId: string, adjustments?: FinalizeAdjustments): Promise<{ versionNumber: number; count: number }> {
  return finalizeManagedSelection(pool, { kind: 'member', studioId, userId }, albumId, adjustments)
}

// The final set is the customer's shared list plus `include`, minus `exclude`, so 10k-photo albums never ship full id lists.
export async function finalizeManagedSelection(pool: ConnectionPool, manager: AlbumManager, albumId: string, adjustments: FinalizeAdjustments = {}): Promise<{ versionNumber: number; count: number }> {
  const include = adjustmentIds(adjustments.include)
  const exclude = adjustmentIds(adjustments.exclude)
  return withManagedAlbum(pool, manager, albumId, 'selection.finalize', async client => {
    const album = await workingAlbum(client, albumId, true)
    if (album.status !== 'PUBLISHED') throw new StudioOperationError('Album không ở trạng thái có thể chốt', 409)
    const customer = await client.query<{ photo_id: string }>(
      `SELECT s.photo_id FROM selections s JOIN selection_lists l ON l.id = s.list_id
       WHERE l.round_id = $1 AND l.kind = 'shared'`, [album.round_id])
    const chosen = new Set([...customer.rows.map(row => row.photo_id), ...include])
    for (const id of exclude) chosen.delete(id)
    const selected = [...chosen]
    if (!canFinalizeSelection(selectionLimit(album), selected.length)) throw new StudioOperationError('Số ảnh chưa đáp ứng giới hạn chốt', 409)
    const owned = await client.query<{ count: number }>(
      'SELECT count(*)::integer AS count FROM photos WHERE album_id = $1 AND id = ANY($2::uuid[])', [albumId, selected])
    if (owned.rows[0]!.count !== selected.length) throw new StudioOperationError('Có ảnh không thuộc album', 400)
    const latest = await client.query<{ version_number: number }>('SELECT coalesce(max(version_number), 0)::integer AS version_number FROM selection_versions WHERE album_id = $1', [albumId])
    const versionNumber = latest.rows[0]!.version_number + 1
    const versionId = randomUUID()
    await client.query('INSERT INTO selection_versions (id, album_id, version_number, cycle) VALUES ($1, $2, $3, $4)', [versionId, albumId, versionNumber, album.current_cycle])
    // Notes are frozen only for photos the customer still has selected; hidden notes of unselected photos stay out.
    await client.query(
      `WITH items AS (
         INSERT INTO selection_version_items (id, album_id, selection_version_id, photo_id, filename, notes)
         SELECT gen_random_uuid(), $1, $2, p.id, p.filename,
           COALESCE((SELECT jsonb_agg(jsonb_build_object('text', n.body) ORDER BY n.created_at, n.id)
             FROM photo_notes n
             WHERE n.album_id = $1 AND n.photo_id = p.id AND n.body <> ''
               AND EXISTS (SELECT 1 FROM selections s JOIN selection_lists l ON l.id = s.list_id
                 WHERE l.round_id = $4 AND l.kind = 'shared' AND s.photo_id = p.id)), '[]'::jsonb)
         FROM photos p WHERE p.album_id = $1 AND p.id = ANY($3::uuid[])
         RETURNING id
       )
       INSERT INTO production_tasks (id, album_id, selection_version_item_id) SELECT gen_random_uuid(), $1, id FROM items`,
      [albumId, versionId, selected, album.round_id])
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
    const current = await client.query<{ status: string; current_cycle: number }>(
      'SELECT status, current_cycle FROM albums WHERE id = $1 FOR UPDATE', [albumId])
    if (current.rows[0]?.status !== 'FINALIZED') throw new StudioOperationError('Chỉ mở lại album đã chốt', 409)
    const previous = await client.query<{ id: string }>(
      'SELECT id FROM selection_versions WHERE album_id = $1 ORDER BY version_number DESC LIMIT 1', [albumId])
    if (!previous.rows[0]) throw new StudioOperationError('Album chưa có bộ ảnh đã chốt', 409)
    const listVersion = await client.query<{ version: number }>(
      'SELECT coalesce(max(version), 0)::integer + 1 AS version FROM selection_lists WHERE album_id = $1 AND kind = $2', [albumId, 'shared'])
    const cycle = current.rows[0].current_cycle + 1
    const roundId = randomUUID()
    const listId = randomUUID()
    await client.query('INSERT INTO selection_rounds (id, album_id, cycle, round_number) VALUES ($1, $2, $3, 1)', [roundId, albumId, cycle])
    await client.query('INSERT INTO selection_lists (id, album_id, round_id, kind, version) VALUES ($1, $2, $3, $4, $5)',
      [listId, albumId, roundId, 'shared', listVersion.rows[0]!.version])
    await client.query(`INSERT INTO selections (album_id, list_id, photo_id)
      SELECT $1, $2, photo_id FROM selection_version_items WHERE selection_version_id = $3`,
      [albumId, listId, previous.rows[0].id])
    await client.query("UPDATE albums SET status = 'PUBLISHED', current_cycle = $1, updated_at = now() WHERE id = $2", [cycle, albumId])
    return { cycle }
  })
}

export interface SelectionResultItem { photoId: string; filename: string; notes: { text: string }[] }
export interface SelectionResults { selectionVersionId: string; finalizedAt: string; versionNumber: number; total: number; notesCount: number; items: SelectionResultItem[]; nextCursor: string | null }
export interface ResultPageOptions { limit?: number; cursor?: string; versionId?: string; search?: string; notesFilter?: 'all' | 'with' | 'without' }

function parseResultCursor(value: string): { filename: string; id: string; versionId: string; search: string; notesFilter: string } {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as { filename: string; id: string; versionId: string; search: string; notesFilter: string }
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (typeof parsed.filename === 'string' && uuid.test(parsed.id) && uuid.test(parsed.versionId) && typeof parsed.search === 'string' && typeof parsed.notesFilter === 'string') return parsed
  } catch { /* Invalid cursor is reported below. */ }
  throw new StudioOperationError('Cursor kết quả không hợp lệ', 400)
}

export async function getSelectionResults(pool: ConnectionPool, studioId: string, userId: string, albumId: string, page?: ResultPageOptions): Promise<SelectionResults> {
  return getManagedSelectionResults(pool, { kind: 'member', studioId, userId }, albumId, page)
}

// Without `page` every item is returned; exports rely on that.
export async function getManagedSelectionResults(pool: ConnectionPool, manager: AlbumManager, albumId: string, page?: ResultPageOptions): Promise<SelectionResults> {
  if (page?.limit !== undefined && (!Number.isInteger(page.limit) || page.limit < 1 || page.limit > 200)) throw new StudioOperationError('Kích thước trang không hợp lệ', 400)
  const after = page?.cursor ? parseResultCursor(page.cursor) : null
  const search = page?.search ?? ''
  const notesFilter = page?.notesFilter ?? 'all'
  return withManagedAlbum(pool, manager, albumId, 'album.view', async client => {
    const version = await client.query<{ id: string; version_number: number; finalized_at: Date; total: number; notes_count: number }>(
      `SELECT v.id, v.version_number, v.finalized_at,
        (SELECT count(*)::integer FROM selection_version_items i WHERE i.selection_version_id = v.id) AS total,
        (SELECT count(*)::integer FROM selection_version_items i WHERE i.selection_version_id = v.id AND jsonb_array_length(i.notes) > 0) AS notes_count
       FROM selection_versions v WHERE v.album_id = $1 AND ($2::uuid IS NULL OR v.id = $2::uuid)
       ORDER BY v.version_number DESC LIMIT 1`, [albumId, page?.versionId ?? null])
    if (!version.rows[0]) throw new StudioOperationError('Album chưa được chốt', 404)
    const versionId = version.rows[0].id
    if (after && (after.versionId !== versionId || after.search !== search || after.notesFilter !== notesFilter)) throw new StudioOperationError('Cursor kết quả không hợp lệ', 400)
    const items = await client.query<{ photo_id: string; filename: string; notes: { text: string }[] }>(
      `SELECT photo_id, filename, notes FROM selection_version_items
       WHERE selection_version_id = $1 AND ($2::text IS NULL OR (filename, photo_id) > ($2::text, $3::uuid))
       AND ($5 = '' OR position(lower($5) in lower(filename)) > 0)
       AND ($6 = 'all' OR ($6 = 'with' AND jsonb_array_length(notes) > 0) OR ($6 = 'without' AND jsonb_array_length(notes) = 0))
       ORDER BY filename, photo_id LIMIT $4`,
      [versionId, after?.filename ?? null, after?.id ?? null, page?.limit ? page.limit + 1 : null, search, notesFilter])
    const hasMore = page?.limit ? items.rows.length > page.limit : false
    const rows = page?.limit ? items.rows.slice(0, page.limit) : items.rows
    const mapped = rows.map(row => ({ photoId: row.photo_id, filename: row.filename, notes: row.notes.map(note => ({ text: note.text })) }))
    const last = mapped.at(-1)
    return {
      selectionVersionId: versionId, finalizedAt: version.rows[0].finalized_at.toISOString(),
      versionNumber: version.rows[0].version_number, total: version.rows[0].total, notesCount: version.rows[0].notes_count, items: mapped,
      nextCursor: hasMore && last ? Buffer.from(JSON.stringify({ filename: last.filename, id: last.photoId, versionId, search, notesFilter })).toString('base64url') : null,
    }
  })
}
