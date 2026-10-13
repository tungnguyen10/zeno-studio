import { getAppPool } from '../../../db/pool'
import { acceptStudioInvitation } from '../../../studios/members'
import { requireStudioUser } from '../../../utils/require-studio-user'
import { studioApi } from '../../../utils/studio-api'

export default defineEventHandler(async event => {
  const user = await requireStudioUser(event)
  const body = await readBody<{ token?: string }>(event)
  if (typeof body?.token !== 'string') throw createError({ statusCode: 400, statusMessage: 'Thiếu mã lời mời' })
  return studioApi(async () => ({ studio: await acceptStudioInvitation(getAppPool(), body.token!, user.id, user.email) }))
})
