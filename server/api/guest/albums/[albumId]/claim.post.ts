import { getAppPool } from '../../../../db/pool'
import { claimGuestAlbum } from '../../../../albums/guest'
import { guestManager, guestNoStore } from '../../../../utils/guest-api'
import { requireStudioUser } from '../../../../utils/require-studio-user'
import { studioApi } from '../../../../utils/studio-api'

export default defineEventHandler(async event => {
  guestNoStore(event)
  const manager = guestManager(event)
  const user = await requireStudioUser(event)
  const body = await readBody<{ studioId?: string }>(event)
  if (typeof body?.studioId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.studioId)) {
    throw createError({ statusCode: 400, statusMessage: 'Studio ID không hợp lệ' })
  }
  await studioApi(() => claimGuestAlbum(getAppPool(), manager.albumId, manager.token, body.studioId!, user.id))
  deleteCookie(event, `guest_admin_${manager.albumId}`, { path: `/api/guest/albums/${manager.albumId}` })
  return { albumId: manager.albumId, studioId: body.studioId }
})
