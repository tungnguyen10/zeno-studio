import type { LocalFile } from '~~/shared/domain/file-matching'

type EnumerableDirectory = FileSystemDirectoryHandle & { entries(): AsyncIterableIterator<[string, FileSystemHandle]> }
export interface IndexedFile extends LocalFile { handle: FileSystemFileHandle }
export interface ScanResult { files: IndexedFile[]; warnings: string[] }

export async function scanDirectory(
  source: FileSystemDirectoryHandle,
  options: { excludedPaths?: string[]; signal?: AbortSignal; onProgress?: (count: number) => void } = {},
): Promise<ScanResult> {
  const files: IndexedFile[] = []
  const warnings: string[] = []
  const excluded = new Set((options.excludedPaths ?? []).map(path => path.normalize('NFC').toLowerCase()))
  let seen = 0
  async function visit(directory: FileSystemDirectoryHandle, prefix: string, depth: number): Promise<void> {
    if (depth > 64) { warnings.push(`Bỏ qua ${prefix}: vượt giới hạn 64 cấp.`); return }
    try {
      for await (const [name, handle] of (directory as EnumerableDirectory).entries()) {
        if (options.signal?.aborted) throw new DOMException('Scan stopped', 'AbortError')
        const path = prefix ? `${prefix}/${name}` : name
        if (handle.kind === 'directory') {
          if (name.normalize('NFC').toLowerCase() === 'selected' || excluded.has(path.normalize('NFC').toLowerCase())) continue
          const child = handle as FileSystemDirectoryHandle
          if (typeof child.getFileHandle === 'function') {
            try { await child.getFileHandle('.zeno-filter-output'); continue }
            catch (error) { if (!(error instanceof DOMException) || error.name !== 'NotFoundError') throw error }
          }
          await visit(child, path, depth + 1)
        } else {
          files.push({ name, path, handle: handle as FileSystemFileHandle })
        }
        seen++
        if (seen % 100 === 0) {
          options.onProgress?.(seen)
          await new Promise<void>(resolve => setTimeout(resolve, 0))
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      warnings.push(`Không đọc được ${prefix || source.name}.`)
    }
  }
  await visit(source, '', 0)
  options.onProgress?.(seen)
  return { files, warnings }
}
