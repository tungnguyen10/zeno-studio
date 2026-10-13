import { getAppPool } from '../../../db/pool'
import { createStudioInvitation, type InvitedRole } from '../../../studios/members'
import { requireStudioUser } from '../../../utils/require-studio-user'
import { studioApi, studioIdParam } from '../../../utils/studio-api'

export default defineEventHandler(async event => {
  const user = await requireStudioUser(event)
  const studioId = studioIdParam(event)
  const body = await readBody<{ email?: string; role?: InvitedRole }>(event)
  if (typeof body?.email !== 'string' || typeof body?.role !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Email và vai trò là bắt buộc' })
  }
  return studioApi(async () => ({ invitation: await createStudioInvitation(getAppPool(), studioId, user.id, body.email!, body.role!) }))
})
