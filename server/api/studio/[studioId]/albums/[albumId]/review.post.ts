import { getAppPool } from '../../../../../db/pool'
import { startReviewRound } from '../../../../../albums/production'
import { requireStudioUser } from '../../../../../utils/require-studio-user'
import { studioApi, studioIdParam } from '../../../../../utils/studio-api'

export default defineEventHandler(async event => {
  const user = await requireStudioUser(event)
  const studioId = studioIdParam(event)
  const albumId = getRouterParam(event, 'albumId')
  if (!albumId || !/^[0-9a-f-]{36}$/i.test(albumId)) throw createError({ statusCode: 400 })
  const body = await readBody<{ driveUrl?: string }>(event)
  if (typeof body?.driveUrl !== 'string') throw createError({ statusCode: 400, statusMessage: 'Cần link ảnh đã chỉnh' })
  return studioApi(() => startReviewRound(getAppPool(), studioId, user.id, albumId, body.driveUrl!))
})
