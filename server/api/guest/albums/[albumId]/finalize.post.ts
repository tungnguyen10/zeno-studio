import { getAppPool } from '../../../../db/pool'
import { finalizeManagedSelection } from '../../../../albums/selection'
import { guestManager, guestNoStore } from '../../../../utils/guest-api'
import { studioApi } from '../../../../utils/studio-api'

export default defineEventHandler(async event => {
  guestNoStore(event)
  const manager = guestManager(event)
  const body = await readBody<{ photoIds?: string[] }>(event)
  if (body?.photoIds !== undefined && (!Array.isArray(body.photoIds) || body.photoIds.some(id => typeof id !== 'string'))) {
    throw createError({ statusCode: 400, statusMessage: 'Danh sách ảnh không hợp lệ' })
  }
  return studioApi(() => finalizeManagedSelection(getAppPool(), manager, manager.albumId, body?.photoIds))
})
