import { describe, expect, it, vi } from 'vitest'
import { DriveSourceError, GoogleDriveAdapter, parseGoogleDriveFolderLink } from '../../server/photo-sources/google-drive'

describe('Google Drive folder input', () => {
  it('extracts the folder ID and resource key from a share link', () => {
    expect(parseGoogleDriveFolderLink('https://drive.google.com/drive/folders/abc_123?resourcekey=0-secret')).toEqual({
      folderId: 'abc_123', resourceKey: '0-secret',
    })
    expect(() => parseGoogleDriveFolderLink('https://example.com/drive/folders/abc')).toThrow('Google Drive')
  })
})

describe('Google Drive adapter', () => {
  it('reads current original metadata with the file resource key and rejects restricted files', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      id: 'image-123', name: 'Ảnh cưới.jpg', mimeType: 'image/jpeg', size: '1234',
      md5Checksum: 'abcd', capabilities: { canDownload: true },
    }), { headers: { 'content-type': 'application/json' } }))
    const adapter = new GoogleDriveAdapter('api-key', fetcher)
    expect(await adapter.getOriginalMetadata('image-123', 'file-key')).toEqual({
      filename: 'Ảnh cưới.jpg', mimeType: 'image/jpeg', sizeBytes: 1234,
      md5Checksum: 'abcd', canDownload: true,
    })
    const [url, init] = fetcher.mock.calls[0]!
    expect(new URL(url).searchParams.get('fields')).toBe('id,name,mimeType,size,md5Checksum,capabilities(canDownload)')
    expect(new URL(url).searchParams.has('alt')).toBe(false)
    expect(init?.headers).toMatchObject({ 'X-Goog-Drive-Resource-Keys': 'image-123/file-key' })
    const restricted = new GoogleDriveAdapter('api-key', vi.fn(async () => new Response(JSON.stringify({
      name: 'private.jpg', mimeType: 'image/jpeg', capabilities: { canDownload: false },
    }), { headers: { 'content-type': 'application/json' } })))
    await expect(restricted.getOriginalMetadata('image-123')).rejects.toMatchObject({ status: 403 })
  })

  it('lists only images and preserves the next page token', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      nextPageToken: 'next',
      files: [
        { id: 'image-1', name: 'A.jpg', mimeType: 'image/jpeg', resourceKey: 'file-key', thumbnailLink: 'https://lh3.googleusercontent.com/image-1', size: '1234', md5Checksum: 'abc', capabilities: { canDownload: true } },
        { id: 'text-1', name: 'notes.txt', mimeType: 'text/plain' },
      ],
    }), { status: 200 }))
    const adapter = new GoogleDriveAdapter('api-key', fetcher)
    const page = await adapter.listPhotos({ folderId: 'abc_123', resourceKey: '0-secret' })
    expect(page.items).toEqual([{ id: 'image-1', filename: 'A.jpg', mimeType: 'image/jpeg', resourceKey: 'file-key', thumbnailLink: 'https://lh3.googleusercontent.com/image-1', sizeBytes: 1234, md5Checksum: 'abc', canDownload: true }])
    expect(page.nextPageToken).toBe('next')
    const [url, init] = fetcher.mock.calls[0]!
    expect(new URL(url).searchParams.get('q')).toBe("'abc_123' in parents and trashed = false")
    expect(new URL(url).searchParams.has('key')).toBe(false)
    expect(init?.headers).toMatchObject({ 'X-Goog-Drive-Resource-Keys': 'abc_123/0-secret', 'x-goog-api-key': 'api-key' })
  })

  it('rejects non-image content when reading photo bytes', async () => {
    const adapter = new GoogleDriveAdapter('api-key', vi.fn(async () => new Response('<html>denied</html>', {
      status: 200, headers: { 'content-type': 'text/html' },
    })))
    await expect(adapter.readPhoto('image-123')).rejects.toThrow('image')
  })

  it('passes a file resource key when downloading an image', async () => {
    const fetcher = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), {
      status: 200, headers: { 'content-type': 'image/jpeg' },
    }))
    const adapter = new GoogleDriveAdapter('api-key', fetcher)
    await adapter.readPhoto('image-123', 'image-key')
    const [url, init] = fetcher.mock.calls[0]!
    expect(new URL(url).searchParams.get('alt')).toBe('media')
    expect(new URL(url).searchParams.has('key')).toBe(false)
    expect(init?.headers).toMatchObject({ 'X-Goog-Drive-Resource-Keys': 'image-123/image-key', 'x-goog-api-key': 'api-key' })
  })

  it('refreshes the short-lived thumbnail link and returns image bytes', async () => {
    const fetcher = vi.fn(async (url: string, _init?: RequestInit) => url.includes('www.googleapis.com')
      ? new Response(JSON.stringify({ thumbnailLink: 'https://lh3.googleusercontent.com/drive-thumb' }), {
          headers: { 'content-type': 'application/json' },
        })
      : new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/webp' } }))
    const adapter = new GoogleDriveAdapter('api-key', fetcher as typeof fetch)
    const result = await adapter.readThumbnail('image-123', 'image-key')
    expect(result.refreshed).toBe(true)
    expect(result.thumbnailLink).toBe('https://lh3.googleusercontent.com/drive-thumb')
    expect(result.response.headers.get('content-type')).toBe('image/webp')
    expect(Array.from(new Uint8Array(await result.response.arrayBuffer()))).toEqual([1, 2, 3])
    const [metadataUrl, metadataInit] = fetcher.mock.calls[0]!
    expect(new URL(metadataUrl).searchParams.get('fields')).toBe('thumbnailLink')
    expect(metadataInit?.headers).toMatchObject({ 'X-Goog-Drive-Resource-Keys': 'image-123/image-key' })
    const [thumbnailUrl, thumbnailInit] = fetcher.mock.calls[1]!
    expect(thumbnailUrl).toBe('https://lh3.googleusercontent.com/drive-thumb')
    expect(thumbnailInit?.headers).not.toHaveProperty('x-goog-api-key')
  })

  it('uses a fresh cached thumbnail link without a Drive metadata request', async () => {
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => new Response(new Uint8Array([1]), {
      headers: { 'content-type': 'image/jpeg' },
    }))
    const adapter = new GoogleDriveAdapter('api-key', fetcher as typeof fetch)
    const result = await adapter.readThumbnail('image-123', undefined, 'https://lh3.googleusercontent.com/cached')
    expect(result.refreshed).toBe(false)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('refreshes a cached thumbnail after an upstream failure', async () => {
    const fetcher = vi.fn(async (url: string, _init?: RequestInit) => url.includes('cached')
      ? new Response('expired', { status: 403 })
      : url.includes('www.googleapis.com')
        ? new Response(JSON.stringify({ thumbnailLink: 'https://lh3.googleusercontent.com/new' }), {
            headers: { 'content-type': 'application/json' },
          })
        : new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/jpeg' } }))
    const adapter = new GoogleDriveAdapter('api-key', fetcher as typeof fetch)
    const result = await adapter.readThumbnail('image-123', undefined, 'https://lh3.googleusercontent.com/cached')
    expect(result.refreshed).toBe(true)
    expect(result.thumbnailLink).toBe('https://lh3.googleusercontent.com/new')
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('rejects a missing or untrusted thumbnail link without downloading the original', async () => {
    for (const thumbnailLink of [undefined, 'https://attacker.example/secret']) {
      const fetcher = vi.fn(async () => new Response(JSON.stringify({ thumbnailLink }), {
        headers: { 'content-type': 'application/json' },
      }))
      const adapter = new GoogleDriveAdapter('api-key', fetcher)
      await expect(adapter.readThumbnail('image-123')).rejects.toMatchObject({ status: 502 })
      expect(fetcher).toHaveBeenCalledTimes(1)
    }
  })

  it('preserves the Google error reason for quota handling without returning the body', async () => {
    const adapter = new GoogleDriveAdapter('api-key', vi.fn(async () => new Response(JSON.stringify({
      error: { errors: [{ reason: 'rateLimitExceeded' }], message: 'Sensitive upstream details' },
    }), { status: 403, headers: { 'content-type': 'application/json' } })))
    await expect(adapter.listPhotos({ folderId: 'folder-123' })).rejects.toMatchObject({
      status: 403, reason: 'rateLimitExceeded', message: 'Google Drive folder request failed (403)',
    } satisfies Partial<DriveSourceError>)
  })

  it('reads API key restriction reasons from Google error details', async () => {
    const adapter = new GoogleDriveAdapter('api-key', vi.fn(async () => new Response(JSON.stringify({
      error: { details: [{ reason: 'API_KEY_SERVICE_BLOCKED' }] },
    }), { status: 403, headers: { 'content-type': 'application/json' } })))
    await expect(adapter.listPhotos({ folderId: 'folder-123' })).rejects.toMatchObject({
      status: 403, reason: 'API_KEY_SERVICE_BLOCKED',
    } satisfies Partial<DriveSourceError>)
  })

  it('turns a network failure into a safe upstream error', async () => {
    const adapter = new GoogleDriveAdapter('api-key', vi.fn(async () => {
      throw new TypeError('fetch failed: private request details')
    }))
    await expect(adapter.listPhotos({ folderId: 'folder-123' })).rejects.toMatchObject({
      status: 502, reason: 'NETWORK_ERROR', message: 'Google Drive request failed',
    } satisfies Partial<DriveSourceError>)
  })
})
