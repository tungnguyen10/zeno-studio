import { getAppPool } from '../../../db/pool'
import { getStudioInvitations } from '../../../studios/members'
import { requireStudioUser } from '../../../utils/require-studio-user'
import { studioApi, studioIdParam } from '../../../utils/studio-api'

export default defineEventHandler(async event => {
  const user = await requireStudioUser(event)
  const studioId = studioIdParam(event)
  return studioApi(async () => ({ invitations: await getStudioInvitations(getAppPool(), studioId, user.id) }))
})
