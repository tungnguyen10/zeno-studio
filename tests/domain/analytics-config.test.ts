import { describe, expect, it } from 'vitest'
import { isAnalyticsEnabled } from '../../app/lib/analytics-config'

describe('analytics runtime enable gate', () => {
  it.each([true, 'true'])('accepts only explicit true (%j) with a valid ID', (flag) => {
    expect(isAnalyticsEnabled(flag, 'G-2GD5P03B7S')).toBe(true)
  })

  it.each([false, 'false', '', 'TRUE', 1, '1', null, undefined])('rejects %j even with a valid ID', (flag) => {
    expect(isAnalyticsEnabled(flag, 'G-2GD5P03B7S')).toBe(false)
  })

  it.each(['', 'G-', 'G-invalid', 'G-ABC?token=private', 'G-ABC\n', null, 123])('rejects invalid measurement ID %j', (id) => {
    expect(isAnalyticsEnabled(true, id)).toBe(false)
  })
})
