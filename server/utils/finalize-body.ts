import type { H3Event } from 'h3'
import type { FinalizeAdjustments } from '../albums/selection'

export async function readFinalizeBody(event: H3Event): Promise<FinalizeAdjustments> {
  const body = await readBody<{ include?: unknown; exclude?: unknown } | null>(event)
  const valid = (value: unknown) => value === undefined || (Array.isArray(value) && value.every(id => typeof id === 'string'))
  if (body !== null && body !== undefined && (typeof body !== 'object' || !valid(body.include) || !valid(body.exclude))) {
    throw createError({ statusCode: 400, statusMessage: 'Danh sách ảnh không hợp lệ' })
  }
  return { include: body?.include as string[] | undefined, exclude: body?.exclude as string[] | undefined }
}
