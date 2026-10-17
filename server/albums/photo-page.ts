import type { QueryClient } from '../db/context'
import { StudioOperationError } from '../studios/error'

export type PhotoFilter = 'all' | 'selected' | 'previous'

export interface PagedPhoto {
  id: string
  sourceFileId: string
  filename: string
  width: number | null
  height: number | null
  status: 'READY' | 'MISSING' | 'BROKEN'
  sortOrder: number
  selected: boolean
  previouslyFinalized: boolean
}

export interface PhotoPage {
  items: PagedPhoto[]
  nextCursor: string | null
  total: number
  selectedCount: number
}

export interface PhotoPageOptions {
  limit: number
  cursor?: string
  filter: PhotoFilter
  includePrevious?: boolean
}

export const MAX_PHOTO_PAGE_SIZE = 200

function parseCursor(value: string): { sortOrder: number; id: string } {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as { sortOrder: number; id: string }
    if (Number.isInteger(parsed.sortOrder) && parsed.sortOrder >= 0 && /^[0-9a-f-]{36}$/i.test(parsed.id)) return parsed
  } catch { /* Invalid cursor is reported below. */ }
  throw new StudioOperationError('Cursor ảnh không hợp lệ', 400)
}

export function readPhotoPageQuery(query: Record<string, unknown>, defaultLimit = 60, allowPrevious = false): PhotoPageOptions {
  const limit = typeof query.limit === 'string' ? Number(query.limit) : defaultLimit
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PHOTO_PAGE_SIZE) throw new StudioOperationError('Kích thước trang không hợp lệ', 400)
  if (query.cursor !== undefined && typeof query.cursor !== 'string') throw new StudioOperationError('Cursor ảnh không hợp lệ', 400)
  const filter = query.filter ?? 'all'
  if (filter !== 'all' && filter !== 'selected' && !(allowPrevious && filter === 'previous')) throw new StudioOperationError('Bộ lọc ảnh không hợp lệ', 400)
  return { limit, cursor: query.cursor as string | undefined, filter }
}

// Customer's shared list of the album's current cycle; RLS hides it from contexts that may not read selections.
const CHOSEN = `chosen AS (
  SELECT s.photo_id FROM selections s
  JOIN selection_lists l ON l.id = s.list_id
  JOIN selection_rounds r ON r.id = l.round_id
  WHERE s.album_id = $1 AND l.kind = 'shared' AND r.round_number = 1
    AND r.cycle = (SELECT current_cycle FROM albums WHERE id = $1)
)`

const PREVIOUSLY_CHOSEN = `previously_chosen AS (
  SELECT i.photo_id FROM selection_version_items i
  WHERE $7::boolean AND i.selection_version_id = (
    SELECT id FROM selection_versions WHERE album_id = $1 ORDER BY version_number DESC LIMIT 1
  )
)`

export async function queryPhotoPage(client: QueryClient, albumId: string, options: PhotoPageOptions): Promise<PhotoPage> {
  if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > MAX_PHOTO_PAGE_SIZE) throw new StudioOperationError('Kích thước trang không hợp lệ', 400)
  const after = options.cursor ? parseCursor(options.cursor) : null
  const onlySelected = options.filter === 'selected'
  const onlyPrevious = options.filter === 'previous'
  const result = await client.query<{ id: string; source_file_id: string; filename: string; width: number | null; height: number | null; status: PagedPhoto['status']; sort_order: number; selected: boolean; previously_finalized: boolean }>(
    `WITH ${CHOSEN}, ${PREVIOUSLY_CHOSEN}
     SELECT p.id, p.source_file_id, p.filename, p.width, p.height, p.status, p.sort_order,
       (c.photo_id IS NOT NULL) AS selected, (v.photo_id IS NOT NULL) AS previously_finalized
     FROM photos p LEFT JOIN chosen c ON c.photo_id = p.id LEFT JOIN previously_chosen v ON v.photo_id = p.id
     WHERE p.album_id = $1
       AND ($2::integer IS NULL OR (p.sort_order, p.id) > ($2::integer, $3::uuid))
       AND (NOT $4::boolean OR c.photo_id IS NOT NULL)
       AND (NOT $5::boolean OR v.photo_id IS NOT NULL)
     ORDER BY p.sort_order, p.id LIMIT $6`,
    [albumId, after?.sortOrder ?? null, after?.id ?? null, onlySelected, onlyPrevious, options.limit + 1, options.includePrevious ?? false])
  const counts = await client.query<{ total: number; selected_count: number }>(
    `WITH ${CHOSEN}
     SELECT count(*)::integer AS total, count(c.photo_id)::integer AS selected_count
     FROM photos p LEFT JOIN chosen c ON c.photo_id = p.id WHERE p.album_id = $1`, [albumId])
  const hasMore = result.rows.length > options.limit
  const items = result.rows.slice(0, options.limit).map(row => ({
    id: row.id, sourceFileId: row.source_file_id, filename: row.filename, width: row.width, height: row.height,
    status: row.status, sortOrder: row.sort_order, selected: row.selected, previouslyFinalized: row.previously_finalized,
  }))
  const last = items.at(-1)
  return {
    items,
    nextCursor: hasMore && last ? Buffer.from(JSON.stringify({ sortOrder: last.sortOrder, id: last.id })).toString('base64url') : null,
    total: counts.rows[0]?.total ?? 0,
    selectedCount: counts.rows[0]?.selected_count ?? 0,
  }
}
