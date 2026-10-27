import { withDatabaseContext, type ConnectionPool } from '../db/context'
import { StudioOperationError } from '../studios/error'

export interface StudioAnalyticsReport {
  days: 7 | 30 | 90
  asOf: string
  timezone: 'Asia/Ho_Chi_Minh'
  albumsCreated: number
  albumsPublished: number
  selectionFinalized: number
  albumsFinalized: number
  galleryOpens: number
  fileMatchRuns: number
  matchedCount: number
  missingCount: number
  ambiguousCount: number
  trend: Array<{ date: string; albumsCreated: number; albumsPublished: number; selectionFinalized: number; galleryOpens: number; fileMatchRuns: number }>
  albums: Array<{ id: string; title: string; status: string; photoCount: number; selectedCount: number; noteCount: number; galleryOpens: number; latestVersion: number | null }>
}

type DailyRow = {
  day: string; albums_created: number; albums_published: number; selection_finalized: number;
  gallery_opens: number; file_match_runs: number; matched_count: number; missing_count: number; ambiguous_count: number
}
type AlbumRow = {
  id: string; title: string; status: string; photo_count: number; selected_count: number;
  note_count: number; gallery_opens: number; latest_version: number | null
}
const timezone = 'Asia/Ho_Chi_Minh' as const
const localDay = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
const number = (value: unknown) => Number(value ?? 0)

export async function getStudioAnalytics(
  pool: ConnectionPool, studioId: string, userId: string, days: 7 | 30 | 90,
  now: Date = new Date(),
): Promise<StudioAnalyticsReport> {
  return withDatabaseContext(pool, { studioId, userId, scope: 'member' }, async client => {
    const member = await client.query<{ role: string }>('SELECT role FROM studio_members WHERE studio_id=$1 AND user_id=$2', [studioId, userId])
    if (member.rows[0]?.role !== 'owner') throw new StudioOperationError('Chỉ chủ studio được xem thống kê', 403)
    const today = localDay(now)
    const start = new Date(`${today}T00:00:00.000Z`)
    start.setUTCDate(start.getUTCDate() - days + 1)
    const firstDay = start.toISOString().slice(0, 10)
    const daily = await client.query<DailyRow>(
      `SELECT day::text, albums_created, albums_published, selection_finalized,
        gallery_opens, file_match_runs, matched_count, missing_count, ambiguous_count
       FROM studio_daily_metrics WHERE studio_id=$1 AND day BETWEEN $2::date AND $3::date ORDER BY day`,
      [studioId, firstDay, today],
    )
    const byDay = new Map(daily.rows.map(row => [row.day, row]))
    const trend = Array.from({ length: days }, (_, offset) => {
      const date = new Date(`${firstDay}T00:00:00.000Z`)
      date.setUTCDate(date.getUTCDate() + offset)
      const key = date.toISOString().slice(0, 10)
      const row = byDay.get(key)
      return {
        date: key, albumsCreated: number(row?.albums_created), albumsPublished: number(row?.albums_published),
        selectionFinalized: number(row?.selection_finalized), galleryOpens: number(row?.gallery_opens),
        fileMatchRuns: number(row?.file_match_runs),
      }
    })
    const sum = (field: keyof DailyRow) => daily.rows.reduce((total, row) => total + number(row[field]), 0)
    const finalized = await client.query<{ count: number }>(
      `SELECT count(DISTINCT a.id)::integer AS count FROM albums a
       JOIN selection_versions v ON v.album_id=a.id
       WHERE a.studio_id=$1 AND (v.finalized_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $2::date AND $3::date`,
      [studioId, firstDay, today],
    )
    const albums = await client.query<AlbumRow>(
      `SELECT a.id, a.title, a.status,
        (SELECT count(*)::integer FROM photos p WHERE p.album_id=a.id) AS photo_count,
        (SELECT count(*)::integer FROM selection_version_items i WHERE i.selection_version_id=(
          SELECT v.id FROM selection_versions v WHERE v.album_id=a.id ORDER BY v.version_number DESC LIMIT 1
        )) AS selected_count,
        (SELECT count(*)::integer FROM photo_notes n WHERE n.album_id=a.id AND n.body <> '') AS note_count,
        (SELECT coalesce(sum(s.views),0)::integer FROM album_daily_stats s
          WHERE s.album_id=a.id AND s.day BETWEEN $2::date AND $3::date) AS gallery_opens,
        (SELECT max(v.version_number)::integer FROM selection_versions v WHERE v.album_id=a.id) AS latest_version
       FROM albums a WHERE a.studio_id=$1 ORDER BY a.updated_at DESC, a.id DESC LIMIT 50`,
      [studioId, firstDay, today],
    )
    return {
      days, asOf: now.toISOString(), timezone,
      albumsCreated: sum('albums_created'), albumsPublished: sum('albums_published'),
      selectionFinalized: sum('selection_finalized'), albumsFinalized: number(finalized.rows[0]?.count),
      galleryOpens: sum('gallery_opens'), fileMatchRuns: sum('file_match_runs'),
      matchedCount: sum('matched_count'), missingCount: sum('missing_count'), ambiguousCount: sum('ambiguous_count'),
      trend,
      albums: albums.rows.map(row => ({
        id: row.id, title: row.title, status: row.status, photoCount: number(row.photo_count),
        selectedCount: number(row.selected_count), noteCount: number(row.note_count),
        galleryOpens: number(row.gallery_opens), latestVersion: row.latest_version,
      })),
    }
  })
}
