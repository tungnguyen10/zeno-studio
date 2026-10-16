import { isIP } from 'node:net'
import { getAppPool } from '../../db/pool'
import { createGuestAlbum } from '../../albums/guest'
import { consumeGuestCreateAttempt } from '../../albums/guest-rate-limit'
import { requireVerifiedDriveSource } from '../../utils/drive-gate'
import { guestNoStore } from '../../utils/guest-api'
import { studioApi } from '../../utils/studio-api'
import type { SelectionLimit } from '../../../shared/domain/selection'

export default defineEventHandler(async event => {
  guestNoStore(event)
  const body = await readBody<{ title?: string; folderUrl?: string; expiresInDays?: number; limit?: SelectionLimit }>(event)
  if (typeof body?.title !== 'string' || typeof body?.folderUrl !== 'string' ||
    (body.expiresInDays !== undefined && body.expiresInDays !== 15 && body.expiresInDays !== 30) ||
    (body.limit !== undefined && (!body.limit || typeof body.limit !== 'object' ||
      (body.limit.kind !== 'unlimited' &&
        (body.limit.kind !== 'maximum' || !Number.isInteger(body.limit.count) || body.limit.count < 0))))) {
    throw createError({ statusCode: 400, statusMessage: 'Thông tin album không hợp lệ' })
  }
  const secret = process.env.NUXT_BETTER_AUTH_SECRET
  if (!secret) throw createError({ statusCode: 503, statusMessage: 'Chưa cấu hình bảo vệ tạo album' })
  const forwarded = process.env.VERCEL ? getHeader(event, 'x-vercel-forwarded-for')?.split(',')[0]?.trim() : undefined
  const address = forwarded && isIP(forwarded) ? forwarded : event.node.req.socket.remoteAddress
  if (!address || !isIP(address)) throw createError({ statusCode: 503, statusMessage: 'Không xác định được địa chỉ truy cập' })
  const limit = await consumeGuestCreateAttempt(getAppPool(), address, secret)
  if (!limit.allowed) {
    setHeader(event, 'retry-after', limit.retryAfterSeconds)
    throw createError({ statusCode: 429, statusMessage: 'Đã đạt giới hạn tạo album. Vui lòng thử lại sau.' })
  }
  const source = requireVerifiedDriveSource()
  return studioApi(() => createGuestAlbum(getAppPool(), source, {
    title: body.title!, folderUrl: body.folderUrl!, expiresInDays: (body.expiresInDays ?? 15) as 15 | 30,
    limit: body.limit ?? { kind: 'unlimited' },
  }))
})
