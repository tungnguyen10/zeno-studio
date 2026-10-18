import { parseDestinationPath } from '~~/shared/domain/destination-path'

export async function openRelativeDestination(source: FileSystemDirectoryHandle, path: string, create: boolean): Promise<FileSystemDirectoryHandle | null> {
  let current = source
  for (const part of parseDestinationPath(path)) {
    try { current = await current.getDirectoryHandle(part, { create }) }
    catch (error) {
      if (!create && error instanceof DOMException && error.name === 'NotFoundError') return null
      throw error
    }
  }
  return current
}

export async function destinationFiles(directory: FileSystemDirectoryHandle | null): Promise<Set<string>> {
  const names = new Set<string>()
  if (!directory) return names
  for await (const [name] of (directory as FileSystemDirectoryHandle & { entries(): AsyncIterableIterator<[string, FileSystemHandle]> }).entries()) names.add(name.normalize('NFC').toLowerCase())
  return names
}
