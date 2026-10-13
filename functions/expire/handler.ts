export interface ExpiryResult {
  expired_count: number
  purged_count: number
}

export type ExpiryQuery = (sql: string) => Promise<{ rows: ExpiryResult[] }>

export async function handleExpiry(request: Request, query: ExpiryQuery): Promise<Response> {
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })
  if (!request.headers.get('x-neon-trigger-invocation-id')) return new Response('Forbidden', { status: 403 })

  let payload: unknown
  try { payload = await request.json() } catch { return new Response('Bad Request', { status: 400 }) }
  if (!payload || typeof payload !== 'object') return new Response('Bad Request', { status: 400 })
  const event = payload as { version?: unknown; trigger?: { type?: unknown; name?: unknown }; data?: { scheduled_at?: unknown } }
  if (event.version !== 1 || event.trigger?.type !== 'schedule' || event.trigger.name !== 'album-expiry'
    || typeof event.data?.scheduled_at !== 'string' || Number.isNaN(Date.parse(event.data.scheduled_at))) {
    return new Response('Forbidden', { status: 403 })
  }

  const result = await query('SELECT * FROM app_private.expire_and_purge()')
  return Response.json(result.rows[0] ?? { expired_count: 0, purged_count: 0 })
}
