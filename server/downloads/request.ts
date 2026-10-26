import type { H3Event } from 'h3'
import { StudioOperationError } from '../studios/error'

export async function readDownloadTicketBody(event: H3Event): Promise<string> {
  let value: unknown
  if (getHeader(event, 'content-type')?.toLowerCase().startsWith('application/x-www-form-urlencoded')) {
    const raw = await readRawBody(event)
    const params = new URLSearchParams(raw ?? '')
    if ([...params.keys()].some(key => key !== 'ticket') || params.getAll('ticket').length !== 1) {
      throw new StudioOperationError('Vé tải không hợp lệ', 400)
    }
    value = params.get('ticket')
  } else {
    const body = await readBody<unknown>(event)
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).length !== 1 || !Object.hasOwn(body, 'ticket')) {
      throw new StudioOperationError('Vé tải không hợp lệ', 400)
    }
    value = (body as { ticket: unknown }).ticket
  }
  if (typeof value !== 'string' || value.length < 1 || value.length > 12_000) {
    throw new StudioOperationError('Vé tải không hợp lệ', 400)
  }
  return value
}
