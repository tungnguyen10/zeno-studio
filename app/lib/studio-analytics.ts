import { isAnalyticsEnabled, readConsent } from './analytics-consent'

export async function reportGalleryOpen(albumId: string, flag: unknown, measurementId: unknown, studioFlag: unknown): Promise<boolean> {
  if (String(studioFlag) !== 'true' || !isAnalyticsEnabled(flag, measurementId) || readConsent(window.localStorage) !== 'accepted') return false
  await $fetch(`/api/album/${albumId}/analytics/open`, { method: 'POST' })
  return true
}
