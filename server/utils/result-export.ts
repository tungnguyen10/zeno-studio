import type { H3Event } from 'h3'
import type { ResultPageOptions, SelectionResults } from '../albums/selection'
import { exportFilenamesTxt, exportNotesCsv, exportNotesTxt, exportSelectionCsv } from '../../shared/domain/export'

const FORMATS = {
  'selection-csv': { filename: 'selection.csv', type: 'text/csv; charset=utf-8', render: exportSelectionCsv },
  'notes-csv': { filename: 'notes.csv', type: 'text/csv; charset=utf-8', render: exportNotesCsv },
  'filenames-txt': { filename: 'filenames.txt', type: 'text/plain; charset=utf-8', render: exportFilenamesTxt },
  'notes-txt': { filename: 'notes.txt', type: 'text/plain; charset=utf-8', render: exportNotesTxt },
} as const

export function resultPageQuery(event: H3Event): ResultPageOptions {
  const query = getQuery(event)
  if (query.limit !== undefined && typeof query.limit !== 'string') throw createError({ statusCode: 400, statusMessage: 'Kích thước trang không hợp lệ' })
  const limit = typeof query.limit === 'string' ? Number(query.limit) : 100
  if (query.cursor !== undefined && typeof query.cursor !== 'string') throw createError({ statusCode: 400, statusMessage: 'Cursor kết quả không hợp lệ' })
  if (query.versionId !== undefined && (typeof query.versionId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query.versionId))) throw createError({ statusCode: 400, statusMessage: 'Phiên bản không hợp lệ' })
  if (query.search !== undefined && (typeof query.search !== 'string' || query.search.length > 200)) throw createError({ statusCode: 400, statusMessage: 'Từ khóa không hợp lệ' })
  if (query.notesFilter !== undefined && (typeof query.notesFilter !== 'string' || !['all', 'with', 'without'].includes(query.notesFilter))) throw createError({ statusCode: 400, statusMessage: 'Bộ lọc ghi chú không hợp lệ' })
  return { limit, cursor: query.cursor as string | undefined, versionId: query.versionId as string | undefined, search: query.search as string | undefined, notesFilter: query.notesFilter as ResultPageOptions['notesFilter'] }
}

export function exportFormat(event: H3Event): keyof typeof FORMATS {
  const format = getQuery(event).format
  if (typeof format !== 'string' || !(format in FORMATS)) throw createError({ statusCode: 400, statusMessage: 'Định dạng xuất không hợp lệ' })
  return format as keyof typeof FORMATS
}

export function sendResultExport(event: H3Event, format: keyof typeof FORMATS, results: SelectionResults): string {
  const spec = FORMATS[format]
  setHeader(event, 'content-type', spec.type)
  setHeader(event, 'content-disposition', `attachment; filename="${spec.filename}"`)
  setHeader(event, 'cache-control', 'no-store')
  // UTF-8 BOM keeps Vietnamese text readable when Excel opens the CSV.
  return (format.endsWith('csv') ? '\uFEFF' : '') + spec.render(results.items)
}
