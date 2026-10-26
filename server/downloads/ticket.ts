import { createHmac, timingSafeEqual } from 'node:crypto'
import { DOWNLOAD_LIMITS } from './limits'

export type DownloadPlanKind = 'selected' | 'basket' | 'all'
export type DownloadTicket = {
  v: 1
  albumId: string
  cycle: number
  kind: DownloadPlanKind
  format: 'file' | 'zip'
  photoIds: string[]
  part: number
  issuedAt: number
  expiresAt: number
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const invalid = () => new Error('Vé tải không hợp lệ')

function valid(payload: DownloadTicket): boolean {
  return payload && payload.v === 1 && uuid.test(payload.albumId) &&
    Number.isSafeInteger(payload.cycle) && payload.cycle > 0 &&
    ['selected', 'basket', 'all'].includes(payload.kind) && ['file', 'zip'].includes(payload.format) &&
    Array.isArray(payload.photoIds) && payload.photoIds.length > 0 && payload.photoIds.length <= DOWNLOAD_LIMITS.maxFiles &&
    payload.photoIds.every(id => typeof id === 'string' && uuid.test(id)) &&
    new Set(payload.photoIds).size === payload.photoIds.length &&
    Number.isSafeInteger(payload.part) && payload.part >= 0 && payload.part < DOWNLOAD_LIMITS.maxPlanFiles &&
    Number.isSafeInteger(payload.issuedAt) && Number.isSafeInteger(payload.expiresAt) &&
    payload.expiresAt > payload.issuedAt && payload.expiresAt - payload.issuedAt <= DOWNLOAD_LIMITS.ticketSeconds &&
    (payload.format !== 'file' || payload.photoIds.length === 1)
}

export function signDownloadTicket(payload: DownloadTicket, secret: string): string {
  if (!valid(payload) || secret.length < 32) throw invalid()
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', secret).update(body).digest('base64url')
  return `${body}.${signature}`
}

export function verifyDownloadTicket(ticket: string, secret: string, now = Math.floor(Date.now() / 1000)): DownloadTicket {
  if (typeof ticket !== 'string' || ticket.length > 12_000 || secret.length < 32) throw invalid()
  const [body, signature, extra] = ticket.split('.')
  if (!body || !signature || extra || !/^[A-Za-z0-9_-]+$/.test(body) || !/^[A-Za-z0-9_-]+$/.test(signature)) throw invalid()
  const expected = createHmac('sha256', secret).update(body).digest()
  const actual = Buffer.from(signature, 'base64url')
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw invalid()
  let payload: DownloadTicket
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as DownloadTicket }
  catch { throw invalid() }
  if (!valid(payload) || now < payload.issuedAt || now > payload.expiresAt) throw invalid()
  return payload
}
