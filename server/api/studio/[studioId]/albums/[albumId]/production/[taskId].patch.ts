import { getAppPool } from '../../../../../../db/pool'
import { updateProductionTask } from '../../../../../../albums/production'
import { requireStudioUser } from '../../../../../../utils/require-studio-user'
import { studioApi, studioIdParam } from '../../../../../../utils/studio-api'
import type { ProductionStatus } from '../../../../../../../shared/domain/workflow'

export default defineEventHandler(async event => {
  const user = await requireStudioUser(event)
  const studioId = studioIdParam(event)
  const albumId = getRouterParam(event, 'albumId')
  const taskId = getRouterParam(event, 'taskId')
  if (!albumId || !taskId || !/^[0-9a-f-]{36}$/i.test(albumId) || !/^[0-9a-f-]{36}$/i.test(taskId)) throw createError({ statusCode: 400 })
  const body = await readBody<{ status?: ProductionStatus; assignedUserId?: string | null }>(event)
  if (!body?.status || !['PENDING', 'RETOUCHING', 'WAITING_REVIEW', 'APPROVED', 'REVISION_REQUESTED', 'DELIVERED'].includes(body.status)) throw createError({ statusCode: 400, statusMessage: 'Trạng thái không hợp lệ' })
  return studioApi(() => updateProductionTask(getAppPool(), studioId, user.id, albumId, taskId, body.status!, body.assignedUserId))
})
