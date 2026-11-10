import { createHmac } from 'node:crypto'
import type { AnalyticsIdentity } from '../../shared/domain/analytics'

export interface AnalyticsMetadataOptions { analyticsIdSecret?: string }
export interface AlbumAnalyticsMetadata { analytics?: AnalyticsIdentity }

export function albumAnalyticsIdentity(albumId: string, secret: string): AnalyticsIdentity {
  if (typeof secret !== 'string' || !secret.trim()) throw new Error('Analytics identity secret is required')
  return { albumId: `alb_${createHmac('sha256', secret).update(`album:v1:${albumId}`).digest('hex')}` }
}

// Call only after album authorization. Missing configuration never exposes a raw ID.
export function albumAnalyticsMetadata(albumId: string, options: AnalyticsMetadataOptions = {}): AlbumAnalyticsMetadata {
  return typeof options.analyticsIdSecret === 'string' && options.analyticsIdSecret.trim()
    ? { analytics: albumAnalyticsIdentity(albumId, options.analyticsIdSecret) }
    : {}
}
