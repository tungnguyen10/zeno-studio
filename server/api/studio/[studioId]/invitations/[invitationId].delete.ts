import { getAppPool } from '../../../../db/pool'
import { revokeStudioInvitation } from '../../../../studios/members'
import { requireStudioUser } from '../../../../utils/require-studio-user'
import { studioApi, studioIdParam } from '../../../../utils/studio-api'

export default defineEventHandler(async event => {
  const user = await requireStudioUser(event)
  const studioId = studioIdParam(event)
  const invitationId = getRouterParam(event, 'invitationId')
  if (!invitationId) throw createError({ statusCode: 400, statusMessage: 'Thiếu lời mời' })
  await studioApi(() => revokeStudioInvitation(getAppPool(), studioId, user.id, invitationId))
  return { ok: true }
})
