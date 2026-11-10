import { describe, expect, it } from 'vitest'
import { albumAnalyticsIdentity, albumAnalyticsMetadata, type AnalyticsMetadataOptions } from '../../server/analytics/identity'

describe('album analytics identity', () => {
  it('is stable, pseudonymous and scoped to the album and independent secret', () => {
    const identity = albumAnalyticsIdentity('internal-album-id', 'test-analytics-secret')
    expect(identity).toEqual(albumAnalyticsIdentity('internal-album-id', 'test-analytics-secret'))
    expect(identity.albumId).toMatch(/^alb_[a-f0-9]{64}$/)
    expect(identity.albumId).not.toContain('internal-album-id')
    expect(identity).not.toEqual(albumAnalyticsIdentity('other-album', 'test-analytics-secret'))
    expect(identity).not.toEqual(albumAnalyticsIdentity('internal-album-id', 'other-secret'))
  })
  it('omits identity for missing, blank or malformed runtime secret values', () => {
    for (const value of [undefined, '', '  ', 123, {}, [], true]) {
      expect(albumAnalyticsMetadata('private-album', { analyticsIdSecret: value } as AnalyticsMetadataOptions)).toEqual({})
    }
    expect(albumAnalyticsMetadata('private-album', { analyticsIdSecret: 'valid-secret' })).toEqual({ analytics: albumAnalyticsIdentity('private-album', 'valid-secret') })
  })
  it('rejects missing or blank secrets explicitly', () => {
    expect(() => albumAnalyticsIdentity('album', '')).toThrow(/secret/i)
    expect(() => albumAnalyticsIdentity('album', '  ')).toThrow(/secret/i)
  })
})
