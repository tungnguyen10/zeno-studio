export type ResultView = 'selection' | 'production' | 'delivery'
export type ProductionItem = { id: string; filename: string; status: string }
export type ProductionPage = { canDeliver: boolean; items: ProductionItem[]; review?: { roundNumber: number; status: string } | null }
export type ResultSummary = { selectionVersionId: string; finalizedAt: string; versionNumber: number; total: number; notesCount: number }

export const RESULT_EXPORTS = [
  { key: 'filenames-txt', label: 'TXT', filename: 'filenames.txt' },
  { key: 'selection-csv', label: 'Selection CSV', filename: 'selection.csv' },
  { key: 'notes-csv', label: 'Notes CSV', filename: 'notes.csv' },
  { key: 'notes-txt', label: 'Notes TXT', filename: 'notes.txt' },
] as const
export type ResultExportFormat = typeof RESULT_EXPORTS[number]['key']
