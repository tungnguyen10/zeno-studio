import { describe, expect, it } from 'vitest'
import { usePagedPhotos } from '../../app/composables/usePagedPhotos'

describe('paged photos', () => {
  it('loads a small first page and larger following pages', async () => {
    const limits: number[] = []
    const pages = usePagedPhotos(async ({ limit, cursor }) => {
      limits.push(limit)
      return { items: [{ id: cursor ?? 'first' }], nextCursor: cursor ? null : 'second', total: 2, selectedCount: 0 }
    })

    await pages.loadMore()
    await pages.loadMore()
    await pages.reset()

    expect(limits).toEqual([48, 120, 48])
  })
})
