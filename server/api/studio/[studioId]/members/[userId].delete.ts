import { getAppPool } from '../../../../db/pool'
import { revokeStudioMember } from '../../../../studios/members'
import { requireStudioUser } from '../../../../utils/require-studio-user'
import { studioApi, studioIdParam } from '../../../../utils/studio-api'

export default defineEventHandler(async event => {
  const user = await requireStudioUser(event)
  const studioId = studioIdParam(event)
  const memberUserId = getRouterParam(event, 'userId')
  if (!memberUserId) throw createError({ statusCode: 400, statusMessage: 'Thiếu thành viên' })
  await studioApi(() => revokeStudioMember(getAppPool(), studioId, user.id, memberUserId))
  return { ok: true }
})
