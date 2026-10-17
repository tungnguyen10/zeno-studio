export type AlbumStatus = 'DRAFT' | 'PUBLISHED' | 'FINALIZED' | 'EXPIRED' | 'DELIVERED'
export type AlbumFilter = 'all' | AlbumStatus

export const ALBUM_STATUS_LABELS: Record<AlbumStatus, string> = {
  DRAFT: 'Nháp',
  PUBLISHED: 'Khách đang chọn',
  FINALIZED: 'Đã chốt',
  DELIVERED: 'Đã bàn giao',
  EXPIRED: 'Hết hạn',
}

export const ALBUM_FILTERS: ReadonlyArray<{ value: AlbumFilter; label: string }> = [
  { value: 'all', label: 'Tất cả' },
  { value: 'DRAFT', label: ALBUM_STATUS_LABELS.DRAFT },
  { value: 'PUBLISHED', label: ALBUM_STATUS_LABELS.PUBLISHED },
  { value: 'FINALIZED', label: ALBUM_STATUS_LABELS.FINALIZED },
  { value: 'DELIVERED', label: ALBUM_STATUS_LABELS.DELIVERED },
  { value: 'EXPIRED', label: ALBUM_STATUS_LABELS.EXPIRED },
]

export const WORKFLOW_STEPS = ['Nháp', 'Khách chọn ảnh', 'Chốt & hậu kỳ', 'Bàn giao'] as const

export const PRODUCTION_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Chờ chỉnh',
  RETOUCHING: 'Đang chỉnh',
  WAITING_REVIEW: 'Chờ khách duyệt',
  APPROVED: 'Khách đã duyệt',
  REVISION_REQUESTED: 'Cần chỉnh lại',
  DELIVERED: 'Đã bàn giao',
}

// Tasks past retouching: waiting for review, approved or delivered.
const RETOUCHED_STATUSES = new Set(['WAITING_REVIEW', 'APPROVED', 'DELIVERED'])

export function countRetouched(tasks: ReadonlyArray<{ status: string }>): number {
  return tasks.filter(task => RETOUCHED_STATUSES.has(task.status)).length
}

export const EXPIRY_WARNING_DAYS = 3
const DAY_MS = 24 * 60 * 60 * 1000

export interface AlbumTiming {
  status: AlbumStatus
  expiresAt: string | Date
}

// The expiry job lags behind the clock, so an overdue album is shown as expired before it is flipped.
export function effectiveStatus(album: AlbumTiming, now: Date = new Date()): AlbumStatus {
  return album.status !== 'EXPIRED' && new Date(album.expiresAt).getTime() <= now.getTime() ? 'EXPIRED' : album.status
}

export function daysLeft(expiresAt: string | Date, now: Date = new Date()): number {
  return Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / DAY_MS)
}

export function workflowStepIndex(status: AlbumStatus): number | null {
  switch (status) {
    case 'DRAFT': return 0
    case 'PUBLISHED': return 1
    case 'FINALIZED': return 2
    case 'DELIVERED': return 3
    default: return null
  }
}

export type NextStepKind = 'publish' | 'share' | 'finalize' | 'results' | 'detail'

export const NEXT_STEP_LABELS: Record<NextStepKind, string> = {
  publish: 'Xuất bản',
  share: 'Chia sẻ link khách hàng',
  finalize: 'Xem & chốt ảnh',
  results: 'Xem kết quả',
  detail: 'Chi tiết',
}

export interface NextStep {
  kind: NextStepKind
  hint: string
}

export interface NextStepInput {
  status: AlbumStatus
  selectedCount: number
  selectionLimit: number | null
  latestVersionNumber: number | null
}

export function nextStep(album: NextStepInput, can: { publish: boolean; share: boolean }): NextStep {
  switch (album.status) {
    case 'EXPIRED':
      return { kind: 'detail', hint: 'Album đã hết hạn' }
    case 'DRAFT':
      return can.publish
        ? { kind: 'publish', hint: 'Xuất bản để lấy link gửi khách' }
        : { kind: 'detail', hint: 'Chờ quản lý xuất bản' }
    case 'PUBLISHED': {
      if (album.selectedCount > 0) {
        const limit = album.selectionLimit === null ? '' : `/${album.selectionLimit}`
        return { kind: 'finalize', hint: `Khách đã chọn ${album.selectedCount}${limit} ảnh` }
      }
      return { kind: can.share ? 'share' : 'detail', hint: 'Chờ khách chọn ảnh' }
    }
    case 'FINALIZED':
      return { kind: 'results', hint: album.latestVersionNumber ? `Đã chốt phiên bản ${album.latestVersionNumber}, bắt đầu hậu kỳ` : 'Đã chốt, bắt đầu hậu kỳ' }
    case 'DELIVERED':
      return { kind: 'results', hint: 'Đã bàn giao cho khách' }
  }
}

function fold(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/đ/g, 'd').trim()
}

export function countByFilter(albums: ReadonlyArray<AlbumTiming>, now: Date = new Date()): Record<AlbumFilter, number> {
  const counts: Record<AlbumFilter, number> = { all: albums.length, DRAFT: 0, PUBLISHED: 0, FINALIZED: 0, DELIVERED: 0, EXPIRED: 0 }
  for (const album of albums) counts[effectiveStatus(album, now)]++
  return counts
}

export function filterAlbums<T extends AlbumTiming & { title: string }>(albums: ReadonlyArray<T>, filter: AlbumFilter, query: string, now: Date = new Date()): T[] {
  const needle = fold(query)
  return albums.filter(album =>
    (filter === 'all' || effectiveStatus(album, now) === filter) && (!needle || fold(album.title).includes(needle)))
}
