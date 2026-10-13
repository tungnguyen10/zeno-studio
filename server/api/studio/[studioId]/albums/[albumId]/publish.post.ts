import { getAppPool } from '../../../../../db/pool'
import { publishAlbum } from '../../../../../albums/album'
import { requireVerifiedDriveSource } from '../../../../../utils/drive-gate'
import { requireStudioUser } from '../../../../../utils/require-studio-user'
import { studioApi, studioIdParam } from '../../../../../utils/studio-api'

export default defineEventHandler(async event => {
  const user = await requireStudioUser(event)
  const studioId = studioIdParam(event)
  requireVerifiedDriveSource()
  const albumId = getRouterParam(event, 'albumId')
  if (!albumId || !/^[0-9a-f-]{36}$/i.test(albumId)) throw createError({ statusCode: 400, statusMessage: 'Album ID không hợp lệ' })
  return studioApi(() => publishAlbum(getAppPool(), studioId, user.id, albumId))
})
