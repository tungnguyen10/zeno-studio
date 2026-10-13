import { describe, expect, it } from 'vitest'
import { hashAccessToken, issueAccessToken, verifyAccessToken } from '../../server/security/access-token'

describe('album access tokens', () => {
  it('stores only a hash and verifies the secret in constant time', () => {
    const issued = issueAccessToken()
    expect(issued.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(issued.tokenHash).toBe(hashAccessToken(issued.token))
    expect(issued.tokenHash).not.toContain(issued.token)
    expect(verifyAccessToken(issued.token, issued.tokenHash)).toBe(true)
    expect(verifyAccessToken('wrong', issued.tokenHash)).toBe(false)
  })
})
