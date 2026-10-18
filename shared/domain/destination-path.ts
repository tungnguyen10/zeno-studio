const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i

export function parseDestinationPath(input: string): string[] {
  if (!input || /^[\\/]/.test(input) || /^[a-z]:/i.test(input)) throw new Error('Chỉ nhập đường dẫn con trong thư mục RAW.')
  const parts = input.replaceAll('\\', '/').split('/')
  if (parts.some(part => !part || part === '.' || part === '..' || /[<>:"|?*\x00-\x1f]/.test(part) || /[. ]$/.test(part) || reserved.test(part))) {
    throw new Error('Tên thư mục không hợp lệ trên macOS hoặc Windows.')
  }
  return parts
}

export function destinationCollisionKey(path: string): string {
  return path.replaceAll('\\', '/').normalize('NFC').toLowerCase()
}
