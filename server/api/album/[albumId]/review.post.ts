import { getAppPool } from '../../../db/pool'
import { submitCustomerReview } from '../../../albums/production'
import { requireAlbumAccess } from '../../../utils/album-api'
import { studioApi } from '../../../utils/studio-api'

export default defineEventHandler(async event => {
  const access = await requireAlbumAccess(event)
  const body = await readBody<{ decision?: 'approve' | 'request_revision'; note?: string }>(event)
  if (!body?.decision || !['approve', 'request_revision'].includes(body.decision) || typeof body.note !== 'string') throw createError({ statusCode: 400, statusMessage: 'Quyết định duyệt không hợp lệ' })
  return studioApi(() => submitCustomerReview(getAppPool(), access, body.decision!, body.note!))
})
