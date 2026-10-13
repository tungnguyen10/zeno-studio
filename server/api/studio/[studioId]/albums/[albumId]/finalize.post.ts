import { getAppPool } from '../../../../../db/pool'
import { finalizeStudioSelection } from '../../../../../albums/selection'
import { requireStudioUser } from '../../../../../utils/require-studio-user'
import { studioApi, studioIdParam } from '../../../../../utils/studio-api'

export default defineEventHandler(async event => {
  const user = await requireStudioUser(event)
  const studioId = studioIdParam(event)
  const albumId = getRouterParam(event, 'albumId')
  if (!albumId || !/^[0-9a-f-]{36}$/i.test(albumId)) throw createError({ statusCode: 400, statusMessage: 'Album ID không hợp lệ' })
  const body = await readBody<{ photoIds?: string[] }>(event)
  if (body?.photoIds !== undefined && (!Array.isArray(body.photoIds) || body.photoIds.some(id => typeof id !== 'string'))) throw createError({ statusCode: 400, statusMessage: 'Danh sách ảnh không hợp lệ' })
  return studioApi(() => finalizeStudioSelection(getAppPool(), studioId, user.id, albumId, body?.photoIds))
})
