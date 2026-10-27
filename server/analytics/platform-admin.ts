import type { H3Event } from 'h3'
import { withDatabaseContext, type ConnectionPool } from '../db/context'
import { getAppPool } from '../db/pool'
import { requireStudioUser } from '../utils/require-studio-user'

export async function isPlatformAdmin(pool: ConnectionPool, userId: string): Promise<boolean> {
  const result = await withDatabaseContext(pool, { userId, scope: 'platform_admin_check' },
    client => client.query('SELECT 1 FROM platform_admins WHERE user_id = $1', [userId]))
  return result.rows.length === 1
}

export async function requirePlatformAdmin(event: H3Event): Promise<{ id: string }> {
  const user = await requireStudioUser(event)
  if (!await isPlatformAdmin(getAppPool(), user.id)) {
    throw createError({ statusCode: 403, statusMessage: 'Không có quyền xem thống kê nền tảng' })
  }
  return { id: user.id }
}
