import { describe, expect, it, vi } from 'vitest'
import { handleExpiry } from '../../functions/expire/handler'

function scheduledRequest(options: { header?: string; name?: string; method?: string } = {}) {
  return new Request('https://example.invalid/', {
    method: options.method ?? 'POST',
    headers: {
      'content-type': 'application/json',
      ...(options.header ? { 'x-neon-trigger-invocation-id': options.header } : {}),
    },
    ...(options.method === 'GET' ? {} : { body: JSON.stringify({
      version: 1,
      trigger: { type: 'schedule', name: options.name ?? 'album-expiry' },
      data: { scheduled_at: '2026-10-13T02:00:00Z' },
    }) }),
  })
}

describe('Neon expiry function', () => {
  it('rejects ordinary HTTP requests before touching the database', async () => {
    const query = vi.fn()
    expect((await handleExpiry(scheduledRequest(), query)).status).toBe(403)
    expect((await handleExpiry(scheduledRequest({ header: 'id', name: 'another-job' }), query)).status).toBe(403)
    expect((await handleExpiry(scheduledRequest({ method: 'GET', header: 'id' }), query)).status).toBe(405)
    expect(query).not.toHaveBeenCalled()
  })

  it('runs the idempotent database function for a schedule invocation', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ expired_count: 2, purged_count: 1 }] })
    const response = await handleExpiry(scheduledRequest({ header: 'invocation-id' }), query)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ expired_count: 2, purged_count: 1 })
    expect(query).toHaveBeenCalledWith('SELECT * FROM app_private.expire_and_purge()')
  })
})
