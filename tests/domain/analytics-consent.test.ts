import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { CONSENT_KEY, isAnalyticsEnabled, readConsent, writeConsent } from '../../app/lib/analytics-consent'
import { useAnalyticsConsent } from '../../app/composables/useAnalyticsConsent'

function memoryStorage() {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) },
  }
}

describe('analytics consent persistence', () => {
  it.each(['accepted', 'rejected'] as const)('round trips an explicit %s decision', (choice) => {
    const storage = memoryStorage()
    expect(readConsent(storage)).toBe('unknown')
    expect(writeConsent(storage, choice)).toBe(true)
    expect(storage.data.get(CONSENT_KEY)).toBe(choice)
    expect(readConsent(storage)).toBe(choice)
  })

  it.each(['garbage', 'true', '', 'ACCEPTED', 'unknown'])('treats %j as unknown', (stored) => {
    const storage = memoryStorage()
    storage.data.set(CONSENT_KEY, stored)
    expect(readConsent(storage)).toBe('unknown')
  })

  it('handles unavailable storage', () => {
    expect(readConsent(null)).toBe('unknown')
    expect(writeConsent(null, 'rejected')).toBe(false)
  })

  it('handles read and write exceptions', () => {
    const storage = {
      getItem: () => { throw new Error('Storage blocked') },
      setItem: () => { throw new Error('Storage full') },
    }
    expect(readConsent(storage)).toBe('unknown')
    expect(writeConsent(storage, 'accepted')).toBe(false)
  })
})

describe('shared analytics consent actions', () => {
  beforeEach(() => {
    const state = new Map<string, ReturnType<typeof ref>>()
    vi.stubGlobal('useState', (key: string, init: () => unknown) => {
      if (!state.has(key)) state.set(key, ref(init()))
      return state.get(key)
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('keeps decisions usable in memory when accessing localStorage throws', () => {
    vi.stubGlobal('window', { get localStorage() { throw new Error('Storage blocked') } })
    const consent = useAnalyticsConsent()
    consent.openSettings()
    consent.decide('accepted')
    expect(consent.choice.value).toBe('accepted')
    expect(consent.settingsOpen.value).toBe(false)
    expect(useAnalyticsConsent().choice.value).toBe('accepted')
    consent.decide('rejected')
    expect(consent.choice.value).toBe('rejected')
  })

  it('persists a decision and reopens/dismisses settings without changing it', () => {
    const storage = memoryStorage()
    vi.stubGlobal('window', { localStorage: storage })
    const consent = useAnalyticsConsent()
    expect(consent.choice.value).toBe('unknown')
    expect(consent.ready.value).toBe(false)
    consent.decide('accepted')
    expect(readConsent(storage)).toBe('accepted')
    consent.openSettings()
    expect(consent.settingsOpen.value).toBe(true)
    expect(consent.choice.value).toBe('accepted')
    consent.closeSettings()
    expect(consent.settingsOpen.value).toBe(false)
    expect(consent.choice.value).toBe('accepted')
    expect(readConsent(storage)).toBe('accepted')
  })

  it('keeps the decision when setItem throws', () => {
    vi.stubGlobal('window', { localStorage: { setItem() { throw new Error('Full') } } })
    const consent = useAnalyticsConsent()
    expect(() => consent.decide('rejected')).not.toThrow()
    expect(consent.choice.value).toBe('rejected')
  })
})


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
