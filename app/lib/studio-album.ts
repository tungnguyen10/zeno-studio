import type { AlbumStatus } from '~~/shared/domain/album-status'

export interface StudioAlbum {
  id: string
  title: string
  status: AlbumStatus
  expiresAt: string
  photoCount: number
  selectedCount: number
  selectionLimit: number | null
  latestVersionNumber: number | null
  archivedAt: string | null
}

export type AlbumManageAction = 'edit' | 'archive' | 'restore' | 'delete'

export const STATUS_BADGE_CLASSES: Record<AlbumStatus, string> = {
  DRAFT: 'bg-skeleton text-muted',
  PUBLISHED: 'bg-tint text-brand',
  FINALIZED: 'bg-brand text-white',
  DELIVERED: 'bg-brand-soft/25 text-brand',
  EXPIRED: 'bg-danger-soft text-danger',
}
