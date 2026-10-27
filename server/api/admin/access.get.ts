import { getAppPool } from '../../db/pool'
import { isPlatformAdmin } from '../../analytics/platform-admin'
import { requireStudioUser } from '../../utils/require-studio-user'

export default defineEventHandler(async event => {
  const user = await requireStudioUser(event)
  setHeader(event, 'cache-control', 'private, no-store')
  return { isAdmin: await isPlatformAdmin(getAppPool(), user.id) }
})
