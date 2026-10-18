import { getAppPool } from '../../../../../../../db/pool'
import { getSelectionResults } from '../../../../../../../albums/selection'
import { albumIdParam } from '../../../../../../../utils/album-api'
import { requireStudioUser } from '../../../../../../../utils/require-studio-user'
import { studioApi, studioIdParam } from '../../../../../../../utils/studio-api'

export default defineEventHandler(async event => {
  const user = await requireStudioUser(event)
  const studioId = studioIdParam(event)
  const albumId = albumIdParam(event)
  const versionId = getRouterParam(event, 'versionId')
  if (!versionId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(versionId)) throw createError({ statusCode: 400, statusMessage: 'Phiên bản không hợp lệ' })
  setHeader(event, 'cache-control', 'no-store')
  const result = await studioApi(() => getSelectionResults(getAppPool(), studioId, user.id, albumId, { versionId }))
  return {
    albumId, selectionVersionId: result.selectionVersionId, versionNumber: result.versionNumber,
    finalizedAt: result.finalizedAt,
    items: result.items.map(item => ({ photoId: item.photoId, originalFilename: item.filename, notes: item.notes })),
  }
})
