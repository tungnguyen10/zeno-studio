import { getAppPool } from '../../../db/pool'
import { getStudioMembers } from '../../../studios/members'
import { requireStudioUser } from '../../../utils/require-studio-user'
import { studioApi, studioIdParam } from '../../../utils/studio-api'

export default defineEventHandler(async event => {
  const user = await requireStudioUser(event)
  const studioId = studioIdParam(event)
  return studioApi(async () => ({ members: await getStudioMembers(getAppPool(), studioId, user.id) }))
})
