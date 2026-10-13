import type { H3Event } from 'h3'
import { getStudioAuth } from './auth'

export async function requireStudioUser(event: H3Event) {
  const session = await getStudioAuth().api.getSession({ headers: event.headers })
  if (!session?.user) throw createError({ statusCode: 401, statusMessage: 'Cần đăng nhập' })
  if (!session.user.emailVerified) throw createError({ statusCode: 403, statusMessage: 'Cần xác minh email' })
  return session.user
}
