import type { H3Event } from 'h3'
import { createError, readBody } from 'h3'

export interface FileMatchCounts { matchedCount: number; missingCount: number; ambiguousCount: number }

export function parseFileMatchCounts(body: unknown): FileMatchCounts {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw createError({ statusCode: 400, statusMessage: 'Số liệu đối chiếu không hợp lệ' })
  const fields = Object.keys(body)
  if (fields.length !== 3 || !['matchedCount', 'missingCount', 'ambiguousCount'].every(key => fields.includes(key))) {
    throw createError({ statusCode: 400, statusMessage: 'Số liệu đối chiếu không hợp lệ' })
  }
  const values = body as Record<string, unknown>
  for (const key of fields) {
    if (!Number.isInteger(values[key]) || (values[key] as number) < 0 || (values[key] as number) > 10000) {
      throw createError({ statusCode: 400, statusMessage: 'Số liệu đối chiếu không hợp lệ' })
    }
  }
  return values as unknown as FileMatchCounts
}

export async function fileMatchCounts(event: H3Event): Promise<FileMatchCounts> {
  return parseFileMatchCounts(await readBody(event))
}
