import { createHmac } from 'node:crypto'
import type { ConnectionPool } from '../db/context'
import { withDatabaseContext } from '../db/context'

export async function consumeGuestCreateAttempt(pool: ConnectionPool, address: string, secret: string): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  if (!address || !secret) throw new Error('Guest creation rate limit is not configured')
  const hash = createHmac('sha256', secret).update('guest-create:').update(address).digest('hex')
  const result = await withDatabaseContext(pool, { scope: 'guest_create_rate_limit' },
    client => client.query<{ allowed: boolean; retry_after_seconds: number }>(
      'SELECT allowed, retry_after_seconds FROM app_private.consume_guest_create_attempt($1)', [hash]))
  return { allowed: result.rows[0]!.allowed, retryAfterSeconds: result.rows[0]!.retry_after_seconds }
}
