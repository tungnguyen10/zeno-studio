import { describe, expect, it } from 'vitest'
import { verifyPublicDrive } from '../../server/photo-sources/verify-public-drive'
import type { PhotoSourceAdapter, SourcePhoto } from '../../server/photo-sources/photo-source'

const folderUrl = 'https://drive.google.com/drive/folders/folder123'

function sampleSource(photos: SourcePhoto[], readIds: string[]): PhotoSourceAdapter {
  return {
    async listPhotos(_folder, pageToken) {
      const start = pageToken ? 600 : 0
      return { items: photos.slice(start, start + 600), ...(start + 600 < photos.length ? { nextPageToken: 'second' } : {}) }
    },
    async readPhoto(id) {
      readIds.push(id)
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } })
    },
  }
}

describe('public Drive verification', () => {
  it('checks pagination and downloads first, middle, last, and resource-key photos', async () => {
    const photos = Array.from({ length: 1100 }, (_, index) => ({
      id: `photo-${index}`, filename: `${index}.jpg`, mimeType: 'image/jpeg',
      ...(index === 100 ? { resourceKey: 'photo-key' } : {}),
    }))
    const readIds: string[] = []
    const summary = await verifyPublicDrive(sampleSource(photos, readIds), folderUrl)
    expect(summary).toMatchObject({ photoCount: 1100, pageCount: 2, sampledPhotos: 4, resourceKeySampled: true, scaleVerified: true })
    expect(readIds).toEqual(['photo-0', 'photo-549', 'photo-1099', 'photo-100'])
  })

  it('rejects duplicate IDs across pages', async () => {
    const photos = Array.from({ length: 1001 }, (_, index) => ({
      id: `photo-${index < 600 ? index : 0}`, filename: `${index}.jpg`, mimeType: 'image/jpeg',
      ...(index === 100 ? { resourceKey: 'photo-key' } : {}),
    }))
    await expect(verifyPublicDrive(sampleSource(photos, []), folderUrl)).rejects.toThrow('trùng')
  })

  it('reports missing resource-key coverage while accepting a readable folder', async () => {
    const photos = Array.from({ length: 1000 }, (_, index) => ({
      id: `photo-${index}`, filename: `${index}.jpg`, mimeType: 'image/jpeg',
    }))
    const summary = await verifyPublicDrive(sampleSource(photos, []), folderUrl)
    expect(summary).toMatchObject({ photoCount: 1000, sampledPhotos: 3, resourceKeySampled: false, scaleVerified: true })
  })

  it('reports missing scale coverage for a smaller readable folder', async () => {
    const photos = Array.from({ length: 999 }, (_, index) => ({
      id: `photo-${index}`, filename: `${index}.jpg`, mimeType: 'image/jpeg', resourceKey: 'photo-key',
    }))
    const summary = await verifyPublicDrive(sampleSource(photos, []), folderUrl)
    expect(summary).toMatchObject({ photoCount: 999, pageCount: 2, scaleVerified: false, resourceKeySampled: true })
  })

  it('rejects an empty or unreadable image catalog', async () => {
    await expect(verifyPublicDrive(sampleSource([], []), folderUrl)).rejects.toThrow('không có ảnh')
  })
})
