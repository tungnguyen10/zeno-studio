import { describe, expect, it } from 'vitest'
import { canFinalizeSelection, canSelectAnother } from '../../shared/domain/selection'

describe('selection limits', () => {
  it('requires an exact count before finalizing and prevents selecting beyond it', () => {
    const limit = { kind: 'exact' as const, count: 3 }
    expect(canFinalizeSelection(limit, 2)).toBe(false)
    expect(canFinalizeSelection(limit, 3)).toBe(true)
    expect(canSelectAnother(limit, 3)).toBe(false)
  })
})
