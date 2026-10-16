import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  consume: vi.fn(),
  source: vi.fn(),
  create: vi.fn(),
  headers: [] as Array<[string, string | number]>,
}))

vi.mock('../../server/db/pool', () => ({ getAppPool: () => ({}) }))
vi.mock('../../server/albums/guest-rate-limit', () => ({ consumeGuestCreateAttempt: mocks.consume }))
vi.mock('../../server/albums/guest', () => ({ createGuestAlbum: mocks.create }))
vi.mock('../../server/utils/drive-gate', () => ({ requireVerifiedDriveSource: mocks.source }))
vi.mock('../../server/utils/guest-api', () => ({ guestNoStore: () => {} }))
vi.mock('../../server/utils/studio-api', () => ({ studioApi: (work: () => Promise<unknown>) => work() }))

type Event = { body: unknown; node: { req: { socket: { remoteAddress: string } } } }
let handler: (event: Event) => Promise<unknown>

beforeAll(async () => {
  vi.stubGlobal('defineEventHandler', (fn: typeof handler) => fn)
  vi.stubGlobal('readBody', (event: Event) => Promise.resolve(event.body))
  vi.stubGlobal('getHeader', () => undefined)
  vi.stubGlobal('setHeader', (_event: Event, name: string, value: string | number) => { mocks.headers.push([name, value]) })
  vi.stubGlobal('createError', ({ statusCode, statusMessage }: { statusCode: number; statusMessage: string }) => Object.assign(new Error(statusMessage), { statusCode }))
  handler = (await import('../../server/api/guest/albums.post')).default as typeof handler
})

beforeEach(() => {
  process.env.NUXT_BETTER_AUTH_SECRET = 'test-secret'
  delete process.env.VERCEL
  mocks.headers.length = 0
  mocks.consume.mockReset().mockResolvedValue({ allowed: true, retryAfterSeconds: 3600 })
  mocks.source.mockReset().mockReturnValue({})
  mocks.create.mockReset().mockResolvedValue({ id: 'album', status: 'PUBLISHED' })
})

const event = (body: unknown): Event => ({ body, node: { req: { socket: { remoteAddress: '127.0.0.1' } } } })
const valid = { title: 'Guest album', folderUrl: 'https://drive.google.com/drive/folders/folder123', expiresInDays: 15, limit: { kind: 'maximum', count: 20 } }

describe('public guest creation HTTP boundary', () => {
  it('rejects malformed selection limits before invoking Drive', async () => {
    await expect(handler(event({ ...valid, limit: { kind: 'unexpected' } }))).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.source).not.toHaveBeenCalled()
  })

  it('returns retry-after on the eleventh attempt before invoking Drive', async () => {
    mocks.consume.mockResolvedValue({ allowed: false, retryAfterSeconds: 112 })
    await expect(handler(event(valid))).rejects.toMatchObject({ statusCode: 429 })
    expect(mocks.headers).toContainEqual(['retry-after', 112])
    expect(mocks.source).not.toHaveBeenCalled()
  })

  it('uses the socket address for local rate limiting and publishes after the gate', async () => {
    expect(await handler(event(valid))).toMatchObject({ status: 'PUBLISHED' })
    expect(mocks.consume).toHaveBeenCalledWith({}, '127.0.0.1', 'test-secret')
    expect(mocks.source).toHaveBeenCalledOnce()
    expect(mocks.create).toHaveBeenCalledOnce()
  })
})
