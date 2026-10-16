import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const albumId = '22222222-2222-4222-8222-222222222222'
const token = 'a'.repeat(43)
const mocks = vi.hoisted(() => ({ resolve: vi.fn(), cookies: [] as unknown[][] }))

vi.mock('../../server/db/pool', () => ({ getAppPool: () => ({}) }))
vi.mock('../../server/albums/access', () => ({ resolveAlbumAccess: mocks.resolve }))
vi.mock('../../server/utils/guest-api', () => ({ guestAlbumIdParam: () => albumId, guestNoStore: () => {} }))

type Event = { body: unknown }
let handler: (event: Event) => Promise<unknown>

beforeAll(async () => {
  vi.stubGlobal('defineEventHandler', (fn: typeof handler) => fn)
  vi.stubGlobal('readBody', (event: Event) => Promise.resolve(event.body))
  vi.stubGlobal('createError', ({ statusCode, statusMessage }: { statusCode: number; statusMessage: string }) => Object.assign(new Error(statusMessage), { statusCode }))
  vi.stubGlobal('setCookie', (...args: unknown[]) => { mocks.cookies.push(args) })
  vi.stubGlobal('getRequestURL', () => new URL('https://zeno.example'))
  handler = (await import('../../server/api/guest/albums/[albumId]/access.post')).default as typeof handler
})

beforeEach(() => { mocks.resolve.mockReset(); mocks.cookies.length = 0 })

describe('guest management token exchange', () => {
  it('rejects a revoked or expired token without setting a cookie', async () => {
    mocks.resolve.mockResolvedValue(null)
    await expect(handler({ body: { token } })).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.cookies).toHaveLength(0)
  })

  it('does not exchange a customer link for guest management', async () => {
    mocks.resolve.mockResolvedValue({ albumId, scope: 'customer' })
    await expect(handler({ body: { token } })).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.cookies).toHaveLength(0)
  })

  it('sets a secure, HTTP only cookie for an active guest management token', async () => {
    mocks.resolve.mockResolvedValue({ albumId, scope: 'guest_admin' })
    expect(await handler({ body: { token } })).toEqual({ albumId })
    expect(mocks.cookies[0]).toMatchObject([{}, `guest_admin_${albumId}`, token, {
      httpOnly: true, sameSite: 'lax', secure: true, path: `/api/guest/albums/${albumId}`,
    }])
  })
})
