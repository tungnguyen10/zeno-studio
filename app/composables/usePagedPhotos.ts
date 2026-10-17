import { computed, ref, shallowRef, triggerRef } from 'vue'

export type PhotoFilter = 'all' | 'selected' | 'previous'
export interface PhotoPageResponse<T> { items: T[]; nextCursor: string | null; total: number; selectedCount: number }
export type PhotoPageFetcher<T> = (params: { cursor?: string; filter: PhotoFilter; limit: number }) => Promise<PhotoPageResponse<T>>

export function usePagedPhotos<T extends { id: string }>(fetchPage: PhotoPageFetcher<T>, pageSize = 120) {
  const items = shallowRef<T[]>([])
  const ids = new Set<string>()
  const filter = ref<PhotoFilter>('all')
  const nextCursor = ref<string | null>(null)
  const started = ref(false)
  const loading = ref(false)
  const error = ref('')
  const total = ref(0)
  const selectedCount = ref(0)
  let generation = 0

  const hasMore = computed(() => !started.value || nextCursor.value !== null)

  async function loadMore(): Promise<void> {
    if (loading.value || (started.value && !nextCursor.value)) return
    const run = generation
    loading.value = true
    error.value = ''
    try {
      const page = await fetchPage({ cursor: nextCursor.value ?? undefined, filter: filter.value, limit: pageSize })
      if (run !== generation) return
      const fresh = page.items.filter(item => !ids.has(item.id))
      for (const item of fresh) ids.add(item.id)
      items.value = items.value.concat(fresh)
      nextCursor.value = page.nextCursor
      total.value = page.total
      selectedCount.value = page.selectedCount
      started.value = true
    } catch (cause) {
      if (run === generation) error.value = cause instanceof Error ? cause.message : 'Không tải được ảnh'
    } finally {
      if (run === generation) loading.value = false
    }
  }

  // A new generation makes any in-flight page from the previous filter land nowhere.
  function reset(nextFilter: PhotoFilter = filter.value): Promise<void> {
    generation++
    filter.value = nextFilter
    items.value = []
    ids.clear()
    nextCursor.value = null
    started.value = false
    loading.value = false
    error.value = ''
    return loadMore()
  }

  function update(id: string, change: (item: T) => T): void {
    const index = items.value.findIndex(item => item.id === id)
    if (index < 0) return
    items.value[index] = change(items.value[index]!)
    triggerRef(items)
  }

  return { items, filter, total, selectedCount, loading, error, started, hasMore, loadMore, reset, update }
}
