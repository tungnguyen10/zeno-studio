import { buildAnalyticsEvent } from './analytics-model'
import type { AnalyticsEvent, SafePage } from './analytics-model'
import { claimSessionEvent, releaseSessionEvent } from './analytics-session'
import type { analyticsCommonContext } from './analytics-config'

let sender: ((event: AnalyticsEvent) => void) | null = null

/** The cleanup only removes its own registration, including across HMR. */
export function registerAnalyticsSender(next: typeof sender): () => void {
  sender = next
  return () => { if (sender === next) sender = null }
}

export function trackAnalyticsEvent(event: AnalyticsEvent): void {
  try { sender?.(event) } catch { /* Analytics must never change a business result. */ }
}

export function newAnalyticsAttemptId(): string | undefined {
  try { return globalThis.crypto?.randomUUID() } catch { return undefined }
}

type Deliver = (name: string, params: Record<string, string | number>) => void
type DispatcherOptions = {
  enabled: boolean
  common: ReturnType<typeof analyticsCommonContext>
  getPage: () => SafePage & { referrer?: string }
  storage?: Storage
  diagnostic?: (code: 'analytics_invalid' | 'analytics_queue_full' | 'analytics_unavailable') => void
}

/** Validated in-memory startup queue. Admission, not network delivery, commits dedup. */
export function createAnalyticsDispatcher(options: DispatcherOptions) {
  let pending: Array<{ name: string; params: Record<string, string | number> }> = []
  let deliver: Deliver | undefined
  let disposed = false
  const diagnostic = (code: Parameters<NonNullable<DispatcherOptions['diagnostic']>>[0]) => {
    try { options.diagnostic?.(code) } catch { /* Never forward arbitrary exceptions. */ }
  }
  function forward(item: typeof pending[number]) {
    try { deliver?.(item.name, item.params) } catch { diagnostic('analytics_unavailable') }
  }
  return {
    send(event: AnalyticsEvent): void {
      if (!options.enabled || disposed) return
      let claim: string | undefined
      try {
        const built = buildAnalyticsEvent(event)
        if (!built) { diagnostic('analytics_invalid'); return }
        if (!deliver && pending.length >= 50) { diagnostic('analytics_queue_full'); return }
        const page = options.getPage()
        // Common deployment and safe route fields always win over input.
        const item = { name: built.name, params: {
          ...built.params, ...options.common,
          page_location: page.location, page_title: page.title,
          ...(page.referrer ? { page_referrer: page.referrer } : {}),
        } }
        const key = typeof built.params.event_id === 'string' ? built.params.event_id
          : built.name === 'guest_selection_started' && built.params.album_id && built.params.cycle
            ? `started:${built.params.album_id}:${built.params.cycle}` : undefined
        if (key) {
          if (!claimSessionEvent(key, options.storage)) return
          claim = key
        }
        // Put the item in the queue before calling any transport. Transport failure
        // cannot escape, and does not permit duplicate result events.
        pending.push(item)
        claim = undefined
        if (deliver) {
          const next = pending.shift()
          if (next) forward(next)
        }
      } catch {
        if (claim) releaseSessionEvent(claim, options.storage)
        diagnostic('analytics_unavailable')
      }
    },
    start(next: Deliver): void {
      if (disposed || deliver || !options.enabled) return
      deliver = next
      const buffered = pending
      pending = []
      for (const item of buffered) forward(item)
    },
    dispose(): void { disposed = true; pending = []; deliver = undefined },
  }
}
