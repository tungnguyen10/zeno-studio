import { StudioOperationError } from '../studios/error'

export function studioIdParam(event: Parameters<typeof getRouterParam>[0]): string {
  const id = getRouterParam(event, 'studioId')
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Studio ID không hợp lệ' })
  }
  return id
}

export async function studioApi<T>(work: () => Promise<T>): Promise<T> {
  try { return await work() }
  catch (error) {
    if (error instanceof StudioOperationError) {
      throw createError({ statusCode: error.statusCode, statusMessage: error.message })
    }
    throw error
  }
}
