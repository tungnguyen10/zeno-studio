import { getAppPool } from '../../db/pool'
import { getStudiosForUser } from '../../studios/studio'
import { requireStudioUser } from '../../utils/require-studio-user'

export default defineEventHandler(async event => {
  const user = await requireStudioUser(event)
  return { studios: await getStudiosForUser(getAppPool(), user.id) }
})
