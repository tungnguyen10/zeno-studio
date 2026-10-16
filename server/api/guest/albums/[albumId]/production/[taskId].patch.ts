import { getAppPool } from '../../../../../db/pool'
import { updateManagedProductionTask } from '../../../../../albums/production'
import { guestManager, guestNoStore } from '../../../../../utils/guest-api'
import { studioApi } from '../../../../../utils/studio-api'

export default defineEventHandler(async event => {
  guestNoStore(event)
  const manager = guestManager(event)
  const taskId = getRouterParam(event, 'taskId')
  if (!taskId || !/^[0-9a-f-]{36}$/i.test(taskId)) throw createError({ statusCode: 400, statusMessage: 'Task ID không hợp lệ' })
  const body = await readBody<{ status?: 'RETOUCHING' | 'WAITING_REVIEW' }>(event)
  if (body?.status !== 'RETOUCHING' && body?.status !== 'WAITING_REVIEW') throw createError({ statusCode: 400, statusMessage: 'Trạng thái không hợp lệ' })
  return studioApi(() => updateManagedProductionTask(getAppPool(), manager, manager.albumId, taskId, body.status!))
})
