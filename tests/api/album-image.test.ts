import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const photoId = '11111111-1111-4111-8111-111111111111'
const albumId = '22222222-2222-4222-8222-222222222222'
const mocks = vi.hoisted(() => ({
  photo: { source_file_id: 'drive-photo-1', resource_key: 'resource-key', status: 'READY', thumbnail_url: 'https://lh3.googleusercontent.com/cached', thumbnail_checked_at: new Date() },
  queries: [] as Array<{ sql: string; params: unknown[] }>,
  readPhoto: vi.fn(),
  readThumbnail: vi.fn(),
}))

vi.mock('../../server/db/pool', () => ({ getAppPool: () => ({}) }))
vi.mock('../../server/db/context', () => ({
  withDatabaseContext: async (_pool: unknown, _context: unknown, callback: (client: { query: (sql: string, params: unknown[]) => Promise<unknown> }) => Promise<unknown>) => callback({
    query: async (sql, params) => {
      mocks.queries.push({ sql, params })
      return { rows: sql.startsWith('SELECT source_file_id') ? [mocks.photo] : [{ set_photo_thumbnail_cache: true }] }
    },
  }),
}))
vi.mock('../../server/utils/album-api', () => ({
  albumIdParam: () => albumId,
  requireAlbumAccess: async () => ({ scope: 'customer' }),
}))
vi.mock('../../server/utils/drive-gate', () => ({
  requireVerifiedDriveSource: () => ({ readPhoto: mocks.readPhoto, readThumbnail: mocks.readThumbnail }),
}))

let handler: (event: { query?: Record<string, unknown> }) => Promise<Response>

beforeAll(async () => {
  vi.stubGlobal('defineEventHandler', (fn: typeof handler) => fn)
  vi.stubGlobal('getQuery', (event: { query?: Record<string, unknown> }) => event.query ?? {})
  vi.stubGlobal('getRouterParam', () => photoId)
  vi.stubGlobal('createError', ({ statusCode, statusMessage }: { statusCode: number; statusMessage: string }) => Object.assign(new Error(statusMessage), { statusCode }))
  handler = (await import('../../server/api/album/[albumId]/photos/[photoId]/image.get')).default as typeof handler
})

beforeEach(() => {
  mocks.queries.length = 0
  mocks.photo.thumbnail_checked_at = new Date()
  mocks.readPhoto.mockReset().mockResolvedValue(new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/jpeg' } }))
  mocks.readThumbnail.mockReset().mockResolvedValue({
    response: new Response(new Uint8Array([2]), { headers: { 'content-type': 'image/webp' } }),
    thumbnailLink: 'https://lh3.googleusercontent.com/cached',
    refreshed: false,
  })
})

describe('album image route', () => {
  it('keeps the existing URL on original bytes with private caching', async () => {
    const result = await handler({})
    expect(mocks.readPhoto).toHaveBeenCalledWith('drive-photo-1', 'resource-key')
    expect(mocks.readThumbnail).not.toHaveBeenCalled()
    expect(result.headers.get('cache-control')).toBe('private, max-age=60')
  })

  it('serves a cached thumbnail through the authorized image route', async () => {
    const result = await handler({ query: { variant: 'thumbnail' } })
    expect(mocks.readThumbnail).toHaveBeenCalledWith('drive-photo-1', 'resource-key', 'https://lh3.googleusercontent.com/cached')
    expect(result.headers.get('content-type')).toBe('image/webp')
    expect(mocks.queries).toHaveLength(1)
  })

  it('refreshes an old thumbnail URL and stores the new link with album context', async () => {
    mocks.photo.thumbnail_checked_at = new Date(Date.now() - 2 * 60 * 60 * 1000)
    mocks.readThumbnail.mockResolvedValueOnce({
      response: new Response(new Uint8Array([3]), { headers: { 'content-type': 'image/jpeg' } }),
      thumbnailLink: 'https://lh3.googleusercontent.com/new',
      refreshed: true,
    })
    await handler({ query: { variant: 'thumbnail' } })
    expect(mocks.readThumbnail).toHaveBeenCalledWith('drive-photo-1', 'resource-key', undefined)
    expect(mocks.queries[1]?.params).toEqual([photoId, albumId, 'https://lh3.googleusercontent.com/new'])
  })

  it('rejects an unsupported variant', async () => {
    await expect(handler({ query: { variant: 'full' } })).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.queries).toHaveLength(0)
  })
})
