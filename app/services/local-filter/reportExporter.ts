import { destinationFiles } from './destination'

export async function writeOutputMarker(destination: FileSystemDirectoryHandle): Promise<void> {
  try { await destination.getFileHandle('.zeno-filter-output'); return }
  catch (error) { if (!(error instanceof DOMException) || error.name !== 'NotFoundError') throw error }
  const handle = await destination.getFileHandle('.zeno-filter-output', { create: true })
  const stream = await handle.createWritable()
  await new Blob(['Zeno Studio local filter output\n']).stream().pipeTo(stream)
}

export async function writeFilterReports(destination: FileSystemDirectoryHandle, version: number, reports: { notes: string; report: string }): Promise<string[]> {
  const used = await destinationFiles(destination)
  const written: string[] = []
  for (const [base, content] of [['RETOUCH_NOTES', reports.notes], ['SELECTION_REPORT', reports.report]] as const) {
    let name = `${base}.csv`
    let index = 0
    while (used.has(name.toLowerCase())) name = `${base}_v${version}${index++ ? `_${index}` : ''}.csv`
    const handle = await destination.getFileHandle(name, { create: true })
    const writer = await handle.createWritable()
    await new Blob([content], { type: 'text/csv;charset=utf-8' }).stream().pipeTo(writer)
    used.add(name.toLowerCase())
    written.push(name)
  }
  return written
}
