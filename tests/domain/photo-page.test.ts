import { describe, expect, it } from 'vitest'
import { readPhotoPageQuery } from '../../server/albums/photo-page'

describe('photo page filters', () => {
  it('accepts the previous finalized set only on managed album routes', () => {
    expect(() => readPhotoPageQuery({ filter: 'previous' })).toThrow('Bộ lọc ảnh không hợp lệ')
    expect(readPhotoPageQuery({ filter: 'previous' }, 120, true)).toMatchObject({ filter: 'previous', limit: 120 })
  })
})
