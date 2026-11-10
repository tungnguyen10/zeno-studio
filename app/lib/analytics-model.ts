export type SafePage = { path: string; title: string; location: string }

import { ANALYTICS_EVENT_NAMES } from '~~/shared/domain/analytics'
import type { AnalyticsEvent, AnalyticsErrorCode, AnalyticsErrorCategory, PhotoCountBucket } from '~~/shared/domain/analytics'
export type { AnalyticsEvent } from '~~/shared/domain/analytics'

const pages: Array<{ pattern: RegExp; path: string; title: string }> = [
  { pattern: /^\/$/, path: '/', title: 'Trang chủ' },
  { pattern: /^\/create$/, path: '/create', title: 'Tạo album' },
  { pattern: /^\/tools\/file-filter$/, path: '/tools/file-filter', title: 'Lọc file' },
  { pattern: /^\/studio$/, path: '/studio', title: 'Studio' },
  { pattern: /^\/studio\/analytics$/, path: '/studio/analytics', title: 'Thống kê studio' },
  { pattern: /^\/admin\/analytics$/, path: '/admin/analytics', title: 'Thống kê nền tảng' },
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

const albumIdentity = /^alb_[a-f0-9]{64}$/
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const buckets = ['0', '1_20', '21_50', '51_100', '101_300', 'over_300']
const errors = ['validation', 'network', 'timeout', 'permission', 'not_found', 'expired', 'conflict', 'rate_limited', 'upstream', 'unknown']
const categories = ['validation', 'network', 'api', 'permission', 'unknown']
const preAlbum = new Set(['studio_home_viewed', 'album_creation_started', 'album_creation_submitted', 'album_creation_failed'])
const enums: Record<string, readonly string[]> = {
  actor_type: ['studio', 'guest_admin', 'customer'],
  screen_name: ['studio_home', 'album_create', 'album_manage', 'guest_album', 'album_results', 'file_filter'],
  creation_flow: ['studio', 'guest'], entry_point: ['quick_create_page', 'studio_create_dialog'],
  source_method: ['google_drive'], photo_count_bucket: buckets, share_method: ['clipboard'],
  share_content: ['link', 'message'], share_channel: ['copy_link'], guest_auth_type: ['token'],
  outcome: ['conflict', 'limit_reached'], error_code: errors, error_category: categories,
  layout: ['justified', 'grid', 'masonry', 'list'], context: ['album', 'standalone'],
}
const fields: Record<string, string[]> = {
  studio_home_viewed: [], album_creation_started: ['creation_flow', 'entry_point'],
  album_creation_submitted: ['creation_flow', 'attempt_id', 'source_method'],
  album_created: ['creation_flow', 'attempt_id', 'event_id', 'photo_count_bucket', 'duration_ms', 'source_method'],
  album_creation_failed: ['creation_flow', 'attempt_id', 'error_code', 'error_category'],
  album_published: ['creation_flow', 'event_id', 'photo_count_bucket'],
  album_shared: ['share_method', 'share_content', 'share_channel'],
  album_opened: ['photo_count_bucket', 'guest_auth_type'], guest_selection_started: ['selection_count'],
  photo_selected: ['selected_count'], photo_unselected: ['selected_count'],
  guest_selection_save_failed: ['attempt_id', 'error_code', 'error_category'],
  guest_selection_save_rejected: ['attempt_id', 'outcome'], selection_finalize_submitted: ['attempt_id'],
  selection_finalized: ['attempt_id', 'event_id', 'surface', 'version_number', 'selection_count'],
  selection_finalize_failed: ['attempt_id', 'error_code', 'error_category'],
  selection_reopened: ['event_id', 'surface'], gallery_view_changed: ['layout', 'surface'], photo_note_saved: [],
  file_match_completed: ['context', 'version_number', 'matched_count', 'missing_count', 'ambiguous_count'],
}

const required: Record<string, string[]> = {
  studio_home_viewed: ['screen_name'], album_creation_started: ['creation_flow', 'entry_point'],
  album_creation_submitted: ['creation_flow', 'attempt_id', 'source_method'],
  album_created: ['creation_flow', 'attempt_id', 'event_id', 'photo_count_bucket', 'duration_ms', 'source_method'],
  album_creation_failed: ['creation_flow', 'attempt_id', 'error_code', 'error_category'],
  album_published: ['creation_flow', 'event_id', 'photo_count_bucket'],
  album_shared: ['share_method', 'share_content', 'share_channel'],
  album_opened: ['cycle', 'photo_count_bucket', 'guest_auth_type'],
  guest_selection_started: ['cycle', 'selection_count'], photo_selected: ['cycle', 'selected_count'], photo_unselected: ['cycle', 'selected_count'],
  guest_selection_save_failed: ['cycle', 'attempt_id', 'error_code', 'error_category'],
  guest_selection_save_rejected: ['cycle', 'attempt_id', 'outcome'], selection_finalize_submitted: ['cycle', 'attempt_id'],
  selection_finalized: ['cycle', 'version_number', 'selection_count', 'event_id', 'attempt_id', 'surface'],
  selection_finalize_failed: ['cycle', 'attempt_id', 'error_code', 'error_category'],
  selection_reopened: ['cycle', 'event_id', 'surface'], gallery_view_changed: ['layout', 'surface'],
  file_match_completed: ['context', 'matched_count', 'missing_count', 'ambiguous_count'],
}

export function photoCountBucket(value: number): PhotoCountBucket | undefined {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return undefined
  if (value === 0) return '0'
  if (value <= 20) return '1_20'
  if (value <= 50) return '21_50'
  if (value <= 100) return '51_100'
  if (value <= 300) return '101_300'
  return 'over_300'
}

export function normalizeAnalyticsError(cause: unknown): { error_code: AnalyticsErrorCode; error_category: AnalyticsErrorCategory } {
  try {
    const error = cause as { statusCode?: unknown; status?: unknown; response?: { status?: unknown }; name?: unknown; code?: unknown; cause?: { name?: unknown; code?: unknown }; request?: unknown }
    const status = error?.statusCode ?? error?.status ?? error?.response?.status
    if (typeof status === 'number') {
      if ([400, 422, 413].includes(status)) return { error_code: 'validation', error_category: 'validation' }
      if ([401, 403].includes(status)) return { error_code: 'permission', error_category: 'permission' }
      const mapped: Record<number, AnalyticsErrorCode> = { 404: 'not_found', 409: 'conflict', 410: 'expired', 429: 'rate_limited', 502: 'upstream', 503: 'upstream' }
      if (mapped[status]) return { error_code: mapped[status], error_category: 'api' }
      return { error_code: 'unknown', error_category: 'unknown' }
    }
    if (error?.name === 'TimeoutError' || error?.cause?.name === 'TimeoutError' || ['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT'].includes(String(error?.code ?? error?.cause?.code))) return { error_code: 'timeout', error_category: 'network' }
    if (error?.request || ['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'ERR_NETWORK'].includes(String(error?.code ?? error?.cause?.code))) return { error_code: 'network', error_category: 'network' }
  } catch { /* Untrusted error getters must never affect a workflow. */ }
  return { error_code: 'unknown', error_category: 'unknown' }
}

export type BuiltAnalyticsEvent = { name: string; params: Record<string, string | number> }
/** Runtime allowlist: never spread caller payloads into GA4. */
export function buildAnalyticsEvent(input: AnalyticsEvent): BuiltAnalyticsEvent | null {
  try {
    if (!input || typeof input !== 'object') return null
    const event = input as unknown as Record<string, unknown>
    const name = event.name
    if (typeof name !== 'string' || !(ANALYTICS_EVENT_NAMES as readonly string[]).includes(name)) return null
    const identity = (event.analytics as { albumId?: unknown } | undefined)?.albumId
    const validIdentity = typeof identity === 'string' && albumIdentity.test(identity)
    const standalone = name === 'file_match_completed' && event.context === 'standalone'
    if (required[name]?.some(key => event[key] === undefined)) return null
    if (name === 'file_match_completed' && !standalone && (event.version_number === undefined || event.cycle === undefined)) return null
    if (!preAlbum.has(name) && !standalone && !validIdentity) return null
    const params: Record<string, string | number> = {}
    if (validIdentity && !standalone) params.album_id = identity
    const allowed = [...(fields[name] ?? []), 'screen_name', ...(standalone ? [] : ['actor_type', 'cycle'])]
    for (const key of allowed) {
      const value = event[key]
      if (value === undefined) continue
      if (enums[key]) {
        if (typeof value !== 'string' || !enums[key].includes(value)) return null
      } else if (key === 'surface') {
        const values = name === 'gallery_view_changed' ? ['customer', 'studio'] : ['studio', 'guest_admin']
        if (typeof value !== 'string' || !values.includes(value)) return null
      } else if (key === 'attempt_id') {
        if (typeof value !== 'string' || !uuid.test(value)) return null
      } else if (key === 'event_id') {
        if (typeof value !== 'string' || !validIdentity) return null
        const prefix = `${name}:${identity}`
        if (name === 'album_created' || name === 'album_published') { if (value !== prefix) return null }
        else if (name === 'selection_finalized' || name === 'selection_reopened') {
          const suffix = name === 'selection_finalized' ? event.version_number : event.cycle
          if (value !== `${prefix}:${suffix}`) return null
        }
        else return null
      } else if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (key !== 'duration_ms' && !Number.isSafeInteger(value)) || (['cycle', 'version_number'].includes(key) && value === 0)) return null
      params[key] = value as string | number
    }
    return { name, params }
  } catch { return null }
}
