import { getAppPool } from '../../../../../db/pool'
import { parseDownloadSettings, updateManagedDownloadSettings } from '../../../../../albums/download-settings'
import { albumIdParam } from '../../../../../utils/album-api'
import { requireStudioUser } from '../../../../../utils/require-studio-user'
import { studioApi, studioIdParam } from '../../../../../utils/studio-api'

export default defineEventHandler(async event => {
  const user = await requireStudioUser(event)
  const studioId = studioIdParam(event)
  const albumId = albumIdParam(event)
  const body = await readBody<unknown>(event)
  await studioApi(() => updateManagedDownloadSettings(getAppPool(),
    { kind: 'member', studioId, userId: user.id }, albumId, parseDownloadSettings(body)))
  setHeader(event, 'cache-control', 'no-store')
  return { ok: true }
})
