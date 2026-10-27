import { createSign } from 'node:crypto'

type Credentials = { client_email: string; private_key: string }
let cached: { credentials: string; token: string; expiresAt: number } | undefined

function parseCredentials(raw: string): Credentials {
  let value: unknown
  try { value = JSON.parse(raw) } catch { throw new Error('GA4 service account is not configured') }
  if (!value || typeof value !== 'object') throw new Error('GA4 service account is not configured')
  const record = value as Record<string, unknown>
  if (typeof record.client_email !== 'string' || !record.client_email.endsWith('.gserviceaccount.com')
    || typeof record.private_key !== 'string' || !record.private_key.includes('BEGIN PRIVATE KEY')) {
    throw new Error('GA4 service account is not configured')
  }
  return { client_email: record.client_email, private_key: record.private_key }
}

export async function requestServiceAccountToken(credentialsJson: string, fetcher: typeof fetch = fetch): Promise<{ token: string; expiresIn: number }> {
  const credentials = parseCredentials(credentialsJson)
  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const claims = Buffer.from(JSON.stringify({
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })).toString('base64url')
  const unsigned = `${header}.${claims}`
  const signature = createSign('RSA-SHA256').update(unsigned).sign(credentials.private_key).toString('base64url')
  const response = await fetcher('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${signature}`,
    }),
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) throw new Error('GA4 service account authorization failed')
  const data: unknown = await response.json()
  if (!data || typeof data !== 'object') throw new Error('GA4 service account authorization failed')
  const token = (data as Record<string, unknown>).access_token
  const expiresIn = (data as Record<string, unknown>).expires_in
  if (typeof token !== 'string' || !token || typeof expiresIn !== 'number' || expiresIn < 120) {
    throw new Error('GA4 service account authorization failed')
  }
  return { token, expiresIn }
}

export async function getGoogleAccessToken(credentialsJson: string, fetcher: typeof fetch = fetch): Promise<string> {
  if (cached?.credentials === credentialsJson && cached.expiresAt > Date.now()) return cached.token
  const result = await requestServiceAccountToken(credentialsJson, fetcher)
  cached = { credentials: credentialsJson, token: result.token, expiresAt: Date.now() + (result.expiresIn - 60) * 1000 }
  return result.token
}
