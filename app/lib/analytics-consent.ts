export type AnalyticsConsentChoice = 'unknown' | 'accepted' | 'rejected'
export const CONSENT_KEY = 'zeno-analytics-consent-v1'
export type ConsentStorage = Pick<Storage, 'getItem' | 'setItem'>

export function readConsent(storage: ConsentStorage | null): AnalyticsConsentChoice {
  try {
    const value = storage?.getItem(CONSENT_KEY)
    return value === 'accepted' || value === 'rejected' ? value : 'unknown'
  } catch {
    return 'unknown'
  }
}

export function writeConsent(storage: ConsentStorage | null, choice: Exclude<AnalyticsConsentChoice, 'unknown'>): boolean {
  try {
    storage?.setItem(CONSENT_KEY, choice)
    return storage !== null
  } catch {
    return false
  }
}

// Nuxt runtime overrides may parse the environment string "true" as a boolean.
export function isAnalyticsEnabled(flag: unknown, measurementId: unknown): boolean {
  return (flag === true || flag === 'true')
    && typeof measurementId === 'string' && /^G-[A-Z0-9]+$/.test(measurementId)
}
