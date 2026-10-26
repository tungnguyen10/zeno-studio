import { describe, expect, it } from 'vitest'
import { signDownloadTicket, verifyDownloadTicket } from '../../server/downloads/ticket'

const secret = 'download-test-secret-0123456789-abcdef'
const albumId = '11111111-1111-4111-8111-111111111111'
const photoId = '22222222-2222-4222-8222-222222222222'

describe('download ticket', () => {
  it('binds album, cycle, action, ordered IDs and expiry', () => {
    const payload = { v: 1 as const, albumId, cycle: 2, kind: 'basket' as const, format: 'zip' as const,
      photoIds: [photoId], part: 1, issuedAt: 1000, expiresAt: 1600 }
    const ticket = signDownloadTicket(payload, secret)
    expect(verifyDownloadTicket(ticket, secret, 1500)).toEqual(payload)
    expect(() => verifyDownloadTicket(`${ticket}x`, secret, 1500)).toThrow('Vé tải không hợp lệ')
    expect(() => verifyDownloadTicket(ticket, secret, 1601)).toThrow('Vé tải không hợp lệ')
    expect(() => verifyDownloadTicket(ticket, 'other-secret-0123456789-abcdef', 1500)).toThrow('Vé tải không hợp lệ')
  })

  it('rejects oversized payloads and invalid shape', () => {
    expect(() => signDownloadTicket({ v: 1, albumId, cycle: 1, kind: 'all', format: 'zip',
      photoIds: Array.from({ length: 51 }, () => photoId), part: 0, issuedAt: 1000, expiresAt: 1600 }, secret)).toThrow()
  })
})
