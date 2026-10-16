export interface ExportItem {
  photoId: string
  filename: string
  notes: Array<{ text: string }>
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

function csv(rows: string[][]): string {
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

export function exportSelectionCsv(items: ExportItem[]): string {
  return csv([['photo_id', 'filename'], ...items.map(item => [item.photoId, item.filename])])
}

export function exportNotesCsv(items: ExportItem[]): string {
  const rows = items.flatMap(item => item.notes.map(note => [item.photoId, item.filename, note.text]))
  return csv([['photo_id', 'filename', 'note'], ...rows])
}

export function exportFilenamesTxt(items: ExportItem[]): string {
  return items.map(item => item.filename).join('\n') + (items.length ? '\n' : '')
}

export function exportNotesTxt(items: ExportItem[]): string {
  return items.flatMap(item => item.notes.map(note => `${item.filename}\n${note.text}\n`)).join('\n')
}
