import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ update: vi.fn(), headers: [] as Array<[string, string]> }))
vi.mock('../../server/db/pool', () => ({ getAppPool: () => ({}) }))
vi.mock('../../server/albums/album', () => ({ updateStudioAlbum: mocks.update }))
vi.mock('../../server/utils/album-api', () => ({ albumIdParam: () => '22222222-2222-4222-8222-222222222222' }))
vi.mock('../../server/utils/require-studio-user', () => ({ requireStudioUser: () => Promise.resolve({ id: 'owner' }) }))
vi.mock('../../server/utils/studio-api', () => ({ studioIdParam: () => '11111111-1111-4111-8111-111111111111', studioApi: (work: () => Promise<unknown>) => work() }))

type Event = { body: unknown }
let handler: (event: Event) => Promise<unknown>

beforeAll(async () => {
  vi.stubGlobal('defineEventHandler', (fn: typeof handler) => fn)
  vi.stubGlobal('readBody', (event: Event) => Promise.resolve(event.body))
  vi.stubGlobal('setHeader', (_event: Event, name: string, value: string) => { mocks.headers.push([name, value]) })
  vi.stubGlobal('createError', ({ statusCode, statusMessage }: { statusCode: number; statusMessage: string }) => Object.assign(new Error(statusMessage), { statusCode }))
  handler = (await import('../../server/api/studio/[studioId]/albums/[albumId].patch')).default as typeof handler
})

beforeEach(() => {
  mocks.update.mockReset().mockResolvedValue(undefined)
  mocks.headers.length = 0
})

describe('studio album update HTTP boundary', () => {
  it('rejects missing titles and unexpected fields before database work', async () => {
    await expect(handler({ body: { expiresInDays: 15 } })).rejects.toMatchObject({ statusCode: 400 })
    await expect(handler({ body: { title: 'A', folderUrl: 'https://example.com' } })).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('passes an allowed draft update to the domain operation', async () => {
    const body = { title: 'Album mới', expiresInDays: 30, limit: { kind: 'maximum', count: 12 } }
    expect(await handler({ body })).toEqual({ ok: true })
    expect(mocks.update).toHaveBeenCalledWith({}, '11111111-1111-4111-8111-111111111111', 'owner', '22222222-2222-4222-8222-222222222222', body)
    expect(mocks.headers).toContainEqual(['cache-control', 'no-store'])
  })
})
