import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const albumId = '11111111-1111-4111-8111-111111111111'
const photoId = '22222222-2222-4222-8222-222222222222'
const mocks = vi.hoisted(() => ({ plan: vi.fn(), verify: vi.fn(), rate: vi.fn(), read: vi.fn(), zip: vi.fn() }))
vi.mock('../../server/db/pool', () => ({ getAppPool: () => ({}) }))
vi.mock('../../server/utils/album-api', () => ({ albumIdParam: () => albumId,
  requireAlbumAccess: () => Promise.resolve({ albumId, scope: 'customer' }) }))
vi.mock('../../server/downloads/plan', async importOriginal => {
  const original = await importOriginal<typeof import('../../server/downloads/plan')>()
  return { ...original, createDownloadPlan: mocks.plan }
})
vi.mock('../../server/downloads/transfer', () => ({ authorizeDownloadTicket: mocks.verify }))
vi.mock('../../server/downloads/rate-limit', () => ({ enforceDownloadRate: mocks.rate }))
vi.mock('../../server/utils/drive-gate', () => ({ requireVerifiedDriveSource: () => ({ readPhoto: mocks.read }) }))
vi.mock('../../server/downloads/zip', () => ({ createStoredZip: mocks.zip }))

type Event = { body: unknown; contentType?: string; rawBody?: string; node: { res: { once: ReturnType<typeof vi.fn> } } }
let planHandler: (event: Event) => Promise<unknown>
let fileHandler: (event: Event) => Promise<Response>
let zipHandler: (event: Event) => Promise<Response>
const event = (body: unknown): Event => ({ body, node: { res: { once: vi.fn() } } })

beforeAll(async () => {
  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('readBody', (input: Event) => Promise.resolve(input.body))
  vi.stubGlobal('readRawBody', (input: Event) => Promise.resolve(input.rawBody))
  vi.stubGlobal('getHeader', (input: Event, name: string) => name === 'content-type' ? input.contentType : undefined)
  vi.stubGlobal('setHeader', () => undefined)
  vi.stubGlobal('createError', ({ statusCode, statusMessage }: { statusCode: number; statusMessage: string }) => Object.assign(new Error(statusMessage), { statusCode }))
  planHandler = (await import('../../server/api/album/[albumId]/download/plan.post')).default as typeof planHandler
  fileHandler = (await import('../../server/api/album/[albumId]/download/file.post')).default as typeof fileHandler
  zipHandler = (await import('../../server/api/album/[albumId]/download/zip.post')).default as typeof zipHandler
})
beforeEach(() => {
  mocks.plan.mockReset().mockResolvedValue({ parts: [] })
  mocks.rate.mockReset().mockResolvedValue(undefined)
  mocks.verify.mockReset().mockResolvedValue({ ticket: { part: 0 }, files: [{ photoId, sourceFileId: 'drive-file', filename: 'Ảnh.jpg', mimeType: 'image/jpeg', sizeBytes: 3 }] })
  mocks.read.mockReset().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } }))
  mocks.zip.mockReset().mockReturnValue(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1, 2, 3])); controller.close() } }))
})

describe('batch download HTTP boundaries', () => {
  it('validates plan body before reading the Drive catalog', async () => {
    await expect(planHandler(event({ kind: 'basket', photoIds: [photoId], extra: 1 }))).rejects.toMatchObject({ statusCode: 400 })
    await expect(planHandler(event({ kind: 'basket', photoIds: [photoId, photoId] }))).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.plan).not.toHaveBeenCalled()
    await planHandler(event({ kind: 'basket', photoIds: [photoId] }))
    expect(mocks.plan).toHaveBeenCalledOnce()
  })

  it('enforces rate limit and rejects a changed policy before original bytes', async () => {
    mocks.rate.mockRejectedValueOnce(Object.assign(new Error('Limited'), { statusCode: 429 }))
    await expect(planHandler(event({ kind: 'all' }))).rejects.toMatchObject({ statusCode: 429 })
    mocks.verify.mockRejectedValueOnce(Object.assign(new Error('Denied'), { statusCode: 403 }))
    await expect(fileHandler(event({ ticket: 'signed' }))).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.read).not.toHaveBeenCalled()
  })

  it('streams a file and a ZIP with no-store headers', async () => {
    const file = await fileHandler(event({ ticket: 'signed' }))
    expect([...new Uint8Array(await file.arrayBuffer())]).toEqual([1, 2, 3])
    expect(file.headers.get('cache-control')).toBe('private, no-store')
    expect(file.headers.get('content-disposition')).toContain("filename*=UTF-8''")
    const zip = await zipHandler(event({ ticket: 'signed' }))
    expect(zip.headers.get('content-type')).toBe('application/zip')
    expect(zip.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.zip).toHaveBeenCalledOnce()
  })

  it('accepts a form-urlencoded ticket for browser-managed large files', async () => {
    const input = event(null)
    input.contentType = 'application/x-www-form-urlencoded'
    input.rawBody = 'ticket=signed'
    await fileHandler(input)
    expect(mocks.verify).toHaveBeenCalledWith({}, { albumId, scope: 'customer' }, expect.anything(), 'signed', 'file')
  })
})
