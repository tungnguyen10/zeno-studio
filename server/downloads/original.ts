import { withDatabaseContext, type ConnectionPool } from '../db/context'
import { DriveSourceError, type GoogleDriveAdapter } from '../photo-sources/google-drive'
import { StudioOperationError } from '../studios/error'
import type { AlbumAccess } from '../albums/access'

export interface OriginalPhoto {
  photoId: string
  sourceFileId: string
  resourceKey?: string
  metadata: Awaited<ReturnType<GoogleDriveAdapter['getOriginalMetadata']>>
}

export function originalSourceError(error: unknown): StudioOperationError {
  if (error instanceof DriveSourceError) {
    if (error.status === 404) return new StudioOperationError('Ảnh gốc không còn trên Google Drive', 404)
    if (error.status === 403 || error.status === 422) return new StudioOperationError('Ảnh gốc không được phép tải từ Google Drive', 422)
    if (error.status === 429 || error.status >= 500) return new StudioOperationError('Google Drive đang bận, vui lòng thử lại', 503)
  }
  return new StudioOperationError('Không lấy được ảnh gốc từ Google Drive', 502)
}

export async function resolveOriginal(pool: ConnectionPool, access: AlbumAccess, photoId: string, source: GoogleDriveAdapter): Promise<OriginalPhoto> {
  const photo = await withDatabaseContext(pool, {
    albumId: access.albumId, scope: access.scope, participantId: access.participantId ?? undefined,
  }, async client => {
    const result = await client.query<{ source_file_id: string; resource_key: string | null; status: string }>(
      'SELECT source_file_id, resource_key, status FROM photos WHERE id = $1 AND album_id = $2',
      [photoId, access.albumId])
    return result.rows[0]
  })
  if (!photo || photo.status === 'MISSING') throw new StudioOperationError('Ảnh không thuộc album hoặc không còn khả dụng', 404)
  const resourceKey = photo.resource_key ?? undefined
  try {
    return { photoId, sourceFileId: photo.source_file_id, resourceKey,
      metadata: await source.getOriginalMetadata(photo.source_file_id, resourceKey) }
  } catch (error) { throw originalSourceError(error) }
}
