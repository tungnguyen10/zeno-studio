import { describe, expect, it } from 'vitest'
import { evaluateDownload, type DownloadSettings } from '../../shared/domain/download-policy'

const enabled: DownloadSettings = {
  enabled: true,
  allowSingle: true,
  allowSelected: true,
  allowAll: false,
  availableWhen: 'anytime',
}

describe('album download policy', () => {
  it('keeps every operation disabled until the album setting is enabled', () => {
    expect(evaluateDownload({ ...enabled, enabled: false }, 'PUBLISHED', false, 3)).toEqual({
      canSingle: false, canSelected: false, canAll: false,
      reason: 'disabled', selectedSource: null, selectedCount: 0,
    })
  })

  it('gates single, selected and all independently', () => {
    expect(evaluateDownload({ ...enabled, allowSingle: false, allowSelected: true, allowAll: true }, 'PUBLISHED', false, 2))
      .toMatchObject({ canSingle: false, canSelected: true, canAll: true, selectedSource: 'live', selectedCount: 2 })
    expect(evaluateDownload({ ...enabled, allowSelected: false }, 'PUBLISHED', false, 2))
      .toMatchObject({ canSingle: true, canSelected: false, canAll: false })
  })

  it('waits for the current cycle instead of an older snapshot', () => {
    expect(evaluateDownload({ ...enabled, availableWhen: 'after_finalize' }, 'PUBLISHED', true, 2))
      .toMatchObject({ canSingle: false, canSelected: false, reason: 'waiting_for_finalize', selectedSource: null })
    expect(evaluateDownload({ ...enabled, availableWhen: 'after_finalize' }, 'FINALIZED', true, 1))
      .toMatchObject({ canSingle: true, canSelected: true, reason: null, selectedSource: 'snapshot', selectedCount: 1 })
  })

  it('denies expired and draft albums', () => {
    for (const status of ['DRAFT', 'EXPIRED'] as const) {
      expect(evaluateDownload(enabled, status, false, 2)).toMatchObject({ canSingle: false, canSelected: false, canAll: false })
    }
  })
})
