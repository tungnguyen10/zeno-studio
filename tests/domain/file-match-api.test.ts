import { describe, expect, it } from 'vitest'
import { parseFileMatchCounts } from '../../server/utils/file-match-api'

describe('file match report boundary', () => {
  it('accepts exactly three bounded integer counts', () => {
    expect(parseFileMatchCounts({ matchedCount: 10000, missingCount: 0, ambiguousCount: 1 })).toEqual({ matchedCount: 10000, missingCount: 0, ambiguousCount: 1 })
  })
  it.each([
    null, [], { matchedCount: 1, missingCount: 0 },
    { matchedCount: 1, missingCount: 0, ambiguousCount: 0, filename: 'private.JPG' },
    { matchedCount: '1', missingCount: 0, ambiguousCount: 0 },
    { matchedCount: -1, missingCount: 0, ambiguousCount: 0 },
    { matchedCount: 1.5, missingCount: 0, ambiguousCount: 0 },
    { matchedCount: 10001, missingCount: 0, ambiguousCount: 0 },
  ])('rejects invalid or extra data', input => {
    expect(() => parseFileMatchCounts(input)).toThrowError(expect.objectContaining({ statusCode: 400 }))
  })
})
