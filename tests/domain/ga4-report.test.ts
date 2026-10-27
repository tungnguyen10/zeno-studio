import { describe, expect, it } from 'vitest'
import { createVerify, generateKeyPairSync } from 'node:crypto'
import { requestServiceAccountToken } from '../../server/analytics/google-token'
import { fetchGa4SiteReport, Ga4UpstreamError } from '../../server/analytics/ga4-report'

function response(dimensions: string[], metrics: string[], rows: Array<[string[], string[]]>) {
  return new Response(JSON.stringify({
    dimensionHeaders: dimensions.map(name => ({ name })),
    metricHeaders: metrics.map(name => ({ name })),
    rows: rows.map(([dimensionValues, metricValues]) => ({
      dimensionValues: dimensionValues.map(value => ({ value })),
      metricValues: metricValues.map(value => ({ value })),
    })),
  }), { status: 200 })
}

describe('Google Analytics Data API', () => {
  it('signs a read-only service-account assertion without returning the private key', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const credentials = JSON.stringify({
      client_email: 'analytics@example.iam.gserviceaccount.com',
      private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    })
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://oauth2.googleapis.com/token')
      const form = new URLSearchParams(String(init?.body))
      expect(form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer')
      const assertion = form.get('assertion')!
      const [header, payload, signature] = assertion.split('.')
      expect(JSON.parse(Buffer.from(header!, 'base64url').toString())).toEqual({ alg: 'RS256', typ: 'JWT' })
      const claims = JSON.parse(Buffer.from(payload!, 'base64url').toString())
      expect(claims).toMatchObject({
        iss: 'analytics@example.iam.gserviceaccount.com',
        scope: 'https://www.googleapis.com/auth/analytics.readonly',
        aud: 'https://oauth2.googleapis.com/token',
      })
      expect(claims.exp - claims.iat).toBe(3600)
      expect(createVerify('RSA-SHA256').update(`${header}.${payload}`).verify(publicKey, Buffer.from(signature!, 'base64url'))).toBe(true)
      return new Response(JSON.stringify({ access_token: 'test-access-token', expires_in: 3600 }), { status: 200 })
    }
    expect(await requestServiceAccountToken(credentials, fetcher as typeof fetch)).toEqual({ token: 'test-access-token', expiresIn: 3600 })
  })

  it('normalizes fixed site reports and excludes unsafe page paths', async () => {
    const calls: unknown[] = []
    const fetcher = async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      calls.push(body)
      const dimension = body.dimensions?.[0]?.name
      if (!dimension) return response([], ['activeUsers', 'screenPageViews'], [[[], ['12', '34']]])
      if (dimension === 'date') return response(['date'], ['activeUsers', 'screenPageViews'], [[['20261027'], ['4', '11']]])
      if (dimension === 'pagePath') return response(['pagePath'], ['screenPageViews'], [
        [['/studio'], ['18']], [['/album/secret-id?token=secret'], ['9']], [['/album/:albumId'], ['7']],
      ])
      return response(['eventName'], ['eventCount'], [[['album_created'], ['3']], [['photo_selected'], ['5']]])
    }
    const report = await fetchGa4SiteReport('123456', 'Asia/Ho_Chi_Minh', 7, 'test-access-token', fetcher as typeof fetch)
    expect(calls).toHaveLength(4)
    expect(calls.every(call => (call as { dateRanges: Array<{ startDate: string; endDate: string }> }).dateRanges[0]?.startDate === '6daysAgo')).toBe(true)
    expect(report).toMatchObject({ days: 7, timezone: 'Asia/Ho_Chi_Minh', activeUsers: 12, pageViews: 34 })
    expect(report.trend).toEqual([{ date: '2026-10-27', activeUsers: 4, pageViews: 11 }])
    expect(report.pages).toEqual([{ path: '/studio', views: 18 }, { path: '/album/:albumId', views: 7 }])
    expect(report.events).toHaveLength(10)
    expect(report.events.find(item => item.name === 'album_created')?.count).toBe(3)
    expect(report.events.find(item => item.name === 'album_published')?.count).toBe(0)
    expect(JSON.stringify(report)).not.toContain('secret')
  })

  it('fails explicitly on upstream errors and malformed metrics', async () => {
    await expect(fetchGa4SiteReport('123', 'Asia/Ho_Chi_Minh', 30, 'token',
      (async () => new Response('quota detail', { status: 429 })) as typeof fetch))
      .rejects.toMatchObject({ status: 429 })
    const broken = (async () => response([], ['activeUsers', 'screenPageViews'], [[[], ['NaN', '1']]])) as typeof fetch
    await expect(fetchGa4SiteReport('123', 'Asia/Ho_Chi_Minh', 30, 'token', broken)).rejects.toBeInstanceOf(Ga4UpstreamError)
  })
})
