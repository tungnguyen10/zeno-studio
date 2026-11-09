import { onBeforeUnmount, ref } from 'vue'

type PlanTicket = { photoId: string; ticket: string; sizeBytes: number }
type PlanResponse = { cycle: number; parts: Array<{ fileTickets: PlanTicket[] }> }

const budgetBytes = 500 * 1024 * 1024
const minFreeBytes = 200 * 1024 * 1024
const debounceMs = 3000
const ticketMaxAgeMs = 8 * 60 * 1000
const pauseBetweenMs = 400
const retryAfterMs = 60_000

// Prefetches the customer's selected originals into Cache Storage (disk, not RAM), one file at a time.
export function useOriginalCache(apiRoot: string) {
  const cachedIds = ref<Set<string>>(new Set())
  const supported = import.meta.client && typeof caches !== 'undefined'
  const cacheName = `zeno-originals-v1:${apiRoot}`
  const keyFor = (photoId: string) => `${location.origin}/__zeno-original${apiRoot}/${photoId}`
  let enabled = false
  let lastKey = ''
  let beforePlan: (() => Promise<unknown>) | undefined
  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  let controller: AbortController | null = null
  let disposed = false

  function saveData(): boolean {
    return !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData
  }
  function wait(ms: number, signal: AbortSignal) {
    return new Promise<void>(resolve => {
      const timer = setTimeout(resolve, ms)
      signal.addEventListener('abort', () => { clearTimeout(timer); resolve() }, { once: true })
    })
  }
  function whenVisible(signal: AbortSignal) {
    if (document.visibilityState === 'visible') return Promise.resolve()
    return new Promise<void>(resolve => {
      const done = () => { document.removeEventListener('visibilitychange', onChange); resolve() }
      const onChange = () => { if (document.visibilityState === 'visible') done() }
      document.addEventListener('visibilitychange', onChange)
      signal.addEventListener('abort', done, { once: true })
    })
  }
  async function hasRoom(): Promise<boolean> {
    try {
      const estimate = await navigator.storage?.estimate?.()
      if (!estimate?.quota || estimate.usage === undefined) return true
      return estimate.quota - estimate.usage > minFreeBytes
    } catch { return true }
  }

  async function syncCachedIds(cache: Cache, keep: Set<string>) {
    const present = new Set<string>()
    for (const request of await cache.keys()) {
      const photoId = request.url.split('/').at(-1) ?? ''
      if (keep.has(photoId)) present.add(photoId)
      else await cache.delete(request)
    }
    cachedIds.value = present
  }

  async function run(signal: AbortSignal) {
    const cache = await caches.open(cacheName)
    while (!signal.aborted) {
      await beforePlan?.()
      if (signal.aborted) return
      let plan: PlanResponse
      try { plan = await $fetch<PlanResponse>(`${apiRoot}/download/plan`, { method: 'POST', body: { kind: 'selected' }, signal }) }
      catch { return }
      const tickets = plan.parts.flatMap(part => part.fileTickets)
      await syncCachedIds(cache, new Set(tickets.map(item => item.photoId)))
      const plannedAt = Date.now()
      let usedBytes = tickets.filter(item => cachedIds.value.has(item.photoId)).reduce((sum, item) => sum + item.sizeBytes, 0)
      const queue = tickets.filter(item => !cachedIds.value.has(item.photoId))
      if (!queue.length) return
      for (const item of queue) {
        if (signal.aborted) return
        if (Date.now() - plannedAt > ticketMaxAgeMs) break
        if (usedBytes + item.sizeBytes > budgetBytes || !await hasRoom()) return
        await whenVisible(signal)
        if (signal.aborted) return
        let response: Response
        try {
          response = await fetch(`${apiRoot}/download/file`, { method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ticket: item.ticket }), signal })
        } catch { return }
        if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) {
          if (response.status === 429 || response.status >= 500) { await wait(retryAfterMs, signal); break }
          return
        }
        try { await cache.put(keyFor(item.photoId), response) }
        catch { return }
        usedBytes += item.sizeBytes
        cachedIds.value = new Set([...cachedIds.value, item.photoId])
        await wait(pauseBetweenMs, signal)
      }
    }
  }

  function restart() {
    controller?.abort()
    controller = null
    if (!supported || !enabled || disposed || saveData()) return
    const current = new AbortController()
    controller = current
    void run(current.signal).catch(() => {}).finally(() => { if (controller === current) controller = null })
  }

  /** Call whenever the selection or download rights may have changed; `key` identifies the selection. */
  function schedule(options: { allowed: boolean; key: string; beforePlan?: () => Promise<unknown> }) {
    beforePlan = options.beforePlan
    if (options.key === lastKey && options.allowed === enabled) return
    lastKey = options.key
    clearTimeout(debounceTimer)
    if (!options.allowed) {
      enabled = false
      controller?.abort()
      if (supported) void caches.delete(cacheName).then(() => { cachedIds.value = new Set() })
      return
    }
    enabled = true
    debounceTimer = setTimeout(restart, debounceMs)
  }

  async function getFile(photoId: string): Promise<File | null> {
    if (!supported || !cachedIds.value.has(photoId)) return null
    try {
      const response = await (await caches.open(cacheName)).match(keyFor(photoId))
      if (!response) return null
      const disposition = response.headers.get('content-disposition') ?? ''
      const extended = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
      let name = disposition.match(/filename="([^"]+)"/)?.[1] ?? 'image.jpg'
      if (extended) { try { name = decodeURIComponent(extended) } catch { /* keep ASCII fallback */ } }
      const blob = await response.blob()
      return new File([blob], name.split(/[/\\]/).at(-1) || 'image.jpg', { type: response.headers.get('content-type') || blob.type })
    } catch { return null }
  }

  onBeforeUnmount(() => { disposed = true; clearTimeout(debounceTimer); controller?.abort() })
  return { cachedIds, schedule, getFile }
}
