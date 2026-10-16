import { describe, expect, it } from 'vitest'
import { collectPhotos } from '../../server/albums/album'
import type { PhotoSourceAdapter } from '../../server/photo-sources/photo-source'

describe('collectPhotos', () => {
  it('returns photos sorted by filename regardless of Drive order', async () => {
    const source = {
      async listPhotos() {
        return { items: ['DSC04351.jpg', 'DSC04329.jpg', 'DSC04306.jpg', 'DSC04350.jpg'].map(filename => ({ id: filename, filename, mimeType: 'image/jpeg' })) }
      },
    } as unknown as PhotoSourceAdapter
    const photos = await collectPhotos(source, { folderId: 'folder' })
    expect(photos.map(photo => photo.filename)).toEqual(['DSC04306.jpg', 'DSC04329.jpg', 'DSC04350.jpg', 'DSC04351.jpg'])
  })
})
