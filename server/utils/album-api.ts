import type { H3Event } from 'h3'
import { getAppPool } from '../db/pool'
import { resolveAlbumAccess, type AlbumAccess } from '../albums/access'

export function albumIdParam(event: H3Event): string {
  const id = getRouterParam(event, 'albumId')
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Album ID không hợp lệ' })
  }
  return id
}

export function setAlbumCookie(event: H3Event, albumId: string, token: string): void {
  setCookie(event, `album_access_${albumId}`, token, {
    httpOnly: true, sameSite: 'lax', secure: getRequestURL(event).protocol === 'https:',
    path: `/api/album/${albumId}`, maxAge: 30 * 24 * 60 * 60,
  })
}

export async function requireAlbumAccess(event: H3Event): Promise<AlbumAccess> {
  const albumId = albumIdParam(event)
  const bearer = getHeader(event, 'authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1]
  const token = bearer ?? getCookie(event, `album_access_${albumId}`)
  const access = token ? await resolveAlbumAccess(getAppPool(), token) : null
  if (!access || access.albumId !== albumId) throw createError({ statusCode: 403, statusMessage: 'Link album không hợp lệ hoặc đã hết hạn' })
  return access
}
