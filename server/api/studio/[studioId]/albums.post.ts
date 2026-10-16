import { getAppPool } from '../../../db/pool'
import { createAlbum } from '../../../albums/album'
import { requireVerifiedDriveSource } from '../../../utils/drive-gate'
import { requireStudioUser } from '../../../utils/require-studio-user'
import { studioApi, studioIdParam } from '../../../utils/studio-api'
import type { SelectionLimit } from '../../../../shared/domain/selection'

export default defineEventHandler(async event => {
  const user = await requireStudioUser(event)
  const studioId = studioIdParam(event)
  const source = requireVerifiedDriveSource()
  const body = await readBody<{
    folderUrl?: string; title?: string; expiresInDays?: 15 | 30; limit?: SelectionLimit
  }>(event)
  if (typeof body?.folderUrl !== 'string' || typeof body?.title !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Thiếu link Drive hoặc tên album' })
  }
  return studioApi(async () => ({ album: await createAlbum(getAppPool(), source, {
    studioId, userId: user.id, folderUrl: body.folderUrl!, title: body.title!, expiresInDays: body.expiresInDays ?? 15,
    limit: body.limit ?? { kind: 'unlimited' },
  }) }))
})
