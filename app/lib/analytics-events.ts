import type { AnalyticsEvent } from './analytics-model'

let sender: ((event: AnalyticsEvent) => void) | null = null

export function registerAnalyticsSender(next: typeof sender): void {
  sender = next
}

export function trackAnalyticsEvent(event: AnalyticsEvent): void {
  sender?.(event)
}
