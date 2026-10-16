import type { PhotoSourceAdapter } from './photo-source'
import { parseGoogleDriveFolderLink } from './google-drive'

export class DriveVerificationError extends Error {
  constructor(message: string, readonly stats?: { photoCount: number; pageCount: number; resourceKeyPhotos: number; durationMs: number }) {
    super(message)
  }
}

export interface DriveVerificationSummary {
  photoCount: number
  pageCount: number
  sampledPhotos: number
  resourceKeySampled: boolean
  scaleVerified: boolean
  durationMs: number
}

export async function verifyPublicDrive(source: PhotoSourceAdapter, folderUrl: string): Promise<DriveVerificationSummary> {
  const startedAt = performance.now()
  const folder = parseGoogleDriveFolderLink(folderUrl)
  const photos: Awaited<ReturnType<PhotoSourceAdapter['listPhotos']>>['items'] = []
  const seenIds = new Set<string>()
  const seenPages = new Set<string>()
  let pageToken: string | undefined
  let pageCount = 0

  do {
    const page = await source.listPhotos(folder, pageToken)
    pageCount++
    for (const photo of page.items) {
      if (seenIds.has(photo.id)) throw new DriveVerificationError('Google Drive trả ID ảnh trùng giữa các trang')
      seenIds.add(photo.id)
      photos.push(photo)
      if (photos.length > 10000) throw new DriveVerificationError('Folder mẫu vượt giới hạn 10.000 ảnh')
    }
    pageToken = page.nextPageToken
    if (pageToken) {
      if (seenPages.has(pageToken)) throw new DriveVerificationError('Google Drive trả page token trùng')
      seenPages.add(pageToken)
    }
  } while (pageToken)

  const stats = {
    photoCount: photos.length,
    pageCount,
    resourceKeyPhotos: photos.filter(photo => photo.resourceKey).length,
    durationMs: Math.round(performance.now() - startedAt),
  }
  if (photos.length === 0) throw new DriveVerificationError('Folder mẫu không có ảnh có thể đọc', stats)
  const resourceKeyPhoto = photos.find(photo => photo.resourceKey)

  const samples = [photos[0]!, photos[Math.floor((photos.length - 1) / 2)]!, photos.at(-1)!, resourceKeyPhoto]
    .filter(photo => photo !== undefined)
    .filter((photo, index, all) => all.findIndex(candidate => candidate.id === photo.id) === index)
  for (const photo of samples) {
    const response = await source.readPhoto(photo.id, photo.resourceKey)
    if (!response.headers.get('content-type')?.toLowerCase().startsWith('image/')) {
      throw new DriveVerificationError('Google Drive không trả nội dung ảnh')
    }
    const reader = response.body?.getReader()
    if (!reader) throw new DriveVerificationError('Google Drive trả ảnh rỗng')
    const firstChunk = await reader.read()
    await reader.cancel()
    if (!firstChunk.value?.length) throw new DriveVerificationError('Google Drive trả ảnh rỗng')
  }

  return {
    photoCount: photos.length,
    pageCount,
    sampledPhotos: samples.length,
    resourceKeySampled: samples.some(photo => Boolean(photo.resourceKey)),
    scaleVerified: photos.length >= 1000,
    durationMs: Math.round(performance.now() - startedAt),
  }
}
