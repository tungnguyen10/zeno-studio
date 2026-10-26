import { ref } from 'vue'

export type DownloadMode = 'selected' | 'basket' | 'all'
export type ClientDownloadPart = { index: number; format: 'file' | 'zip'; filename: string; count: number;
  byteLength: number; photoIds: string[]; ticket: string; fileTickets: Array<{ photoId: string; ticket: string }> }
export type ClientDownloadPlan = { kind: DownloadMode; cycle: number; totalFiles: number; totalBytes: number;
  parts: ClientDownloadPart[]; unavailable: Array<{ photoId: string; reason: string }> }

export function useAlbumDownload(apiRoot: string) {
  const basket = ref<Set<string>>(new Set())
  const mode = ref<DownloadMode>('selected')
  const sheetOpen = ref(false)
  const plan = ref<ClientDownloadPlan | null>(null)
  const busy = ref(false)
  const error = ref('')

  function toggleBasket(photoId: string) {
    const next = new Set(basket.value)
    if (next.has(photoId)) next.delete(photoId)
    else next.add(photoId)
    basket.value = next
    plan.value = null
  }
  function clearBasket() { basket.value = new Set(); plan.value = null }
  function setMode(next: DownloadMode) { mode.value = next; plan.value = null; error.value = '' }
  function openSheet() { sheetOpen.value = true; error.value = '' }
  function closeSheet() { sheetOpen.value = false }

  async function prepare(beforeSelected?: () => Promise<void>) {
    if (busy.value || (mode.value === 'basket' && !basket.value.size)) return
    busy.value = true
    error.value = ''
    plan.value = null
    try {
      if (mode.value === 'selected') await beforeSelected?.()
      plan.value = await $fetch<ClientDownloadPlan>(`${apiRoot}/download/plan`, {
        method: 'POST', body: mode.value === 'basket'
          ? { kind: 'basket', photoIds: [...basket.value] }
          : { kind: mode.value },
      })
    } catch (cause) {
      if ((cause as { statusCode?: number } | null)?.statusCode === 403) clearBasket()
      error.value = cause instanceof Error ? cause.message : 'Không lập được kế hoạch tải ảnh'
    } finally { busy.value = false }
  }
  return { basket, mode, sheetOpen, plan, busy, error, toggleBasket, clearBasket, setMode, openSheet, closeSheet, prepare }
}
