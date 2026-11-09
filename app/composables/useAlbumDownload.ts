import { computed, onBeforeUnmount, ref } from 'vue'

export type DownloadMode = 'selected' | 'basket' | 'all'
export type ClientDownloadPart = { index: number; format: 'file' | 'zip'; filename: string; count: number;
  byteLength: number; photoIds: string[]; ticket: string; fileTickets: Array<{ photoId: string; ticket: string }> }
export type ClientDownloadPlan = { kind: DownloadMode; cycle: number; totalFiles: number; totalBytes: number;
  parts: ClientDownloadPart[]; unavailable: Array<{ photoId: string; reason: string }> }

const maxShareBytes = 48 * 1024 * 1024
const prefetchDelayMs = 300
class TooLargeError extends Error {}
type SaveHandle = { createWritable(): Promise<{ write(data: Uint8Array): Promise<void>; close(): Promise<void>; abort(): Promise<void> }> }

function responseFilename(response: Response): string {
  const header = response.headers.get('content-disposition') ?? ''
  const extended = header.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  if (extended) {
    try { return decodeURIComponent(extended).split(/[/\\]/).at(-1) || 'image' } catch { /* fallback below */ }
  }
  return header.match(/filename="([^"]+)"/)?.[1]?.split(/[/\\]/).at(-1) || 'image'
}

export function useAlbumDownload(apiRoot: string, onForbidden?: () => void | Promise<void>) {
  const basket = ref<Set<string>>(new Set())
  const mode = ref<DownloadMode>('selected')
  const sheetOpen = ref(false)
  const plan = ref<ClientDownloadPlan | null>(null)
  const busy = ref(false)
  const error = ref('')
  const preparedFiles = ref<File[]>([])
  const shareReady = ref(false)
  const shareStatus = ref('')
  const transferBusy = ref(false)
  const transferPart = ref<number | null>(null)
  const transferBytes = ref(0)
  const completedParts = ref<Set<number>>(new Set())
  const failedParts = ref<Record<number, string>>({})
  const transferMessage = ref('')
  let activeController: AbortController | null = null
  const objectUrls = new Set<string>()
  const shareEligible = computed(() => !!plan.value && plan.value.totalFiles > 0 &&
    plan.value.totalBytes <= maxShareBytes &&
    plan.value.parts.reduce((sum, part) => sum + part.fileTickets.length, 0) === plan.value.totalFiles)

  function clearPrepared() { preparedFiles.value = []; shareReady.value = false; shareStatus.value = '' }
  function invalidateRights() {
    clearBasket()
    clearPrepared()
    error.value = 'Quyền tải đã thay đổi. Vui lòng mở lại album để kiểm tra.'
    transferMessage.value = error.value
    void onForbidden?.()
  }
  function assertResponse(response: Response) {
    if (response.status === 403) { invalidateRights(); throw new Error('Quyền tải đã thay đổi') }
    if (!response.ok) throw new Error(response.status === 429 ? 'Đã đạt giới hạn tải. Vui lòng thử lại sau.' : 'Không tải được ảnh gốc từ Drive')
  }
  async function boundedFile(response: Response, signal: AbortSignal, remainingBytes: number): Promise<File> {
    assertResponse(response)
    const length = Number(response.headers.get('content-length'))
    if (Number.isFinite(length) && length > remainingBytes) throw new TooLargeError('Ảnh vượt giới hạn chia sẻ trên thiết bị')
    if (!response.body) throw new Error('Drive không trả về ảnh gốc')
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let count = 0
    try {
      while (true) {
        const item = await reader.read()
        if (item.done) break
        count += item.value.byteLength
        if (count > remainingBytes) { await reader.cancel(); throw new TooLargeError('Ảnh vượt giới hạn chia sẻ trên thiết bị') }
        chunks.push(item.value)
      }
    } finally { reader.releaseLock() }
    if (signal.aborted) throw new Error('Đã dừng chuẩn bị ảnh')
    return new File(chunks as BlobPart[], responseFilename(response), { type: response.headers.get('content-type') || 'application/octet-stream' })
  }

  function toggleBasket(photoId: string) {
    const next = new Set(basket.value)
    if (next.has(photoId)) next.delete(photoId)
    else next.add(photoId)
    basket.value = next
    plan.value = null
    clearPrepared()
  }
  function clearBasket() { basket.value = new Set(); plan.value = null; clearPrepared() }
  function setMode(next: DownloadMode) { mode.value = next; plan.value = null; clearPrepared(); error.value = '' }
  function openSheet() { sheetOpen.value = true; error.value = '' }
  function closeSheet() { sheetOpen.value = false; clearPrepared() }

  async function prepare(beforeSelected?: () => Promise<void>) {
    if (busy.value || (mode.value === 'basket' && !basket.value.size)) return
    busy.value = true
    error.value = ''
    plan.value = null
    clearPrepared()
    completedParts.value = new Set()
    failedParts.value = {}
    try {
      if (mode.value === 'selected') await beforeSelected?.()
      plan.value = await $fetch<ClientDownloadPlan>(`${apiRoot}/download/plan`, {
        method: 'POST', body: mode.value === 'basket'
          ? { kind: 'basket', photoIds: [...basket.value] }
          : { kind: mode.value },
      })
    } catch (cause) {
      if ((cause as { statusCode?: number } | null)?.statusCode === 403) invalidateRights()
      error.value = cause instanceof Error ? cause.message : 'Không lập được kế hoạch tải ảnh'
    } finally { busy.value = false }
  }

  async function prepareFiles() {
    if (!shareEligible.value || transferBusy.value || !plan.value) return
    transferBusy.value = true
    transferMessage.value = ''
    clearPrepared()
    activeController = new AbortController()
    const files: File[] = []
    let remaining = maxShareBytes
    try {
      for (const part of plan.value.parts) for (const item of part.fileTickets) {
        const response = await fetch(`${apiRoot}/download/file`, { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ticket: item.ticket }), signal: activeController.signal })
        const file = await boundedFile(response, activeController.signal, remaining)
        remaining -= file.size
        files.push(file)
      }
      preparedFiles.value = files
      shareReady.value = !!navigator.canShare?.({ files })
      if (!shareReady.value) transferMessage.value = 'Trình duyệt này không hỗ trợ chia sẻ file. Hãy mở Safari/Chrome hoặc tải ZIP bên dưới.'
    } catch (cause) {
      clearPrepared()
      if (!activeController.signal.aborted) transferMessage.value = cause instanceof Error ? cause.message : 'Không chuẩn bị được ảnh gốc'
    } finally { activeController = null; transferBusy.value = false }
  }

  // iOS only reaches Photos via the share sheet or long-press on an image, and both must start from a direct tap.
  function isIOS(): boolean {
    return /iP(hone|od|ad)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  }
  function canShareFile(file: File): boolean {
    try { return !!navigator.share && !!navigator.canShare?.({ files: [file] }) }
    catch { return false }
  }

  const single = ref<{ photoId: string; status: 'loading' | 'ready' | 'error'; file?: File } | null>(null)
  const singleSaving = ref(false)
  const singleMessage = ref('')
  const sharePrompt = ref(false)
  const previewUrl = ref('')
  let singleController: AbortController | null = null
  let singleTask: Promise<File> | null = null
  let prefetchTimer: ReturnType<typeof setTimeout> | undefined

  function closePreview() {
    if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = ''
  }
  function cancelSingle() {
    clearTimeout(prefetchTimer)
    singleController?.abort()
    singleController = null
    singleTask = null
    single.value = null
    singleSaving.value = false
    sharePrompt.value = false
    closePreview()
  }
  function loadSingle(photoId: string): Promise<File> {
    if (single.value?.photoId === photoId && single.value.status !== 'error' && singleTask) return singleTask
    cancelSingle()
    const controller = new AbortController()
    singleController = controller
    single.value = { photoId, status: 'loading' }
    const task = fetch(`${apiRoot}/photos/${photoId}/download`, { signal: controller.signal })
      .then(response => boundedFile(response, controller.signal, maxShareBytes))
    singleTask = task
    task.then(file => { if (singleTask === task) single.value = { photoId, status: 'ready', file } },
      () => { if (singleTask === task) single.value = { photoId, status: 'error' } })
    return task
  }
  function focusSingle(photoId: string | null, allowed: boolean) {
    clearTimeout(prefetchTimer)
    singleMessage.value = ''
    if (single.value && single.value.photoId !== photoId) cancelSingle()
    if (photoId && allowed && isIOS()) {
      prefetchTimer = setTimeout(() => { loadSingle(photoId).catch(() => {}) }, prefetchDelayMs)
    }
  }
  function showPreview(file: File) {
    closePreview()
    previewUrl.value = URL.createObjectURL(file)
  }
  // Must run synchronously inside a tap handler, otherwise iOS rejects the share sheet.
  function shareSingle(file: File) {
    sharePrompt.value = false
    navigator.share({ files: [file] }).catch(cause => {
      if (cause instanceof DOMException && cause.name === 'AbortError') return
      if (cause instanceof DOMException && cause.name === 'NotAllowedError') { sharePrompt.value = true; return }
      showPreview(file)
    })
  }
  function presentIOS(file: File, inTap: boolean) {
    if (!canShareFile(file)) { showPreview(file); return }
    if (inTap) shareSingle(file)
    else sharePrompt.value = true
  }
  function shareReadySingle() {
    const file = single.value?.status === 'ready' ? single.value.file : undefined
    if (file) shareSingle(file)
  }
  async function saveSingle(photoId: string) {
    if (singleSaving.value) return
    singleMessage.value = ''
    const ready = single.value?.photoId === photoId && single.value.status === 'ready' ? single.value.file : undefined
    if (ready && isIOS()) { presentIOS(ready, true); return }
    singleSaving.value = true
    let file: File
    try { file = ready ?? await loadSingle(photoId) }
    catch (cause) {
      if (single.value?.photoId !== photoId) return
      if (cause instanceof TooLargeError) {
        singleMessage.value = 'Ảnh quá lớn để lưu trực tiếp vào Ảnh; trình duyệt sẽ tải file gốc.'
        window.location.assign(`${apiRoot}/photos/${photoId}/download`)
        return
      }
      singleMessage.value = cause instanceof Error ? cause.message : 'Không tải được ảnh gốc'
      return
    } finally { singleSaving.value = false }
    if (single.value?.photoId !== photoId) return
    if (isIOS()) presentIOS(file, false)
    else saveBlob(file, file.name)
  }

  function saveBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    objectUrls.add(url)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.append(link)
    link.click()
    link.remove()
    setTimeout(() => { URL.revokeObjectURL(url); objectUrls.delete(url) }, 1000)
  }

  function sharePrepared(): boolean {
    const files = preparedFiles.value
    if (!files.length || !navigator.canShare?.({ files }) || !navigator.share) {
      transferMessage.value = 'Không mở được bảng chia sẻ. Hãy tải file gốc hoặc ZIP.'
      return false
    }
    try {
      void navigator.share({ files }).then(() => { shareStatus.value = 'Đã mở bảng lưu/chia sẻ; hãy chọn nơi lưu trên thiết bị.' })
        .catch(cause => {
          if (cause instanceof DOMException && cause.name === 'AbortError') return
          transferMessage.value = 'Không mở được bảng chia sẻ. Hãy tải file gốc hoặc ZIP.'
        })
      return true
    } catch { transferMessage.value = 'Không mở được bảng chia sẻ. Hãy tải file gốc hoặc ZIP.'; return false }
  }

  function submitDirectFile(ticket: string) {
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = `${apiRoot}/download/file`
    form.style.display = 'none'
    const input = document.createElement('input')
    input.name = 'ticket'
    input.value = ticket
    form.append(input)
    document.body.append(form)
    form.submit()
    form.remove()
    transferMessage.value = 'Trình duyệt đang xử lý ảnh gốc. Nếu chưa thấy file, hãy thử lại phần này.'
  }

  async function downloadPart(index: number) {
    const part = plan.value?.parts.find(item => item.index === index)
    if (!part || transferBusy.value) return
    if (part.format === 'file') { submitDirectFile(part.ticket); return }
    let handle: SaveHandle | undefined
    const pickerWindow = window as Window & { showSaveFilePicker?: (options: { suggestedName: string }) => Promise<SaveHandle> }
    if (pickerWindow.showSaveFilePicker) {
      try { handle = await pickerWindow.showSaveFilePicker({ suggestedName: part.filename }) }
      catch (cause) { if (cause instanceof DOMException && cause.name === 'AbortError') return }
    }
    transferBusy.value = true
    transferPart.value = index
    transferBytes.value = 0
    transferMessage.value = ''
    activeController = new AbortController()
    let writable: Awaited<ReturnType<SaveHandle['createWritable']>> | undefined
    try {
      const response = await fetch(`${apiRoot}/download/zip`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ticket: part.ticket }), signal: activeController.signal })
      assertResponse(response)
      if (!response.body) throw new Error('Drive không trả về phần ZIP')
      writable = await handle?.createWritable()
      const chunks: Uint8Array[] = []
      const reader = response.body.getReader()
      try {
        while (true) {
          const item = await reader.read()
          if (item.done) break
          transferBytes.value += item.value.byteLength
          if (!writable && transferBytes.value > 104 * 1024 * 1024) { await reader.cancel(); throw new Error('Phần ZIP vượt giới hạn bộ nhớ') }
          if (writable) await writable.write(item.value)
          else chunks.push(item.value)
        }
      } finally { reader.releaseLock() }
      if (writable) { await writable.close(); writable = undefined }
      else saveBlob(new Blob(chunks as BlobPart[], { type: 'application/zip' }), part.filename)
      completedParts.value = new Set([...completedParts.value, index])
      const nextErrors = { ...failedParts.value }
      delete nextErrors[index]
      failedParts.value = nextErrors
      transferMessage.value = `Đã chuyển ${completedParts.value.size}/${plan.value?.parts.length ?? 0} phần`
    } catch (cause) {
      await writable?.abort().catch(() => {})
      if (activeController.signal.aborted) transferMessage.value = 'Đã dừng tải. Giỏ ảnh vẫn được giữ.'
      else {
        const message = cause instanceof Error ? cause.message : 'Tải phần ZIP thất bại'
        failedParts.value = { ...failedParts.value, [index]: message }
        transferMessage.value = `Phần ${index + 1} lỗi: ${message}`
      }
    } finally { activeController = null; transferBusy.value = false; transferPart.value = null }
  }

  function cancelTransfer() { activeController?.abort(); transferMessage.value = 'Đã dừng tải. Giỏ ảnh vẫn được giữ.' }
  onBeforeUnmount(() => { activeController?.abort(); cancelSingle(); for (const url of objectUrls) URL.revokeObjectURL(url); objectUrls.clear() })
  return { basket, mode, sheetOpen, plan, busy, error, toggleBasket, clearBasket, setMode, openSheet, closeSheet, prepare,
    preparedFiles, shareReady, shareStatus, shareEligible, transferBusy, transferPart, transferBytes,
    completedParts, failedParts, transferMessage, prepareFiles, sharePrepared, downloadPart, cancelTransfer,
    singleSaving, singleMessage, sharePrompt, previewUrl, focusSingle, saveSingle, shareReadySingle, closePreview,
    singleStatus: computed(() => single.value?.status ?? null) }
}
