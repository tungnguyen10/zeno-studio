import { getAppPool } from '../../db/pool'
import { ensureStudio } from '../../studios/studio'
import { requireStudioUser } from '../../utils/require-studio-user'

export default defineEventHandler(async event => {
  const user = await requireStudioUser(event)
  return { studio: await ensureStudio(getAppPool(), user.id, user.name || 'Studio của tôi') }
})
