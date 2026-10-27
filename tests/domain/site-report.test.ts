import { describe, expect, it } from 'vitest'
import { createSiteReportCache, parseSiteReportDays } from '../../server/analytics/site-report'
import type { SiteReport } from '../../server/analytics/ga4-report'

const report = (days: 7 | 30 | 90): SiteReport => ({
  days, asOf: '2026-10-27T00:00:00.000Z', timezone: 'Asia/Ho_Chi_Minh',
  activeUsers: 2, pageViews: 3, trend: [], pages: [], events: [],
})

describe('site report cache and query boundary', () => {
  it('accepts only fixed periods and defaults to 30 days', () => {
    expect(parseSiteReportDays(undefined)).toBe(30)
    expect(parseSiteReportDays('7')).toBe(7)
    expect(parseSiteReportDays('90')).toBe(90)
    for (const input of ['0', '365', '7.0', ['7'], null, 7]) {
      expect(() => parseSiteReportDays(input)).toThrow()
    }
  })

  it('coalesces concurrent loads and caches only successful responses per property and period', async () => {
    let now = 0
    let calls = 0
    const cache = createSiteReportCache(async (_property, days) => {
      calls++
      return report(days)
    }, () => now)
    const [first, same] = await Promise.all([cache('property-a', 7), cache('property-a', 7)])
    expect(first).toEqual(same)
    expect(calls).toBe(1)
    await cache('property-a', 7)
    expect(calls).toBe(1)
    await cache('property-a', 30)
    await cache('property-b', 7)
    expect(calls).toBe(3)
    now = 15 * 60 * 1000
    await cache('property-a', 7)
    expect(calls).toBe(4)
  })

  it('does not cache failures', async () => {
    let calls = 0
    const cache = createSiteReportCache(async (_property, days) => {
      calls++
      if (calls === 1) throw new Error('upstream failed')
      return report(days)
    })
    await expect(cache('property-a', 30)).rejects.toThrow('upstream failed')
    expect((await cache('property-a', 30)).days).toBe(30)
    expect(calls).toBe(2)
  })
})
