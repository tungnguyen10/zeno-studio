import { parseDestinationPath } from '~~/shared/domain/destination-path'

export interface CopyJobItem {
  id: string
  requested: string
  sourcePath: string
  outputPath: string
  handle: FileSystemFileHandle
}
export type CopyStatus = 'copied' | 'skipped' | 'failed' | 'partial' | 'cancelled'
export interface CopyOutcome extends Omit<CopyJobItem, 'handle'> { status: CopyStatus; reason: string }
type PermissionHandle = { queryPermission?: (options: { mode: 'read' | 'readwrite' }) => Promise<PermissionState> }

export async function copyLocalFiles(
  plan: CopyJobItem[], destination: FileSystemDirectoryHandle,
  options: { signal?: AbortSignal; onCurrent?: (item: CopyJobItem) => void; onProgress?: (outcomes: CopyOutcome[]) => void } = {},
): Promise<CopyOutcome[]> {
  const outcomes: CopyOutcome[] = []
  for (const item of plan) {
    if (options.signal?.aborted) {
      outcomes.push({ id: item.id, requested: item.requested, sourcePath: item.sourcePath, outputPath: item.outputPath, status: 'cancelled', reason: 'Đã dừng trước khi copy' })
      continue
    }
    let created = false
    let status: CopyStatus = 'copied'
    let reason = ''
    try {
      options.onCurrent?.(item)
      if (await (item.handle as PermissionHandle).queryPermission?.({ mode: 'read' }) === 'denied') throw new Error('Không có quyền đọc file nguồn')
      if (await (destination as PermissionHandle).queryPermission?.({ mode: 'readwrite' }) === 'denied') throw new Error('Không có quyền ghi thư mục đích')
      const parts = parseDestinationPath(item.outputPath)
      const name = parts.pop()!
      let folder = destination
      for (const part of parts) folder = await folder.getDirectoryHandle(part, { create: true })
      try {
        await folder.getFileHandle(name)
        status = 'skipped'
        reason = 'File đích đã tồn tại'
      } catch (error) {
        if (!(error instanceof DOMException) || error.name !== 'NotFoundError') throw error
        const source = await item.handle.getFile()
        const target = await folder.getFileHandle(name, { create: true })
        created = true
        if (await item.handle.isSameEntry?.(target)) throw new Error('Nguồn và đích là cùng một file')
        const writer = await target.createWritable()
        await source.stream().pipeTo(writer)
        if ((await target.getFile()).size !== source.size) throw new Error('Kích thước file đích không khớp')
      }
    } catch (error) {
      status = created ? 'partial' : 'failed'
      reason = error instanceof Error ? error.message : 'Không thể copy file'
    }
    outcomes.push({ id: item.id, requested: item.requested, sourcePath: item.sourcePath, outputPath: item.outputPath, status, reason })
    options.onProgress?.([...outcomes])
  }
  return outcomes
}
