// Memory remains usable when sessionStorage is blocked or full. No capability tokens.
const claimed = new Set<string>()
const prefix = 'zeno:analytics:v2:'

export function claimSessionEvent(key: string, storage?: Storage): boolean {
  if (claimed.has(key)) return false
  try {
    if (storage?.getItem(`${prefix}${key}`) === '1') {
      claimed.add(key)
      return false
    }
    storage?.setItem(`${prefix}${key}`, '1')
  } catch { /* Privacy settings must not break the business action. */ }
  claimed.add(key)
  return true
}

export function releaseSessionEvent(key: string, storage?: Storage): void {
  claimed.delete(key)
  try { storage?.removeItem(`${prefix}${key}`) } catch { /* Memory fallback remains valid. */ }
}
