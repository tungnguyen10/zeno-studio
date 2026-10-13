import { getAppPool } from '../../../../db/pool'
import { savePhotoNote } from '../../../../albums/selection'
import { requireAlbumAccess } from '../../../../utils/album-api'
import { studioApi } from '../../../../utils/studio-api'

export default defineEventHandler(async event => {
  const access = await requireAlbumAccess(event)
  const photoId = getRouterParam(event, 'photoId')
  if (!photoId || !/^[0-9a-f-]{36}$/i.test(photoId)) throw createError({ statusCode: 400, statusMessage: 'Photo ID không hợp lệ' })
  const body = await readBody<{ text?: string; expectedVersion?: number }>(event)
  if (typeof body?.text !== 'string' || !Number.isInteger(body.expectedVersion)) throw createError({ statusCode: 400, statusMessage: 'Ghi chú hoặc phiên bản không hợp lệ' })
  setHeader(event, 'cache-control', 'no-store')
  return studioApi(() => savePhotoNote(getAppPool(), access, photoId, body.text!, body.expectedVersion!))
})
