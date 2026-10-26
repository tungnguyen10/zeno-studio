import { createHmac } from 'node:crypto'
import { isIP } from 'node:net'
import type { H3Event } from 'h3'
import { withDatabaseContext, type ConnectionPool } from '../db/context'
import type { AlbumAccess } from '../albums/access'
import { StudioOperationError } from '../studios/error'

export async function consumeAlbumDownloadAttempt(pool: ConnectionPool, access: AlbumAccess, address: string, secret: string): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  if (!isIP(address) || secret.length < 32) throw new StudioOperationError('Chưa cấu hình bảo vệ tải ảnh', 503)
  const hash = createHmac('sha256', secret).update('album-download:').update(address).digest('hex')
  const result = await withDatabaseContext(pool, {
    albumId: access.albumId, scope: access.scope, participantId: access.participantId ?? undefined,
  }, client => client.query<{ allowed: boolean; retry_after_seconds: number }>(
    'SELECT allowed, retry_after_seconds FROM app_private.consume_album_download_attempt($1, $2)', [access.albumId, hash]))
  return { allowed: result.rows[0]!.allowed, retryAfterSeconds: result.rows[0]!.retry_after_seconds }
}

export function downloadAddress(event: H3Event): string {
  const forwarded = process.env.VERCEL ? getHeader(event, 'x-vercel-forwarded-for')?.split(',')[0]?.trim() : undefined
  const address = forwarded && isIP(forwarded) ? forwarded : event.node.req.socket.remoteAddress
  if (!address || !isIP(address)) throw createError({ statusCode: 503, statusMessage: 'Không xác định được địa chỉ truy cập' })
  return address
}

export async function enforceDownloadRate(event: H3Event, pool: ConnectionPool, access: AlbumAccess): Promise<void> {
  const secret = process.env.NUXT_DOWNLOAD_TICKET_SECRET
  if (!secret) throw createError({ statusCode: 503, statusMessage: 'Máy chủ chưa cấu hình vé tải ảnh' })
  const result = await consumeAlbumDownloadAttempt(pool, access, downloadAddress(event), secret)
  if (!result.allowed) {
    setHeader(event, 'retry-after', result.retryAfterSeconds)
    throw createError({ statusCode: 429, statusMessage: 'Đã đạt giới hạn tải ảnh. Vui lòng thử lại sau.' })
  }
}
