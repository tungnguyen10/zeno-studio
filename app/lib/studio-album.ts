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
}
