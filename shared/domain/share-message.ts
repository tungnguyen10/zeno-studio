export function buildShareMessage({ albumTitle, link }: { albumTitle?: string | null; link: string }): string {
  const title = albumTitle?.trim()
  const name = title ? `Album "${title}"` : 'Album ảnh của bạn'
  return `${name} đã sẵn sàng. Mở link bằng Safari/Chrome (trong Zalo/Messenger: bấm ⋯ → Mở bằng trình duyệt) để chọn ảnh:\n\n${link}`
}
