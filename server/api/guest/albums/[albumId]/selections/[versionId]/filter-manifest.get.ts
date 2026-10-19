import { getAppPool } from '../../../../../../db/pool'
import { getManagedSelectionResults } from '../../../../../../albums/selection'
import { guestManager, guestNoStore } from '../../../../../../utils/guest-api'
import { studioApi } from '../../../../../../utils/studio-api'

export default defineEventHandler(async event => {
  guestNoStore(event)
  const manager = guestManager(event)
  const versionId = getRouterParam(event, 'versionId')
  if (!versionId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(versionId)) {
    throw createError({ statusCode: 400, statusMessage: 'Phiên bản không hợp lệ' })
  }
  const result = await studioApi(() => getManagedSelectionResults(getAppPool(), manager, manager.albumId, { versionId }))
  return {
    albumId: manager.albumId,
    selectionVersionId: result.selectionVersionId,
    versionNumber: result.versionNumber,
    finalizedAt: result.finalizedAt,
    items: result.items.map(item => ({ photoId: item.photoId, originalFilename: item.filename, notes: item.notes })),
  }
})
