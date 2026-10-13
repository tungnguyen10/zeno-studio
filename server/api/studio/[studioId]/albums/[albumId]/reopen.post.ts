import { getAppPool } from '../../../../../db/pool'
import { reopenStudioSelection } from '../../../../../albums/selection'
import { requireStudioUser } from '../../../../../utils/require-studio-user'
import { studioApi, studioIdParam } from '../../../../../utils/studio-api'

export default defineEventHandler(async event => {
  const user = await requireStudioUser(event)
  const studioId = studioIdParam(event)
  const albumId = getRouterParam(event, 'albumId')
  if (!albumId || !/^[0-9a-f-]{36}$/i.test(albumId)) throw createError({ statusCode: 400, statusMessage: 'Album ID không hợp lệ' })
  return studioApi(() => reopenStudioSelection(getAppPool(), studioId, user.id, albumId))
})
