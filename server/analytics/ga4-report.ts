import { safePage } from '../../app/lib/analytics-model'

export const GA4_EVENT_NAMES = [
  'album_created', 'album_published', 'album_opened', 'gallery_view_changed',
  'photo_selected', 'photo_unselected', 'photo_note_saved', 'selection_finalized',
  'selection_reopened', 'file_match_completed',
] as const

export class Ga4UpstreamError extends Error {
  constructor(readonly status: number) { super('GA4 report unavailable') }
}

export interface SiteReport {
  days: 7 | 30 | 90
  asOf: string
  timezone: string
  activeUsers: number
  pageViews: number
  trend: Array<{ date: string; activeUsers: number; pageViews: number }>
  pages: Array<{ path: string; views: number }>
  events: Array<{ name: typeof GA4_EVENT_NAMES[number]; count: number }>
}

interface Ga4ReportResponse {
  dimensionHeaders?: Array<{ name?: unknown }>
  metricHeaders?: Array<{ name?: unknown }>
  rows?: Array<{ dimensionValues?: Array<{ value?: unknown }>; metricValues?: Array<{ value?: unknown }> }>
}

function integer(value: unknown): number {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) throw new Ga4UpstreamError(502)
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) throw new Ga4UpstreamError(502)
  return parsed
}

function rows(body: Ga4ReportResponse, dimensions: string[], metrics: string[]): Array<{ dimensions: string[]; metrics: number[] }> {
  if (JSON.stringify(body.dimensionHeaders?.map(item => item.name) ?? []) !== JSON.stringify(dimensions)
    || JSON.stringify(body.metricHeaders?.map(item => item.name) ?? []) !== JSON.stringify(metrics)
    || (body.rows !== undefined && !Array.isArray(body.rows))) throw new Ga4UpstreamError(502)
  return (body.rows ?? []).map(row => {
    const values = row.dimensionValues?.map(item => item.value) ?? []
    const metricValues = row.metricValues?.map(item => integer(item.value)) ?? []
    if (values.length !== dimensions.length || values.some(value => typeof value !== 'string')
      || metricValues.length !== metrics.length) throw new Ga4UpstreamError(502)
    return { dimensions: values as string[], metrics: metricValues }
  })
}

function safePath(path: string): boolean {
  return path.startsWith('/') && !path.includes('?') && !path.includes('#')
    && safePage(path, 'https://example.test').path === path
}

export async function fetchGa4SiteReport(
  propertyId: string, propertyTimezone: string, days: 7 | 30 | 90, token: string,
  fetcher: typeof fetch = fetch,
): Promise<SiteReport> {
  if (!/^[0-9]+$/.test(propertyId)) throw new Error('GA4 property ID is not configured')
  try { new Intl.DateTimeFormat('en-US', { timeZone: propertyTimezone }) }
  catch { throw new Error('GA4 property timezone is not configured') }
  const dateRanges = [{ startDate: `${days - 1}daysAgo`, endDate: 'today' }]
  const endpoint = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`
  async function run(body: Record<string, unknown>): Promise<Ga4ReportResponse> {
    const response = await fetcher(endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ dateRanges, ...body }),
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) throw new Ga4UpstreamError(response.status)
    try { return await response.json() as Ga4ReportResponse }
    catch { throw new Ga4UpstreamError(502) }
  }
  const [totals, daily, paths, events] = await Promise.all([
    run({ metrics: [{ name: 'activeUsers' }, { name: 'screenPageViews' }] }),
    run({ dimensions: [{ name: 'date' }], metrics: [{ name: 'activeUsers' }, { name: 'screenPageViews' }], limit: '90' }),
    run({ dimensions: [{ name: 'pagePath' }], metrics: [{ name: 'screenPageViews' }],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }], limit: '100' }),
    run({ dimensions: [{ name: 'eventName' }], metrics: [{ name: 'eventCount' }],
      dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: [...GA4_EVENT_NAMES] } } },
      limit: String(GA4_EVENT_NAMES.length) }),
  ])
  const totalRows = rows(totals, [], ['activeUsers', 'screenPageViews'])
  const trend = rows(daily, ['date'], ['activeUsers', 'screenPageViews']).map(row => {
    const date = row.dimensions[0]!
    if (!/^[0-9]{8}$/.test(date)) throw new Ga4UpstreamError(502)
    return { date: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}`, activeUsers: row.metrics[0]!, pageViews: row.metrics[1]! }
  }).sort((a, b) => a.date.localeCompare(b.date))
  const pages = rows(paths, ['pagePath'], ['screenPageViews'])
    .filter(row => safePath(row.dimensions[0]!))
    .slice(0, 10).map(row => ({ path: row.dimensions[0]!, views: row.metrics[0]! }))
  const counts = new Map(rows(events, ['eventName'], ['eventCount'])
    .filter(row => GA4_EVENT_NAMES.includes(row.dimensions[0] as typeof GA4_EVENT_NAMES[number]))
    .map(row => [row.dimensions[0]!, row.metrics[0]!] as const))
  return {
    days, asOf: new Date().toISOString(), timezone: propertyTimezone,
    activeUsers: totalRows[0]?.metrics[0] ?? 0,
    pageViews: totalRows[0]?.metrics[1] ?? 0,
    trend, pages, events: GA4_EVENT_NAMES.map(name => ({ name, count: counts.get(name) ?? 0 })),
  }
}
