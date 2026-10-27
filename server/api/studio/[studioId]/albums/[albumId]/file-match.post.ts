import { getAppPool } from '../../../../../db/pool'
import { withManagedAlbum } from '../../../../../albums/manager'
import { requireStudioUser } from '../../../../../utils/require-studio-user'
import { studioApi, studioIdParam } from '../../../../../utils/studio-api'
import { albumIdParam } from '../../../../../utils/album-api'
import { fileMatchCounts } from '../../../../../utils/file-match-api'

export default defineEventHandler(async event => {
  setHeader(event, 'cache-control', 'no-store')
  const user = await requireStudioUser(event)
  const studioId = studioIdParam(event)
  const albumId = albumIdParam(event)
  const counts = await fileMatchCounts(event)
  return studioApi(() => withManagedAlbum(getAppPool(), { kind: 'member', studioId, userId: user.id }, albumId, 'album.view', async client => {
    await client.query('SELECT app_private.record_file_match($1,$2,$3,$4)', [albumId, counts.matchedCount, counts.missingCount, counts.ambiguousCount])
    return { recorded: true }
  }))
})
