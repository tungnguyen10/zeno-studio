<script setup lang="ts">
import { trackAnalyticsEvent } from '~/lib/analytics-events'
import { reportGalleryOpen } from '~/lib/studio-analytics'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { DownloadCapabilities } from '~~/shared/domain/download-policy'
import { driveFitSrcset, driveFocusSrc, driveFocusSrcset, driveGridSrc, driveGridSrcset, driveThumbnailUrl, focusWidthCap } from '~/lib/drive-image'
import type { GalleryLayout } from '~/lib/gallery-layout'
import { usePagedPhotos, type PhotoFilter, type PhotoPageResponse } from '~/composables/usePagedPhotos'
import { useGalleryLayout } from '~/composables/useGalleryLayout'
import GalleryLayoutSwitch from '~/components/album/GalleryLayoutSwitch.vue'
import PhotoGallery from '~/components/album/PhotoGallery.vue'
import PhotoTile from '~/components/album/PhotoTile.vue'
import SelectionIsland from '~/components/album/SelectionIsland.vue'
import DownloadSheet from '~/components/album/DownloadSheet.vue'
import { useAlbumDownload } from '~/composables/useAlbumDownload'

type Photo = { id: string; sourceFileId: string; filename: string; width: number | null; height: number | null; status: 'READY' | 'MISSING' | 'BROKEN'; sortOrder: number; selected: boolean }
type Overview = { id: string; title: string; status: string; currentCycle: number; expiresAt: string; joined: boolean; canJoin: boolean; settings: { limitKind: string; limitMin: number | null; limitMax: number | null }; download?: DownloadCapabilities }
type SaveResult = { status: 'saved' | 'conflict' | 'limit_reached'; version: number; selected: boolean; count: number }
const route = useRoute()
const analyticsConfig = useRuntimeConfig().public
const galleryReady = ref(false)
let reportedOpen = false
const albumId = String(route.params.albumId)
const root = `/api/album/${albumId}`
const {
  basket: downloadBasket, mode: downloadMode, sheetOpen: downloadSheetOpen,
  plan: downloadPlan, busy: downloadBusy, error: downloadError,
  toggleBasket, clearBasket, setMode: setDownloadMode, openSheet: openDownloadSheet,
  closeSheet: closeDownloadSheet, prepare: prepareDownload,
  preparedSingleId, shareReady, shareStatus, shareEligible, transferBusy, transferPart, transferBytes,
  completedParts, failedParts, transferMessage, prepareFiles, prepareSingle, sharePrepared, downloadPart, cancelTransfer,
} = useAlbumDownload(root, () => refreshAlbumState())
const overview = ref<Overview | null>(null)
const selectedIds = ref<string[]>([])
const selectionVersion = ref(0)
const selectionLoaded = ref(false)
const focusPhoto = ref<Photo | null>(null)
const noteText = ref('')
const noteSavedText = ref('')
const noteVersion = ref(0)
const noteLoading = ref(false)
const noteLoadError = ref(false)
const layout = useGalleryLayout('zeno-gallery-layout')
const paged = usePagedPhotos<Photo>(params => $fetch<PhotoPageResponse<Photo>>(`${root}/photos`, { query: { limit: params.limit, filter: params.filter, ...(params.cursor ? { cursor: params.cursor } : {}) } }))
const filter = computed<PhotoFilter>({ get: () => paged.filter.value, set: value => { if (value !== paged.filter.value) void paged.reset(value) } })
const busy = ref(false)
const loading = ref(true)
const error = ref('')
const status = ref('')
const thumbnailState = ref<Record<string, 'proxy' | 'original' | 'failed'>>({})
const focusImageFailed = ref(false)
const focusStage = ref<'drive' | 'original'>('drive')
const focusLoaded = ref(false)
const focusWidthLimit = ref(2560)
const stageEl = ref<HTMLElement | null>(null)
const stageSize = ref({ width: 0, height: 0 })
const focusCloseButton = ref<HTMLButtonElement | null>(null)
let pollTimer: ReturnType<typeof setInterval> | undefined
let noteReadRequest = 0
let stageObserver: ResizeObserver | undefined
let returnFocus: HTMLElement | null = null
let navigating = false
let touchStart: { x: number; y: number } | null = null
let lastTap = 0
let lastTouchEnd = 0
let noteSaveTimer: ReturnType<typeof setTimeout> | undefined
let noteSaving: Promise<boolean> | null = null
let statusTimer: ReturnType<typeof setTimeout> | undefined
let selectionQueue: Promise<void> = Promise.resolve()
const pendingSelections = ref(0)
const heartPop = ref(false)
const preloaded = new Map<string, HTMLImageElement>()
let navigationDirection: 1 | -1 = 1

useSeoMeta({ title: () => overview.value ? `${overview.value.title} — Zeno Studio` : 'Album — Zeno Studio' })
const visiblePhotos = computed(() => paged.items.value)
const selectedSet = computed(() => new Set(selectedIds.value))
const focusSelected = computed(() => !!focusPhoto.value && selectedSet.value.has(focusPhoto.value.id))
const canSelect = computed(() => !!overview.value?.joined && overview.value.status === 'PUBLISHED' && selectionLoaded.value)
const canBasket = computed(() => !!overview.value?.download?.canSelected)
const focusIndex = computed(() => focusPhoto.value ? visiblePhotos.value.findIndex(photo => photo.id === focusPhoto.value!.id) : -1)
const focusTotal = computed(() => Math.max(paged.total.value, visiblePhotos.value.length))
const hasPrev = computed(() => focusIndex.value > 0)
const hasNext = computed(() => focusIndex.value >= 0 && (focusIndex.value < visiblePhotos.value.length - 1 || paged.hasMore.value))
const noteDirty = computed(() => focusSelected.value && !noteLoading.value && !noteLoadError.value && noteText.value !== noteSavedText.value)
const focusBox = computed(() => focusPhoto.value ? fitBox(focusPhoto.value) : null)
const limitLabel = computed(() => {
  const s = overview.value?.settings
  if (!s || s.limitKind === 'unlimited') return 'Không giới hạn'
  if (s.limitKind === 'range') return `${s.limitMin}–${s.limitMax} ảnh`
  return `${s.limitMax ?? s.limitMin} ảnh`
})
const subtitle = computed(() => {
  const o = overview.value
  if (!o) return ''
  const prefix = o.status === 'PUBLISHED' ? (paged.total.value ? `${paged.total.value} ảnh · ` : '') : 'Bộ ảnh đã chốt · '
  return `${prefix}Hạn ${new Intl.DateTimeFormat('vi-VN').format(new Date(o.expiresAt))}`
})
const limitHint = computed(() => {
  const s = overview.value?.settings
  if (!s || s.limitKind === 'unlimited') return ''
  if (s.limitKind === 'range') return `Chọn từ ${s.limitMin}–${s.limitMax} ảnh`
  if (s.limitKind === 'exact') return `Cần chọn đúng ${s.limitMax ?? s.limitMin} ảnh`
  if (s.limitKind === 'minimum') return `Chọn ít nhất ${s.limitMin ?? s.limitMax} ảnh`
  return `Chọn tối đa ${s.limitMax ?? s.limitMin} ảnh`
})

async function loadSelection() {
  if (!overview.value?.joined || overview.value.status !== 'PUBLISHED') return
  const result = await $fetch<{ version: number; selectedPhotoIds?: string[] }>(`${root}/selection`, { query: selectionLoaded.value ? { since: selectionVersion.value } : {} })
  selectionVersion.value = result.version
  if (result.selectedPhotoIds) selectedIds.value = result.selectedPhotoIds
  selectionLoaded.value = true
}

async function loadPhotos() {
  await paged.reset()
  if (paged.error.value) error.value = paged.error.value
}

async function refreshAlbumState() {
  if (!overview.value) return
  const next = (await $fetch<{ album: Overview }>(`${root}/access`)).album
  const changed = next.status !== overview.value.status || next.currentCycle !== overview.value.currentCycle
  overview.value = next
  if (changed) {
    selectionLoaded.value = false
    selectionVersion.value = 0
    selectedIds.value = []
    await loadSelection()
    await loadPhotos()
  } else await loadSelection()
}

async function loadOverview(token: string | null): Promise<Overview> {
  try {
    return (await $fetch<{ album: Overview }>(`${root}/access`)).album
  } catch (cause) {
    const code = (cause as { statusCode?: number } | null)?.statusCode
    if (code !== 403) throw cause
    if (!token) throw new Error('Link thiếu mã truy cập, hãy xin lại link đầy đủ từ người gửi hoặc studio')
    // Redeem only when the cookie is missing/stale; redeeming on every load would mint a new participant token each time.
    try { await $fetch(`${root}/access`, { method: 'POST', body: { token } }) }
    catch { throw new Error('Link album không hợp lệ hoặc đã hết hạn') }
    return (await $fetch<{ album: Overview }>(`${root}/access`)).album
  }
}

async function enter() {
  loading.value = true
  error.value = ''
  try {
    const token = typeof route.query.token === 'string' ? route.query.token : null
    overview.value = await loadOverview(token)
    if (overview.value.canJoin) {
      try { await joinAlbum() }
      catch (cause) { error.value = cause instanceof Error ? cause.message : 'Không thể vào album' }
    }
    const selectionPromise = loadSelection().catch(() => { status.value = 'Chưa đồng bộ được lựa chọn. Đang thử lại…' })
    await loadPhotos()
    loading.value = false
    await selectionPromise
    if (!paged.error.value && !error.value) {
      galleryReady.value = true
      trackAnalyticsEvent({ name: 'album_opened' })
    }
    if (import.meta.client) {
      pollTimer = setInterval(() => {
        if (document.visibilityState === 'visible' && !busy.value && !pendingSelections.value && (!focusPhoto.value || !selectionLoaded.value)) void refreshAlbumState().catch(() => { status.value = 'Mất kết nối đồng bộ. Đang thử lại…' })
      }, 4000)
    }
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Link album không hợp lệ hoặc đã hết hạn' }
  finally { loading.value = false }
}

async function joinAlbum() {
  await $fetch(`${root}/join`, { method: 'POST' })
  overview.value = (await $fetch<{ album: Overview }>(`${root}/access`)).album
}

async function retryJoin() {
  busy.value = true
  error.value = ''
  try {
    await joinAlbum()
    if (!paged.items.value.length) await loadPhotos()
    selectionLoaded.value = false
    await loadSelection()
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Không thể vào album' }
  finally { busy.value = false }
}

function setSelected(photoId: string, selected: boolean) {
  const has = selectedSet.value.has(photoId)
  if (selected && !has) selectedIds.value = [...selectedIds.value, photoId]
  else if (!selected && has) selectedIds.value = selectedIds.value.filter(id => id !== photoId)
}

// The heart flips instantly; saves run one at a time so each carries the version returned by the previous one.
function toggle(photo: Photo) {
  if (!canSelect.value) return
  const wanted = !selectedSet.value.has(photo.id)
  setSelected(photo.id, wanted)
  pendingSelections.value++
  selectionQueue = selectionQueue.then(() => saveSelection(photo.id, wanted)).finally(() => { pendingSelections.value-- })
}

function showDownloadSheet() {
  if (downloadMode.value === 'selected' && !overview.value?.download?.selectedCount) setDownloadMode('basket')
  openDownloadSheet()
}

async function prepareCurrentDownload() {
  await prepareDownload(() => selectionQueue)
}

async function saveSelection(photoId: string, wanted: boolean) {
  try {
    const result = await $fetch<SaveResult>(`${root}/selection/${photoId}`, { method: 'PUT', body: { selected: wanted, expectedVersion: selectionVersion.value } })
    if (result.status === 'saved') {
      trackAnalyticsEvent({ name: wanted ? 'photo_selected' : 'photo_unselected', selected_count: result.count })
      selectionVersion.value = result.version
      setSelected(photoId, wanted)
      return
    }
    status.value = result.status === 'limit_reached' ? `Đã đạt giới hạn ${limitLabel.value}` : 'Lựa chọn đã thay đổi ở thiết bị khác. Đã đồng bộ lại.'
  } catch (cause) { status.value = cause instanceof Error ? cause.message : 'Lưu thất bại. Vui lòng thử lại.' }
  selectionLoaded.value = false
  try { await loadSelection() }
  catch { status.value = 'Mất kết nối đồng bộ. Đang thử lại…' }
}

function likeFocusPhoto() {
  if (!focusPhoto.value || !canSelect.value) return
  if (!focusSelected.value) toggle(focusPhoto.value)
  heartPop.value = true
  setTimeout(() => { heartPop.value = false }, 650)
}

function handleStageDoubleClick() {
  if (Date.now() - lastTouchEnd > 600) likeFocusPhoto()
}

async function openPhoto(photo: Photo) {
  if (!focusPhoto.value && import.meta.client) {
    navigationDirection = 1
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    focusPhoto.value = photo
    void nextTick(() => focusCloseButton.value?.focus())
  }
  const request = ++noteReadRequest
  focusImageFailed.value = false
  focusStage.value = 'drive'
  focusLoaded.value = false
  focusWidthLimit.value = focusWidthCap()
  focusPhoto.value = photo
  cancelPreloads(photo.id)
  noteText.value = ''
  noteSavedText.value = ''
  noteVersion.value = 0
  noteLoadError.value = false
  noteLoading.value = !!overview.value?.joined
  if (!overview.value?.joined) return
  try {
    const note = await $fetch<{ body: string; version: number }>(`${root}/notes/${photo.id}`)
    if (request !== noteReadRequest || focusPhoto.value?.id !== photo.id) return
    noteText.value = note.body
    noteSavedText.value = note.body
    noteVersion.value = note.version
  } catch {
    if (request !== noteReadRequest || focusPhoto.value?.id !== photo.id) return
    noteLoadError.value = true
    status.value = 'Không tải được ghi chú. Vui lòng thử lại.'
  } finally {
    if (request === noteReadRequest) noteLoading.value = false
  }
}

async function closePhoto() {
  if (noteDirty.value && !await saveNote()) return
  noteReadRequest++
  focusPhoto.value = null
  cancelPreloads()
  returnFocus?.focus({ preventScroll: true })
  returnFocus = null
}

// Unsaved notes are saved before moving on so switching photos never drops typed text.
async function step(delta: 1 | -1) {
  if (navigating || focusIndex.value < 0) return
  navigating = true
  try {
    const index = focusIndex.value
    let target = visiblePhotos.value[index + delta]
    if (!target && delta === 1 && paged.hasMore.value) {
      if (paged.loading.value) await new Promise<void>(resolve => { const stop = watch(paged.loading, value => { if (!value) { stop(); resolve() } }) })
      else await paged.loadMore()
      target = visiblePhotos.value[index + 1]
    }
    if (!target || (noteDirty.value && !await saveNote())) return
    navigationDirection = delta
    void openPhoto(target)
  } finally { navigating = false }
}

async function saveNote(): Promise<boolean> {
  clearTimeout(noteSaveTimer)
  if (noteSaving) await noteSaving
  if (!noteDirty.value) return true
  if (!focusPhoto.value || overview.value?.status !== 'PUBLISHED') return false
  noteSaving = persistNote(focusPhoto.value.id, noteText.value)
  try { return await noteSaving }
  finally { noteSaving = null }
}

async function persistNote(photoId: string, text: string): Promise<boolean> {
  status.value = 'Đang lưu ghi chú…'
  try {
    const note = await $fetch<{ status: 'saved' | 'conflict'; version: number; body: string }>(`${root}/notes/${photoId}`, { method: 'PUT', body: { text, expectedVersion: noteVersion.value } })
    if (note.status === 'saved') trackAnalyticsEvent({ name: 'photo_note_saved' })
    if (focusPhoto.value?.id !== photoId) return true
    noteVersion.value = note.version
    noteSavedText.value = note.body
    if (note.status === 'conflict') {
      noteText.value = note.body
      status.value = 'Ghi chú đã đổi ở thiết bị khác. Đã tải bản mới.'
      return false
    }
    status.value = 'Đã lưu ghi chú'
    return true
  } catch (cause) {
    status.value = cause instanceof Error ? cause.message : 'Lưu ghi chú thất bại'
    return false
  }
}

// Largest box with the photo's own ratio that fits the stage, so there are no letterbox bands.
function fitBox(photo: Photo) {
  const { width, height } = stageSize.value
  if (!width || !height) return null
  const ratio = photo.width && photo.height ? photo.width / photo.height : 0.8
  const boxHeight = Math.min(height, width / ratio)
  return { width: Math.round(boxHeight * ratio), height: Math.round(boxHeight) }
}

function focusSizes(photo: Photo) {
  const box = fitBox(photo)
  return box ? `${box.width}px` : '100vw'
}

function cancelPreloads(keepId?: string) {
  for (const [id, image] of preloaded) {
    if (id === keepId) continue
    image.onload = null
    image.onerror = null
    image.srcset = ''
    image.src = ''
    preloaded.delete(id)
  }
}

function preloadNext() {
  const photo = visiblePhotos.value[focusIndex.value + navigationDirection]
  cancelPreloads(photo?.id)
  if (!photo || preloaded.has(photo.id) || focusWidthLimit.value <= 1280) return
  const image = new Image()
  image.fetchPriority = 'low'
  image.referrerPolicy = 'no-referrer'
  image.sizes = focusSizes(photo)
  image.onerror = () => { if (preloaded.get(photo.id) === image) preloaded.delete(photo.id) }
  preloaded.set(photo.id, image)
  image.srcset = driveFocusSrcset(photo.sourceFileId, focusWidthLimit.value)
  image.src = driveFocusSrc(photo.sourceFileId, focusWidthLimit.value)
}

async function handleFocusImageLoad(event: Event) {
  const image = event.target as HTMLImageElement
  const photoId = focusPhoto.value?.id
  const stage = focusStage.value
  if (!image.isConnected || !photoId) return
  preloadNext()
  try { await image.decode() } catch { /* A completed image can still be displayed if decode rejects. */ }
  if (!image.isConnected || focusPhoto.value?.id !== photoId || focusStage.value !== stage) return
  focusLoaded.value = true
}

function onStageTouchStart(event: TouchEvent) {
  const touch = event.touches.length === 1 ? event.touches[0] : undefined
  touchStart = touch ? { x: touch.clientX, y: touch.clientY } : null
}

function onStageTouchEnd(event: TouchEvent) {
  const touch = event.changedTouches[0]
  if (!touchStart || !touch) return
  const dx = touch.clientX - touchStart.x
  const dy = touch.clientY - touchStart.y
  touchStart = null
  const now = Date.now()
  lastTouchEnd = now
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) { void step(dx < 0 ? 1 : -1); return }
  const isTap = Math.abs(dx) < 10 && Math.abs(dy) < 10 && !(event.target instanceof Element && event.target.closest('button'))
  if (!isTap) return
  if (now - lastTap < 300) { lastTap = 0; likeFocusPhoto() }
  else lastTap = now
}

function handleFocusKey(event: KeyboardEvent) {
  if (!focusPhoto.value || downloadSheetOpen.value) return
  if (event.key === 'Escape') { void closePhoto(); return }
  if (event.target instanceof HTMLElement && event.target.closest('textarea, input')) return
  if (event.key === 'ArrowRight') { event.preventDefault(); void step(1) }
  else if (event.key === 'ArrowLeft') { event.preventDefault(); void step(-1) }
}

watch(stageEl, element => {
  stageObserver?.disconnect()
  if (!element) return
  stageObserver = new ResizeObserver(([entry]) => { if (entry) stageSize.value = { width: entry.contentRect.width, height: entry.contentRect.height } })
  stageObserver.observe(element)
})

watch(() => !!focusPhoto.value, open => { if (import.meta.client) document.documentElement.style.overflow = open ? 'hidden' : '' })

watch(focusIndex, index => { if (index >= 0 && index >= visiblePhotos.value.length - 3 && paged.hasMore.value && !paged.loading.value) void paged.loadMore() })

watch(noteText, () => {
  clearTimeout(noteSaveTimer)
  if (noteDirty.value) noteSaveTimer = setTimeout(() => { void saveNote() }, 800)
})

watch(status, message => {
  clearTimeout(statusTimer)
  if (message) statusTimer = setTimeout(() => { if (status.value === message) status.value = '' }, 4000)
})

function thumbnailBase(photo: Photo, mode: GalleryLayout) {
  return mode === 'grid' ? driveGridSrc(photo.sourceFileId, photo.width, photo.height) : driveThumbnailUrl(photo.sourceFileId, 'w', 480)
}

function thumbnailSrc(photo: Photo, mode: GalleryLayout = layout.value) {
  const state = thumbnailState.value[photo.id]
  if (!state) return thumbnailBase(photo, mode)
  return state === 'proxy' ? `${root}/photos/${photo.id}/image?variant=thumbnail` : `${root}/photos/${photo.id}/image`
}

function thumbnailSrcset(photo: Photo, mode: GalleryLayout = layout.value) {
  if (thumbnailState.value[photo.id]) return undefined
  return mode === 'grid' ? driveGridSrcset(photo.sourceFileId, photo.width, photo.height) : driveFitSrcset(photo.sourceFileId)
}

// The authenticated proxy uses Drive's official thumbnail link when the direct image request fails.
function handleThumbnailError(photoId: string) {
  const state = thumbnailState.value[photoId]
  thumbnailState.value[photoId] = !state ? 'proxy' : state === 'proxy' ? 'original' : 'failed'
}

function focusSrc(photo: Photo) {
  if (focusStage.value === 'original') return `${root}/photos/${photo.id}/image`
  return driveFocusSrc(photo.sourceFileId, focusWidthLimit.value)
}

function focusSrcset(photo: Photo) {
  return focusStage.value === 'drive' ? driveFocusSrcset(photo.sourceFileId, focusWidthLimit.value) : undefined
}

function handleFocusImageError() {
  focusLoaded.value = false
  if (focusStage.value === 'drive') focusStage.value = 'original'
  else focusImageFailed.value = true
}

onMounted(() => {
  window.addEventListener('keydown', handleFocusKey)
  void enter()
})
watch(galleryReady, ready => {
  if (!ready || reportedOpen) return
  reportedOpen = true
  void reportGalleryOpen(albumId, analyticsConfig.studioGalleryAnalyticsEnabled)
    .catch(() => { status.value = 'Không ghi được lượt mở album vào thống kê studio.' })
})
onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer)
  clearTimeout(noteSaveTimer)
  clearTimeout(statusTimer)
  window.removeEventListener('keydown', handleFocusKey)
  stageObserver?.disconnect()
  cancelPreloads()
  document.documentElement.style.overflow = ''
})
</script>

<template>
  <div class="min-h-dvh bg-canvas text-ink">
    <SiteHeader />
    <main class="mx-auto max-w-7xl px-4 pb-28 pt-5 sm:px-8 sm:pt-8">
      <div v-if="loading" role="status" aria-busy="true" aria-label="Đang mở album">
        <UiSkeleton class="h-9 w-2/3 max-w-md sm:h-12" />
        <UiSkeleton class="mt-3 h-4 w-48 max-w-full" />
        <div class="mt-6 flex justify-end">
          <UiSkeleton class="h-11 w-40 rounded-full" />
        </div>
        <div class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
          <UiPhotoSkeleton v-for="n in 10" :key="n" heart class="aspect-[.8]" />
        </div>
        <span class="sr-only">Đang mở album…</span>
      </div>
      <UiNotice v-else-if="error && !overview" tone="error" class="p-5 sm:p-6">{{ error }}</UiNotice>
      <template v-else-if="overview">
        <div class="px-1 sm:px-0">
          <h1 class="text-2xl font-semibold tracking-tight text-balance break-words sm:text-5xl">{{ overview.title }}</h1>
          <p class="mt-1.5 text-sm text-muted tabular-nums sm:mt-2">{{ subtitle }}</p>
        </div>
        <div v-if="overview.canJoin && error" class="surface mt-6 max-w-md p-5 shadow-sm sm:mt-8 sm:p-6">
          <p role="alert" class="text-sm text-danger">{{ error }}</p>
          <UiButton class="mt-4" :loading="busy" @click="retryJoin">Thử lại</UiButton>
        </div>
        <div v-else-if="overview.canJoin" role="status" aria-busy="true" aria-label="Đang vào album" class="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
          <UiPhotoSkeleton v-for="n in 10" :key="n" heart class="aspect-[.8]" />
          <span class="sr-only">Đang vào album…</span>
        </div>
        <template v-else>
          <div class="mb-3 mt-5 flex items-center justify-between gap-3 px-1 sm:mb-4 sm:mt-6 sm:px-0">
            <p class="text-sm font-semibold text-muted">{{ filter === 'selected' ? 'Ảnh đã chọn' : '' }}</p>
            <GalleryLayoutSwitch v-model="layout" @changed="next => trackAnalyticsEvent({ name: 'gallery_view_changed', layout: next, surface: 'customer' })" />
          </div>
          <p v-if="overview.status === 'PUBLISHED' && !selectionLoaded" role="status" class="mb-3 px-1 text-xs text-muted sm:px-0">Đang đồng bộ lựa chọn…</p>
          <div v-if="!paged.started.value" role="status" aria-label="Đang tải ảnh" class="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
            <UiPhotoSkeleton v-for="n in 10" :key="n" heart class="aspect-[.8]" />
          </div>
          <div v-else-if="!visiblePhotos.length && !paged.loading.value" class="surface p-6 text-center text-muted sm:p-8">{{ paged.error.value || (filter === 'selected' ? 'Chưa có ảnh được chọn.' : 'Album chưa có ảnh có thể hiển thị.') }}</div>
          <ClientOnly v-else>
            <PhotoGallery
              :items="visiblePhotos"
              :layout="layout"
              :total="paged.total.value"
              :has-more="paged.hasMore.value"
              :loading="paged.loading.value"
              :caption-height="56"
              label="Ảnh trong album"
              @end="paged.loadMore"
            >
              <template #default="{ item: photo, box, layout: mode, eager, priority }">
                <PhotoTile
                  :filename="photo.filename"
                  :layout="mode"
                  :box="box"
                  :src="thumbnailSrc(photo, mode)"
                  :srcset="thumbnailSrcset(photo, mode)"
                  :eager="eager"
                  :priority="priority"
                  :failed="thumbnailState[photo.id] === 'failed'"
                  :action-label="`Mở ảnh ${photo.filename}`"
                  :caption-height="56"
                  @activate="openPhoto(photo)"
                  @error="handleThumbnailError(photo.id)"
                >
                  <template v-if="overview.status === 'PUBLISHED' || (downloadMode === 'basket' && canBasket)" #action>
                    <div class="flex items-center gap-1">
                      <label v-if="downloadMode === 'basket' && canBasket" class="focus-ring grid min-h-11 min-w-11 place-items-center rounded-full bg-white/95 shadow-sm" :title="`Tải ${photo.filename}`"><input type="checkbox" class="size-5 accent-brand" :aria-label="`Tải ${photo.filename}`" :checked="downloadBasket.has(photo.id)" @change="toggleBasket(photo.id)"></label>
                      <button v-if="overview.status === 'PUBLISHED'" type="button" class="focus-ring grid size-11 shrink-0 place-items-center rounded-full border text-lg shadow-sm transition-colors disabled:cursor-wait disabled:opacity-50" :class="selectedSet.has(photo.id) ? 'border-heart bg-heart-soft text-heart' : 'border-line bg-white/90 text-muted'" :aria-label="`${selectedSet.has(photo.id) ? 'Bỏ chọn' : 'Chọn'} ${photo.filename}`" :aria-pressed="selectedSet.has(photo.id)" :disabled="!canSelect" @click="toggle(photo)">♥</button>
                    </div>
                  </template>
                </PhotoTile>
              </template>
            </PhotoGallery>
          </ClientOnly>
          <div v-if="paged.error.value && visiblePhotos.length" role="alert" class="mt-6 flex flex-wrap items-center justify-center gap-2 text-center text-sm text-danger">
            {{ paged.error.value }}
            <UiButton variant="secondary" size="sm" @click="paged.loadMore">Thử lại</UiButton>
          </div>
        </template>
      </template>
    </main>
    <div v-if="!focusPhoto && overview && !overview.canJoin" class="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex flex-col items-center gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <p role="status" aria-live="polite" class="max-w-sm rounded-full bg-ink/90 px-4 py-2 text-center text-sm text-white shadow-lg transition-opacity motion-reduce:transition-none" :class="status ? 'opacity-100' : 'opacity-0'">{{ status }}</p>
      <SelectionIsland :can-select="canSelect" :selected-count="selectedIds.length" :status="overview.status" :limit-hint="limitHint" :filter-selected="filter === 'selected'" :download="overview.download" :basket-count="downloadBasket.size" @toggle-filter="filter = filter === 'selected' ? 'all' : 'selected'" @download="showDownloadSheet" />
    </div>
    <div v-if="focusPhoto" class="fixed inset-0 z-30 flex flex-col overscroll-contain bg-night text-white sm:flex-row" role="dialog" aria-modal="true" :aria-label="focusPhoto.filename">
      <div class="flex min-h-0 min-w-0 flex-1 flex-col">
        <div class="flex items-center gap-3 px-3 pt-[max(.5rem,env(safe-area-inset-top))] pb-2 sm:px-5 sm:py-3">
          <p class="shrink-0 text-sm font-semibold tabular-nums text-white/90">{{ focusIndex + 1 }} / {{ focusTotal }}</p>
          <h2 class="min-w-0 flex-1 truncate text-sm text-white/70" :title="focusPhoto.filename">{{ focusPhoto.filename }}</h2>
          <label v-if="downloadMode === 'basket' && canBasket" class="grid size-11 shrink-0 place-items-center rounded-full bg-white/10" :title="`Tải ${focusPhoto.filename}`"><input type="checkbox" class="size-5 accent-brand" :aria-label="`Tải ${focusPhoto.filename}`" :checked="downloadBasket.has(focusPhoto.id)" @change="toggleBasket(focusPhoto.id)"></label>
          <a v-if="overview?.download?.canSingle" :href="`${root}/photos/${focusPhoto.id}/download`" :aria-label="`Tải ảnh gốc ${focusPhoto.filename}`" class="grid size-11 shrink-0 place-items-center rounded-full text-xl hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white" title="Tải ảnh gốc">↓</a>
          <button ref="focusCloseButton" type="button" class="grid size-11 shrink-0 place-items-center rounded-full text-xl hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white" aria-label="Đóng ảnh" @click="closePhoto">✕</button>
        </div>
        <div ref="stageEl" class="relative flex min-h-0 flex-1 touch-manipulation items-center justify-center px-2 pb-2 select-none sm:px-20 sm:pb-6" @touchstart.passive="onStageTouchStart" @touchend.passive="onStageTouchEnd">
          <p v-if="focusImageFailed" role="alert" class="p-6 text-center text-white/80">Không tải được ảnh gốc từ Google Drive.</p>
          <div v-else class="photo-placeholder relative overflow-hidden rounded-md sm:rounded-lg" :class="focusBox ? '' : 'size-full'" :style="focusBox ? { width: `${focusBox.width}px`, height: `${focusBox.height}px` } : undefined" :data-loading="!focusLoaded ? '' : undefined" @dblclick="handleStageDoubleClick">
            <img v-if="focusBox" :key="focusPhoto.id" :src="focusSrc(focusPhoto)" :srcset="focusSrcset(focusPhoto)" :sizes="focusStage === 'drive' ? focusSizes(focusPhoto) : undefined" :alt="focusPhoto.filename" decoding="async" fetchpriority="high" referrerpolicy="no-referrer" class="absolute inset-0 size-full object-contain transition-opacity duration-200" :class="focusLoaded ? 'opacity-100' : 'opacity-0'" @load="handleFocusImageLoad" @error="handleFocusImageError">
            <span aria-hidden="true" class="pointer-events-none absolute inset-0 grid place-items-center text-8xl text-white drop-shadow-lg transition-[opacity,transform] duration-300 motion-reduce:transition-none" :class="heartPop ? 'scale-100 opacity-100' : 'scale-50 opacity-0'">♥</span>
          </div>
          <button v-if="hasPrev" type="button" class="absolute left-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/45 backdrop-blur hover:bg-black/65 focus-visible:outline-2 focus-visible:outline-white sm:left-4 sm:size-12" aria-label="Ảnh trước" @click="step(-1)">
            <svg viewBox="0 0 24 24" class="size-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <button v-if="hasNext" type="button" class="absolute right-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/45 backdrop-blur hover:bg-black/65 focus-visible:outline-2 focus-visible:outline-white sm:right-4 sm:size-12" aria-label="Ảnh tiếp theo" @click="step(1)">
            <svg viewBox="0 0 24 24" class="size-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
          </button>
        </div>
        <div v-if="overview?.download?.canSingle" class="flex flex-wrap items-center justify-center gap-2 px-3 pb-3 sm:hidden">
          <button type="button" class="focus-ring min-h-11 rounded-full border border-white/50 px-4 text-sm font-semibold disabled:opacity-50" :disabled="transferBusy" @click="prepareSingle(focusPhoto.id)">{{ transferBusy ? 'Đang chuẩn bị…' : 'Chuẩn bị ảnh gốc' }}</button>
          <button v-if="preparedSingleId === focusPhoto.id && shareReady" type="button" class="focus-ring min-h-11 rounded-full bg-white px-4 text-sm font-semibold text-brand" @click="sharePrepared">Mở bảng lưu/chia sẻ</button>
          <p v-if="transferMessage || shareStatus" role="status" class="w-full text-center text-xs text-white/80">{{ transferMessage || shareStatus }}</p>
        </div>
      </div>
      <aside v-if="overview?.status === 'PUBLISHED'" class="max-h-[45dvh] shrink-0 overflow-y-auto overscroll-contain rounded-t-2xl bg-white px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-ink sm:max-h-none sm:w-80 sm:rounded-none sm:p-5 lg:w-96">
        <button type="button" class="focus-ring min-h-12 w-full rounded-full border text-base font-semibold transition-colors disabled:cursor-wait disabled:opacity-50" :class="focusSelected ? 'border-heart bg-heart text-white' : 'border-line-strong bg-white text-brand'" :aria-pressed="focusSelected" :disabled="!canSelect" @click="toggle(focusPhoto)">{{ focusSelected ? '♥ Đã chọn' : '♡ Chọn ảnh' }}</button>
        <div v-if="focusSelected && noteLoading" role="status" aria-busy="true" aria-label="Đang tải ghi chú" class="mt-4">
          <UiSkeleton class="h-4 w-32" />
          <UiSkeleton class="mt-2 h-20 w-full rounded-xl sm:h-32" />
          <span class="sr-only">Đang tải ghi chú…</span>
        </div>
        <label v-else-if="focusSelected" class="mt-4 block text-sm font-semibold">Ghi chú chỉnh sửa<UiTextarea v-model="noteText" :disabled="noteLoading || noteLoadError" maxlength="5000" rows="3" name="photo-note" class="mt-2 py-3 sm:min-h-36" placeholder="Bạn muốn chỉnh gì ở ảnh này?" /></label>
        <p v-else-if="overview.joined" class="mt-3 text-center text-sm text-muted sm:text-left">Chọn ảnh này để ghi chú cần chỉnh sửa.</p>
        <UiButton v-if="noteLoadError && focusSelected" variant="secondary" size="sm" class="mt-3" @click="openPhoto(focusPhoto)">Thử tải lại ghi chú</UiButton>
        <p role="status" aria-live="polite" class="mt-1 min-h-5 text-xs text-muted">{{ status || (focusSelected && !noteLoading ? 'Ghi chú tự lưu khi bạn gõ.' : '') }}</p>
      </aside>
    </div>
    <DownloadSheet v-if="downloadSheetOpen && overview?.download" :mode="downloadMode" :basket-count="downloadBasket.size" :selected-count="overview.download.selectedCount" :capabilities="overview.download" :plan="downloadPlan" :busy="downloadBusy" :error="downloadError" :share-eligible="shareEligible" :share-ready="shareReady" :share-status="shareStatus" :transfer-busy="transferBusy" :transfer-part="transferPart" :transfer-bytes="transferBytes" :completed-parts="completedParts" :failed-parts="failedParts" :transfer-message="transferMessage" @close="closeDownloadSheet" @mode="setDownloadMode" @clear="clearBasket" @prepare="prepareCurrentDownload" @prepare-files="prepareFiles" @share="sharePrepared" @download-part="downloadPart" @cancel="cancelTransfer" />
  </div>
</template>
