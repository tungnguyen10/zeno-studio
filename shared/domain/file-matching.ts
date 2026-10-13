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

const jpeg = new Set(['jpg', 'jpeg'])
const raw = new Set(['cr2', 'cr3', 'nef', 'arw', 'raf', 'dng', 'orf', 'rw2'])

function extension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase()
}

function stem(name: string): string {
  const dot = name.lastIndexOf('.')
  return (dot < 0 ? name : name.slice(0, dot)).normalize('NFC').toLocaleLowerCase()
}

function allowed(name: string, options: MatchOptions): boolean {
  const ext = extension(name)
  if (options.fileType === 'jpeg') return jpeg.has(ext)
  if (options.fileType === 'raw') return raw.has(ext)
  if (options.fileType === 'custom') return (options.customExtensions ?? []).some(item => item.replace(/^\./, '').toLowerCase() === ext)
  return jpeg.has(ext) || raw.has(ext)
}

export function matchLocalFiles(requested: string[], files: LocalFile[], options: MatchOptions): MatchResult {
  const result: MatchResult = { requested, matched: [], missing: [], ambiguous: [] }
  const candidates = files.filter(file => allowed(file.name, options))

  for (const name of requested) {
    const key = options.matchBy === 'stem' ? stem(name) : name.normalize('NFC').toLocaleLowerCase()
    const found = candidates.filter(file =>
      (options.matchBy === 'stem' ? stem(file.name) : file.name.normalize('NFC').toLocaleLowerCase()) === key,
    )
    if (found.length === 1) result.matched.push({ requested: name, file: found[0]! })
    else if (found.length === 0) result.missing.push(name)
    else result.ambiguous.push({ requested: name, files: found })
  }
  return result
}
