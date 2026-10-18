export interface LocalFile {
  name: string
  path: string
}

export interface MatchOptions {
  matchBy: 'full' | 'stem'
  fileType: 'jpeg' | 'raw' | 'all' | 'custom'
  customExtensions?: string[]
}

export interface MatchResult {
  requested: string[]
  matched: Array<{ requested: string; file: LocalFile }>
  missing: string[]
  ambiguous: Array<{ requested: string; files: LocalFile[] }>
}
export interface PhotoMatchResult {
  matched: Array<{ photoId: string; requested: string; file: LocalFile }>
  missing: Array<{ photoId: string; requested: string }>
  ambiguous: Array<{ photoId: string; requested: string; extension: string; files: LocalFile[] }>
}

const jpeg = new Set(['jpg', 'jpeg'])
const raw = new Set(['cr2', 'cr3', 'nef', 'arw', 'raf', 'dng', 'orf', 'rw2', 'pef'])
const customImages = new Set(['jpg', 'jpeg', 'png', 'tif', 'tiff', 'heic', 'heif', 'cr2', 'cr3', 'nef', 'arw', 'raf', 'dng', 'orf', 'rw2', 'pef'])

function extension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase()
}

function stem(name: string): string {
  const dot = name.lastIndexOf('.')
  return (dot < 0 ? name : name.slice(0, dot)).trim().normalize('NFC').toLowerCase()
}

function allowed(name: string, options: MatchOptions): boolean {
  const ext = extension(name)
  if (options.fileType === 'jpeg') return jpeg.has(ext)
  if (options.fileType === 'raw') return raw.has(ext)
  if (options.fileType === 'custom') return customImages.has(ext) && (options.customExtensions ?? []).some(item => item.replace(/^\./, '').toLowerCase() === ext)
  return jpeg.has(ext) || raw.has(ext)
}

export function matchLocalFiles(requested: string[], files: LocalFile[], options: MatchOptions): MatchResult {
  const photoResult = matchLocalPhotos(requested.map((filename, index) => ({ photoId: String(index), filename })), files, options)
  return {
    requested,
    matched: photoResult.matched.map(({ requested: name, file }) => ({ requested: name, file })),
    missing: photoResult.missing.map(item => item.requested),
    ambiguous: photoResult.ambiguous.map(({ requested: name, files: candidates }) => ({ requested: name, files: candidates })),
  }
}

export function matchLocalPhotos(requested: Array<{ photoId: string; filename: string }>, files: LocalFile[], options: MatchOptions): PhotoMatchResult {
  const result: PhotoMatchResult = { matched: [], missing: [], ambiguous: [] }
  const index = new Map<string, LocalFile[]>()
  for (const file of files) {
    if (!allowed(file.name, options)) continue
    const key = options.matchBy === 'stem' ? stem(file.name) : file.name.normalize('NFC').toLowerCase()
    const group = index.get(key) ?? []
    group.push(file)
    index.set(key, group)
  }

  for (const { photoId, filename: name } of requested) {
    const key = options.matchBy === 'stem' ? stem(name) : name.normalize('NFC').toLowerCase()
    const found = index.get(key) ?? []
    if (found.length === 0) { result.missing.push({ photoId, requested: name }); continue }
    const byExtension = new Map<string, LocalFile[]>()
    for (const file of found) {
      const ext = extension(file.name)
      const group = byExtension.get(ext) ?? []
      group.push(file)
      byExtension.set(ext, group)
    }
    for (const group of byExtension.values()) {
      if (group.length === 1) result.matched.push({ photoId, requested: name, file: group[0]! })
      else result.ambiguous.push({ photoId, requested: name, extension: extension(group[0]!.name), files: group })
    }
  }
  return result
}
