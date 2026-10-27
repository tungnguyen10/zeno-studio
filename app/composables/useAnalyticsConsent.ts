import { readConsent, writeConsent, type AnalyticsConsentChoice } from '../lib/analytics-consent'

export function useAnalyticsConsent() {
  const choice = useState<AnalyticsConsentChoice>('analytics:choice', () => 'unknown')
  const ready = useState('analytics:ready', () => false)
  const settingsOpen = useState('analytics:settings-open', () => false)

  function storage(): Storage | null {
    try { return window.localStorage } catch { return null }
  }

  function syncServerConsent(next: AnalyticsConsentChoice): void {
    if (!import.meta.client) return
    document.cookie = next === 'accepted'
      ? `zeno_analytics_consent=accepted; Path=/api/album; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
      : 'zeno_analytics_consent=; Path=/api/album; Max-Age=0; SameSite=Lax'
  }

  function initialize(): void {
    if (!import.meta.client || ready.value) return
    choice.value = readConsent(storage())
    syncServerConsent(choice.value)
    ready.value = true
  }

  function decide(next: Exclude<AnalyticsConsentChoice, 'unknown'>): void {
    choice.value = next
    settingsOpen.value = false
    writeConsent(storage(), next)
    syncServerConsent(next)
  }

  function openSettings(): void { settingsOpen.value = true }
  function closeSettings(): void { settingsOpen.value = false }

  return { choice, ready, settingsOpen, initialize, decide, openSettings, closeSettings }
}
