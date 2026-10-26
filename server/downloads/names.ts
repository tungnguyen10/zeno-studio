export function safeFilename(input: string): string {
  const last = input.split(/[/\\]/).at(-1) ?? ''
  const cleaned = last.replace(/[\u0000-\u001f\u007f]/g, '').trim().replace(/^\.+/, '')
  return cleaned || 'image'
}

export function contentDisposition(input: string): string {
  const filename = safeFilename(input)
  const fallback = filename.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '_').replace(/["\\;%]/g, '_') || 'image'
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

export function uniqueZipNames(inputs: string[]): string[] {
  const used = new Set<string>()
  return inputs.map(input => {
    const clean = safeFilename(input)
    const dot = clean.lastIndexOf('.')
    const base = dot > 0 ? clean.slice(0, dot) : clean
    const extension = dot > 0 ? clean.slice(dot) : ''
    let name = clean
    let index = 2
    while (used.has(name.toLocaleLowerCase())) name = `${base} (${index++})${extension}`
    used.add(name.toLocaleLowerCase())
    return name
  })
}
