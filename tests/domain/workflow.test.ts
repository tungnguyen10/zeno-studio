import { describe, expect, it } from 'vitest'
import { canPerform } from '../../shared/domain/workflow'

describe('role permissions', () => {
  it('restricts sensitive settings and finalization', () => {
    expect(canPerform('owner', 'album.settings')).toBe(true)
    expect(canPerform('retoucher', 'album.settings')).toBe(false)
    expect(canPerform('retoucher', 'album.view')).toBe(true)
    expect(canPerform('participant', 'selection.finalize')).toBe(false)
    expect(canPerform('finalizer', 'selection.finalize')).toBe(true)
  })
})
