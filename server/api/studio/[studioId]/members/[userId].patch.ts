import { getAppPool } from '../../../../db/pool'
import { updateStudioMemberRole, type InvitedRole } from '../../../../studios/members'
import { requireStudioUser } from '../../../../utils/require-studio-user'
import { studioApi, studioIdParam } from '../../../../utils/studio-api'

export default defineEventHandler(async event => {
  const user = await requireStudioUser(event)
  const studioId = studioIdParam(event)
  const memberUserId = getRouterParam(event, 'userId')
  const body = await readBody<{ role?: InvitedRole }>(event)
  if (!memberUserId || typeof body?.role !== 'string') throw createError({ statusCode: 400, statusMessage: 'Thiếu thành viên hoặc vai trò' })
  await studioApi(() => updateStudioMemberRole(getAppPool(), studioId, user.id, memberUserId, body.role!))
  return { ok: true }
})
