import { getAppPool } from '../../../../db/pool'
import { updateStudioAlbum } from '../../../../albums/album'
import { albumIdParam } from '../../../../utils/album-api'
import { requireStudioUser } from '../../../../utils/require-studio-user'
import { studioApi, studioIdParam } from '../../../../utils/studio-api'
import type { SelectionLimit } from '../../../../../shared/domain/selection'

export default defineEventHandler(async event => {
  const user = await requireStudioUser(event)
  const studioId = studioIdParam(event)
  const albumId = albumIdParam(event)
  const body = await readBody<{ title?: unknown; expiresInDays?: unknown; limit?: SelectionLimit } | null>(event)
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.title !== 'string' ||
    Object.keys(body).some(key => !['title', 'expiresInDays', 'limit'].includes(key))) {
    throw createError({ statusCode: 400, statusMessage: 'Thông tin album không hợp lệ' })
  }
  await studioApi(() => updateStudioAlbum(getAppPool(), studioId, user.id, albumId, {
    title: body.title as string,
    ...(body.expiresInDays !== undefined ? { expiresInDays: body.expiresInDays as 15 | 30 } : {}),
    ...(body.limit !== undefined ? { limit: body.limit } : {}),
  }))
  setHeader(event, 'cache-control', 'no-store')
  return { ok: true }
})
