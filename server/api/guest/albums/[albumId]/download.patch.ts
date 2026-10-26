import { getAppPool } from '../../../../db/pool'
import { parseDownloadSettings, updateManagedDownloadSettings } from '../../../../albums/download-settings'
import { guestManager, guestNoStore } from '../../../../utils/guest-api'
import { studioApi } from '../../../../utils/studio-api'

export default defineEventHandler(async event => {
  guestNoStore(event)
  const manager = guestManager(event)
  const body = await readBody<unknown>(event)
  await studioApi(() => updateManagedDownloadSettings(getAppPool(), manager, manager.albumId, parseDownloadSettings(body)))
  return { ok: true }
})
