import { getAppPool } from '../../../../db/pool'
import { withManagedAlbum } from '../../../../albums/manager'
import { guestManager, guestNoStore } from '../../../../utils/guest-api'
import { studioApi } from '../../../../utils/studio-api'
import { fileMatchCounts } from '../../../../utils/file-match-api'

export default defineEventHandler(async event => {
  guestNoStore(event)
  const manager = guestManager(event)
  const counts = await fileMatchCounts(event)
  return studioApi(() => withManagedAlbum(getAppPool(), manager, manager.albumId, 'album.view', async client => {
    await client.query('SELECT app_private.record_file_match($1,$2,$3,$4)', [manager.albumId, counts.matchedCount, counts.missingCount, counts.ambiguousCount])
    return { recorded: true }
  }))
})
