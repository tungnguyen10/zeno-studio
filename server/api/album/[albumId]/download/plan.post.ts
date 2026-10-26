import { getAppPool } from '../../../../db/pool'
import { createDownloadPlan, parseDownloadPlanRequest } from '../../../../downloads/plan'
import { enforceDownloadRate } from '../../../../downloads/rate-limit'
import { albumIdParam, requireAlbumAccess } from '../../../../utils/album-api'
import { requireVerifiedDriveSource } from '../../../../utils/drive-gate'
import { studioApi } from '../../../../utils/studio-api'

export default defineEventHandler(async event => {
  albumIdParam(event)
  const access = await requireAlbumAccess(event)
  const body = await readBody<unknown>(event)
  return studioApi(async () => {
    const request = parseDownloadPlanRequest(body)
    await enforceDownloadRate(event, getAppPool(), access)
    const plan = await createDownloadPlan(getAppPool(), access, requireVerifiedDriveSource(), request)
    setHeader(event, 'cache-control', 'private, no-store')
    return plan
  })
})
