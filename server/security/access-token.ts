import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export function hashAccessToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function issueAccessToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, tokenHash: hashAccessToken(token) }
}

export function verifyAccessToken(token: string, expectedHash: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(expectedHash)) return false
  return timingSafeEqual(Buffer.from(hashAccessToken(token), 'hex'), Buffer.from(expectedHash, 'hex'))
}
