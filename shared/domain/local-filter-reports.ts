import { csv } from './csv'

export interface FilterManifestItem { photoId: string; originalFilename: string; notes: Array<{ text: string }> }
export interface FilterReportEntry { photoId: string; sourcePath: string; outputPath: string; status: string; reason: string }

export function buildFilterReports(version: string, items: FilterManifestItem[], entries: FilterReportEntry[]): { notes: string; report: string } {
  const byPhoto = new Map<string, FilterReportEntry[]>()
  for (const entry of entries) {
    const group = byPhoto.get(entry.photoId) ?? []
    group.push(entry)
    byPhoto.set(entry.photoId, group)
  }
  const notesRows: string[][] = [['selection_version', 'original_filename', 'copied_filename', 'relative_output_path', 'retouch_notes']]
  const reportRows: string[][] = [['original_filename', 'matched_source', 'output_path', 'status', 'reason']]
  for (const item of items) {
    const rows = byPhoto.get(item.photoId) ?? [{ photoId: item.photoId, sourcePath: '', outputPath: '', status: 'missing', reason: '' }]
    const copied = rows.filter(row => row.status === 'copied')
    notesRows.push([version, item.originalFilename, copied.map(row => row.outputPath.split('/').at(-1)).join(' | '), copied.map(row => row.outputPath).join(' | '), item.notes.map(note => note.text).join('\n')])
    for (const row of rows) reportRows.push([item.originalFilename, row.sourcePath, row.outputPath, row.status, row.reason])
  }
  return { notes: '\uFEFF' + csv(notesRows), report: '\uFEFF' + csv(reportRows) }
}
