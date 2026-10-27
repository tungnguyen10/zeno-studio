import type { SiteReport } from './ga4-report'
import { createHash } from 'node:crypto'
import { fetchGa4SiteReport } from './ga4-report'
import { getGoogleAccessToken } from './google-token'

export function parseSiteReportDays(value: unknown): 7 | 30 | 90 {
  if (value === undefined) return 30
  if (value === '7' || value === '30' || value === '90') return Number(value) as 7 | 30 | 90
  throw new Error('Khoảng ngày không hợp lệ')
}

export function createSiteReportCache(
  loader: (property: string, days: 7 | 30 | 90) => Promise<SiteReport>,
  now: () => number = Date.now,
): (property: string, days: 7 | 30 | 90) => Promise<SiteReport> {
  const values = new Map<string, { value: SiteReport; expiresAt: number }>()
  const pending = new Map<string, Promise<SiteReport>>()
  return (property, days) => {
    const key = `${property}:${days}`
    const hit = values.get(key)
    if (hit && hit.expiresAt > now()) return Promise.resolve(hit.value)
    const inFlight = pending.get(key)
    if (inFlight) return inFlight
    const work = loader(property, days).then(value => {
      values.set(key, { value, expiresAt: now() + 15 * 60 * 1000 })
      return value
    }).finally(() => { pending.delete(key) })
    pending.set(key, work)
    return work
  }
}

export interface SiteReportConfig {
  propertyId: string
  propertyTimezone: string
  serviceAccountJson: string
}

const caches = new Map<string, ReturnType<typeof createSiteReportCache>>()

export function getCachedSiteReport(config: SiteReportConfig, days: 7 | 30 | 90): Promise<SiteReport> {
  if (!config.propertyId || !config.propertyTimezone || !config.serviceAccountJson) {
    throw new Error('GA4 reporting is not configured')
  }
  const key = createHash('sha256').update(JSON.stringify(config)).digest('hex')
  let cache = caches.get(key)
  if (!cache) {
    cache = createSiteReportCache(async (_property, range) => {
      const token = await getGoogleAccessToken(config.serviceAccountJson)
      return fetchGa4SiteReport(config.propertyId, config.propertyTimezone, range, token)
    })
    caches.set(key, cache)
  }
  return cache(key, days)
}
