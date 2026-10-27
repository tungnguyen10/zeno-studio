import type { QueryClient } from '../db/context'

export async function recordStudioMetric(
  client: QueryClient, studioId: string, albumId: string,
  metric: 'album_created' | 'album_published' | 'selection_finalized',
): Promise<void> {
  await client.query('SELECT app_private.record_studio_metric($1,$2,$3,1)', [studioId, albumId, metric])
}
