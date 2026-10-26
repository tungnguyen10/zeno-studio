import { createHash } from 'node:crypto'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const albumId = '22222222-2222-4222-8222-222222222222'
const photoId = '33333333-3333-4333-8333-333333333333'
const original = new Uint8Array([0xff, 0xd8, 0, 42, 0xff, 0xd9])
const mocks = vi.hoisted(() => ({
  authorize: vi.fn(), resolve: vi.fn(), read: vi.fn(),
}))
vi.mock('../../server/db/pool', () => ({ getAppPool: () => ({}) }))
vi.mock('../../server/utils/album-api', () => ({
  albumIdParam: () => albumId,
  requireAlbumAccess: () => Promise.resolve({ albumId, scope: 'customer' }),
}))
vi.mock('../../server/albums/download-policy', () => ({ requireCustomerDownload: mocks.authorize }))
vi.mock('../../server/downloads/rate-limit', () => ({ enforceDownloadRate: () => Promise.resolve() }))
vi.mock('../../server/downloads/original', () => ({ resolveOriginal: mocks.resolve, originalSourceError: () => Object.assign(new Error('Drive unavailable'), { statusCode: 503 }) }))
vi.mock('../../server/utils/drive-gate', () => ({ requireVerifiedDriveSource: () => ({ readPhoto: mocks.read }) }))

type Event = { photoId?: string }
let handler: (event: Event) => Promise<Response>
beforeAll(async () => {
  vi.stubGlobal('defineEventHandler', (fn: typeof handler) => fn)
  vi.stubGlobal('getRouterParam', (event: Event) => event.photoId ?? photoId)
  vi.stubGlobal('createError', ({ statusCode, statusMessage }: { statusCode: number; statusMessage: string }) => Object.assign(new Error(statusMessage), { statusCode }))
  handler = (await import('../../server/api/album/[albumId]/photos/[photoId]/download.get')).default as typeof handler
})
beforeEach(() => {
  mocks.authorize.mockReset().mockResolvedValue({ canSingle: true })
  mocks.resolve.mockReset().mockResolvedValue({ sourceFileId: 'drive-original', metadata: { filename: 'Ảnh cưới.jpg', mimeType: 'image/jpeg', sizeBytes: original.byteLength } })
  mocks.read.mockReset().mockResolvedValue(new Response(original, { headers: { 'content-type': 'image/jpeg' } }))
})

describe('single original download HTTP boundary', () => {
  it('streams exact original bytes with private download headers', async () => {
    const response = await handler({})
    const bytes = new Uint8Array(await response.arrayBuffer())
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(createHash('sha256').update(original).digest('hex'))
    expect(response.headers.get('content-type')).toBe('image/jpeg')
    expect(response.headers.get('content-disposition')).toContain("filename*=UTF-8''%E1%BA%A2nh%20c%C6%B0%E1%BB%9Bi.jpg")
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(mocks.read).toHaveBeenCalledWith('drive-original', undefined)
  })

  it('rejects disabled rights, invalid IDs and wrong-album photos before Drive bytes', async () => {
    mocks.authorize.mockRejectedValueOnce(Object.assign(new Error('Denied'), { statusCode: 403 }))
    await expect(handler({})).rejects.toMatchObject({ statusCode: 403 })
    await expect(handler({ photoId: 'bad' })).rejects.toMatchObject({ statusCode: 400 })
    mocks.resolve.mockRejectedValueOnce(Object.assign(new Error('Missing'), { statusCode: 404 }))
    await expect(handler({})).rejects.toMatchObject({ statusCode: 404 })
    expect(mocks.read).not.toHaveBeenCalled()
  })

  it('does not fall back to preview when Drive fails', async () => {
    mocks.read.mockRejectedValueOnce(new Error('upstream'))
    await expect(handler({})).rejects.toMatchObject({ statusCode: 503 })
  })
})
