import type { H3Event } from 'h3'
import type { AlbumManager } from '../albums/manager'

export function guestAlbumIdParam(event: H3Event): string {
  const id = getRouterParam(event, 'albumId')
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Album ID không hợp lệ' })
  }
  return id
}

export function guestManager(event: H3Event): AlbumManager & { kind: 'guest' } {
  const albumId = guestAlbumIdParam(event)
  const token = getCookie(event, `guest_admin_${albumId}`)
  if (!token) throw createError({ statusCode: 403, statusMessage: 'Cần link quản trị album' })
  return { kind: 'guest', albumId, token }
}

export function guestNoStore(event: H3Event): void {
  setHeader(event, 'cache-control', 'no-store')
  setHeader(event, 'referrer-policy', 'no-referrer')
}
