import { getAppPool } from '../../../db/pool'
import { resolveAlbumAccess } from '../../../albums/access'
import { albumIdParam, setAlbumCookie } from '../../../utils/album-api'

export default defineEventHandler(async event => {
  const albumId = albumIdParam(event)
  const body = await readBody<{ token?: string }>(event)
  const access = typeof body?.token === 'string' ? await resolveAlbumAccess(getAppPool(), body.token) : null
  if (!access || access.albumId !== albumId) throw createError({ statusCode: 403, statusMessage: 'Link album không hợp lệ hoặc đã hết hạn' })
  setAlbumCookie(event, albumId, body.token!)
  setHeader(event, 'cache-control', 'no-store')
  return { scope: access.scope, participantId: access.participantId }
})
