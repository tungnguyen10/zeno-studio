import { getAppPool } from '../../../../db/pool'
import { startManagedReviewRound } from '../../../../albums/production'
import { guestManager, guestNoStore } from '../../../../utils/guest-api'
import { studioApi } from '../../../../utils/studio-api'

export default defineEventHandler(async event => {
  guestNoStore(event)
  const manager = guestManager(event)
  const body = await readBody<{ driveUrl?: string }>(event)
  if (typeof body?.driveUrl !== 'string') throw createError({ statusCode: 400, statusMessage: 'Thiếu link Drive' })
  return studioApi(() => startManagedReviewRound(getAppPool(), manager, manager.albumId, body.driveUrl!))
})
