import { getAppPool } from '../../../db/pool'
import { joinAlbum } from '../../../albums/access'
import { albumIdParam, requireAlbumAccess, setAlbumCookie } from '../../../utils/album-api'
import { studioApi } from '../../../utils/studio-api'

export default defineEventHandler(async event => {
  const albumId = albumIdParam(event)
  const access = await requireAlbumAccess(event)
  const body = await readBody<{ name?: string }>(event)
  if (typeof body?.name !== 'string') throw createError({ statusCode: 400, statusMessage: 'Cần nhập tên trước khi chọn ảnh' })
  const joined = await studioApi(() => joinAlbum(getAppPool(), access, body.name!))
  setAlbumCookie(event, albumId, joined.token)
  return joined
})
