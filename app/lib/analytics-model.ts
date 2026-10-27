export type SafePage = { path: string; title: string; location: string }

export type AnalyticsEvent =
  | { name: 'album_created' | 'album_published'; creation_flow: 'guest' | 'studio' }
  | { name: 'album_opened' | 'photo_note_saved' }
  | { name: 'gallery_view_changed'; layout: 'justified' | 'grid' | 'masonry' | 'list'; surface: 'customer' | 'studio' }
  | { name: 'photo_selected' | 'photo_unselected'; selected_count?: number }
  | { name: 'selection_finalized' | 'selection_reopened'; surface: 'studio' | 'guest_admin' }
  | { name: 'file_match_completed'; matched_count: number; missing_count: number; ambiguous_count: number }

const pages: Array<{ pattern: RegExp; path: string; title: string }> = [
  { pattern: /^\/$/, path: '/', title: 'Trang chủ' },
  { pattern: /^\/create$/, path: '/create', title: 'Tạo album' },
  { pattern: /^\/tools\/file-filter$/, path: '/tools/file-filter', title: 'Lọc file' },
  { pattern: /^\/studio$/, path: '/studio', title: 'Studio' },
  { pattern: /^\/studio\/members$/, path: '/studio/members', title: 'Thành viên' },
  { pattern: /^\/studio\/invite$/, path: '/studio/invite', title: 'Lời mời' },
  { pattern: /^\/studio\/reset-password$/, path: '/studio/reset-password', title: 'Đặt lại mật khẩu' },
  { pattern: /^\/studio\/albums\/[^/]+\/results$/, path: '/studio/albums/:albumId/results', title: 'Kết quả album' },
  { pattern: /^\/studio\/albums\/[^/]+\/filter$/, path: '/studio/albums/:albumId/filter', title: 'Lọc ảnh album' },
  { pattern: /^\/studio\/albums\/[^/]+$/, path: '/studio/albums/:albumId', title: 'Album studio' },
  { pattern: /^\/guest\/albums\/[^/]+\/results$/, path: '/guest/albums/:albumId/results', title: 'Kết quả album' },
  { pattern: /^\/guest\/albums\/[^/]+\/filter$/, path: '/guest/albums/:albumId/filter', title: 'Lọc ảnh album' },
  { pattern: /^\/guest\/albums\/[^/]+$/, path: '/guest/albums/:albumId', title: 'Quản trị album' },
  { pattern: /^\/album\/[^/]+$/, path: '/album/:albumId', title: 'Album khách' },
]

function httpOrigin(rawOrigin: string): URL {
  const base = new URL(rawOrigin)
  if (
    (base.protocol !== 'http:' && base.protocol !== 'https:')
    || base.username
    || base.password
    || base.pathname !== '/'
    || base.search
    || base.hash
  ) {
    throw new Error('Analytics origin must be an HTTP(S) origin')
  }
  return base
}

export function safePage(rawPath: string, rawOrigin: string): SafePage {
  const origin = httpOrigin(rawOrigin).origin
  const pathname = new URL(rawPath, origin).pathname.replace(/\/+$/, '') || '/'
  const found = pages.find(page => page.pattern.test(pathname))
  const path = found?.path ?? '/other'
  return { path, title: found?.title ?? 'Trang khác', location: `${origin}${path}` }
}

export function safeReferrer(raw: string, rawOrigin: string): string | undefined {
  if (!raw) return undefined
  try {
    const origin = httpOrigin(rawOrigin).origin
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
    return url.origin === origin ? safePage(url.pathname, origin).location : `${url.origin}/`
  } catch {
    return undefined
  }
}

function count(value: number | undefined): number | undefined {
  return value !== undefined && Number.isSafeInteger(value) && value >= 0 ? value : undefined
}

export function buildAnalyticsEvent(event: AnalyticsEvent): { name: string; params: Record<string, string | number> } {
  switch (event.name) {
    case 'album_created':
    case 'album_published':
      return { name: event.name, params: { creation_flow: event.creation_flow } }
    case 'gallery_view_changed':
      return { name: event.name, params: { layout: event.layout, surface: event.surface } }
    case 'photo_selected':
    case 'photo_unselected': {
      const selected = count(event.selected_count)
      return { name: event.name, params: selected === undefined ? {} : { selected_count: selected } }
    }
    case 'selection_finalized':
    case 'selection_reopened':
      return { name: event.name, params: { surface: event.surface } }
    case 'file_match_completed': {
      const matched = count(event.matched_count)
      const missing = count(event.missing_count)
      const ambiguous = count(event.ambiguous_count)
      return {
        name: event.name,
        params: {
          ...(matched === undefined ? {} : { matched_count: matched }),
          ...(missing === undefined ? {} : { missing_count: missing }),
          ...(ambiguous === undefined ? {} : { ambiguous_count: ambiguous }),
        },
      }
    }
    case 'album_opened':
    case 'photo_note_saved':
      return { name: event.name, params: {} }
  }
}
