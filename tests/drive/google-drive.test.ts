import { describe, expect, it, vi } from 'vitest'
import { GoogleDriveAdapter, parseGoogleDriveFolderLink } from '../../server/photo-sources/google-drive'

describe('Google Drive folder input', () => {
  it('extracts the folder ID and resource key from a share link', () => {
    expect(parseGoogleDriveFolderLink('https://drive.google.com/drive/folders/abc_123?resourcekey=0-secret')).toEqual({
      folderId: 'abc_123', resourceKey: '0-secret',
    })
    expect(() => parseGoogleDriveFolderLink('https://example.com/drive/folders/abc')).toThrow('Google Drive')
  })
})

describe('Google Drive adapter', () => {
  it('lists only images and preserves the next page token', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      nextPageToken: 'next',
      files: [
        { id: 'image-1', name: 'A.jpg', mimeType: 'image/jpeg', resourceKey: 'file-key' },
        { id: 'text-1', name: 'notes.txt', mimeType: 'text/plain' },
      ],
    }), { status: 200 }))
    const adapter = new GoogleDriveAdapter('api-key', fetcher)
    const page = await adapter.listPhotos({ folderId: 'abc_123', resourceKey: '0-secret' })
    expect(page.items).toEqual([{ id: 'image-1', filename: 'A.jpg', mimeType: 'image/jpeg', resourceKey: 'file-key' }])
    expect(page.nextPageToken).toBe('next')
    const [url, init] = fetcher.mock.calls[0]!
    expect(new URL(url).searchParams.get('q')).toBe("'abc_123' in parents and trashed = false")
    expect(init?.headers).toMatchObject({ 'X-Goog-Drive-Resource-Keys': 'abc_123/0-secret' })
  })

  it('rejects non-image content when reading photo bytes', async () => {
    const adapter = new GoogleDriveAdapter('api-key', vi.fn(async () => new Response('<html>denied</html>', {
      status: 200, headers: { 'content-type': 'text/html' },
    })))
    await expect(adapter.readPhoto('image-123')).rejects.toThrow('image')
  })
})
