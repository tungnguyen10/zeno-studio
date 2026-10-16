import { getAppPool } from '../../../../db/pool'
import { resolveAlbumAccess } from '../../../../albums/access'
import { guestAlbumIdParam, guestNoStore } from '../../../../utils/guest-api'

export default defineEventHandler(async event => {
  guestNoStore(event)
  const albumId = guestAlbumIdParam(event)
  const body = await readBody<{ token?: string }>(event)
  const access = typeof body?.token === 'string' ? await resolveAlbumAccess(getAppPool(), body.token) : null
  if (access?.albumId !== albumId || access.scope !== 'guest_admin') {
    throw createError({ statusCode: 403, statusMessage: 'Link quản trị không hợp lệ hoặc đã hết hạn' })
  }
  setCookie(event, `guest_admin_${albumId}`, body.token!, {
    httpOnly: true, sameSite: 'lax', secure: getRequestURL(event).protocol === 'https:',
    path: `/api/guest/albums/${albumId}`, maxAge: 60 * 24 * 60 * 60,
  })
  return { albumId }
})
