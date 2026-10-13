export interface CopyDestination {
  getFileHandle(name: string, options?: { create?: boolean }): Promise<{
    createWritable?: () => Promise<WritableStream<Uint8Array>>
  }>
}

export interface CopyResult {
  copied: string[]
  skipped: string[]
  errors: Array<{ filename: string; message: string }>
  outcomes: Array<{ requested: string; filename: string; sourcePath: string; status: 'copied' | 'skipped' | 'error'; detail: string }>
}

export async function copyMatchedFiles(
  matches: Array<{ requested: string; file: File; sourcePath?: string }>,
  destination: CopyDestination,
  onProgress?: (done: number, total: number) => void,
): Promise<CopyResult> {
  const result: CopyResult = { copied: [], skipped: [], errors: [], outcomes: [] }
  for (const { requested, file, sourcePath } of matches) {
    try {
      try {
        await destination.getFileHandle(file.name)
        result.skipped.push(file.name)
        result.outcomes.push({ requested, filename: file.name, sourcePath: sourcePath ?? file.name, status: 'skipped', detail: 'File đích đã tồn tại' })
        continue
      } catch (error) {
        if (!(error instanceof DOMException) || error.name !== 'NotFoundError') throw error
      }
      const target = await destination.getFileHandle(file.name, { create: true })
      if (!target.createWritable) throw new Error('Destination does not support writing')
      const stream = await target.createWritable()
      await file.stream().pipeTo(stream)
      result.copied.push(file.name)
      result.outcomes.push({ requested, filename: file.name, sourcePath: sourcePath ?? file.name, status: 'copied', detail: '' })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      result.errors.push({ filename: file.name, message })
      result.outcomes.push({ requested, filename: file.name, sourcePath: sourcePath ?? file.name, status: 'error', detail: message })
    } finally {
      onProgress?.(result.copied.length + result.skipped.length + result.errors.length, matches.length)
    }
  }
  return result
}
