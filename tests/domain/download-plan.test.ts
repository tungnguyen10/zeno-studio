import { describe, expect, it } from 'vitest'
import { partitionFiles } from '../../server/downloads/plan'

describe('bounded download partition', () => {
  it('splits at byte and file boundaries in stable order', () => {
    const files = ['a', 'b', 'c'].map(photoId => ({ photoId, filename: `${photoId}.jpg`, mimeType: 'image/jpeg', sizeBytes: 5 }))
    expect(partitionFiles(files, { maxFiles: 2, maxBytes: 10 }).map(part => part.map(file => file.photoId)))
      .toEqual([['a', 'b'], ['c']])
    expect(partitionFiles(files, { maxFiles: 1, maxBytes: 100 }).map(part => part.map(file => file.photoId)))
      .toEqual([['a'], ['b'], ['c']])
  })

  it('keeps an oversized original alone for direct file delivery', () => {
    const files = [5, 11, 5].map((sizeBytes, index) => ({ photoId: String(index), filename: `${index}.jpg`, mimeType: 'image/jpeg', sizeBytes }))
    expect(partitionFiles(files, { maxFiles: 2, maxBytes: 10 }).map(part => part.map(file => file.sizeBytes)))
      .toEqual([[5], [11], [5]])
    expect(() => partitionFiles([], { maxFiles: 2, maxBytes: 10 })).toThrow()
  })
})
