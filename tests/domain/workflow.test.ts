import { describe, expect, it } from 'vitest'
import { canTransitionProduction, canPerform } from '../../shared/domain/workflow'

describe('production workflow', () => {
  it('allows a revision round but never skips directly to delivery', () => {
    expect(canTransitionProduction('WAITING_REVIEW', 'REVISION_REQUESTED')).toBe(true)
    expect(canTransitionProduction('REVISION_REQUESTED', 'RETOUCHING')).toBe(true)
    expect(canTransitionProduction('PENDING', 'DELIVERED')).toBe(false)
  })
})

describe('role permissions', () => {
  it('restricts sensitive settings and finalization', () => {
    expect(canPerform('owner', 'album.settings')).toBe(true)
    expect(canPerform('retoucher', 'album.settings')).toBe(false)
    expect(canPerform('participant', 'selection.finalize')).toBe(false)
    expect(canPerform('finalizer', 'selection.finalize')).toBe(true)
  })
})
