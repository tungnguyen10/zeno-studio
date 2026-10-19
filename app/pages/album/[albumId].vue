<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { driveFitSrcset, driveFocusSrc, driveFocusSrcset, driveGridSrc, driveGridSrcset, driveThumbnailUrl, focusWidthCap, retryDelayMs, withRetryParam } from '~/lib/drive-image'
import type { GalleryLayout } from '~/lib/gallery-layout'
import { usePagedPhotos, type PhotoFilter, type PhotoPageResponse } from '~/composables/usePagedPhotos'
import { useGalleryLayout } from '~/composables/useGalleryLayout'
import GalleryLayoutSwitch from '~/components/album/GalleryLayoutSwitch.vue'
import PhotoGallery from '~/components/album/PhotoGallery.vue'
import PhotoTile from '~/components/album/PhotoTile.vue'

type Photo = { id: string; sourceFileId: string; filename: string; width: number | null; height: number | null; status: 'READY' | 'MISSING' | 'BROKEN'; sortOrder: number; selected: boolean }
type Overview = { id: string; title: string; status: string; currentCycle: number; expiresAt: string; joined: boolean; canJoin: boolean; settings: { limitKind: string; limitMin: number | null; limitMax: number | null } }
type SaveResult = { status: 'saved' | 'conflict' | 'limit_reached'; version: number; selected: boolean; count: number }
const route = useRoute()
const albumId = String(route.params.albumId)
const root = `/api/album/${albumId}`
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
const thumbnailState = ref<Record<string, 'retry' | 'proxy' | 'original' | 'failed'>>({})
const focusImageFailed = ref(false)
const focusStage = ref<'drive' | 'retry' | 'original'>('drive')
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
const preloaded = new Set<string>()

useSeoMeta({ title: () => overview.value ? `${overview.value.title} — Zeno Studio` : 'Album — Zeno Studio' })
const visiblePhotos = computed(() => paged.items.value)
const selectedSet = computed(() => new Set(selectedIds.value))
const focusSelected = computed(() => !!focusPhoto.value && selectedSet.value.has(focusPhoto.value.id))
const canSelect = computed(() => !!overview.value?.joined && overview.value.status === 'PUBLISHED')
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
    await loadPhotos()
    await loadSelection()
    if (import.meta.client) {
      pollTimer = setInterval(() => {
        if (document.visibilityState === 'visible' && !busy.value && !pendingSelections.value && !focusPhoto.value) void refreshAlbumState().catch(() => { status.value = 'Mất kết nối đồng bộ. Đang thử lại…' })
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

async function saveSelection(photoId: string, wanted: boolean) {
  try {
    const result = await $fetch<SaveResult>(`${root}/selection/${photoId}`, { method: 'PUT', body: { selected: wanted, expectedVersion: selectionVersion.value } })
    if (result.status === 'saved') {
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

function preloadNeighbours() {
  const index = focusIndex.value
  for (const photo of [visiblePhotos.value[index + 1], visiblePhotos.value[index - 1]]) {
    if (!photo || preloaded.has(photo.id)) continue
    preloaded.add(photo.id)
    const image = new Image()
    image.referrerPolicy = 'no-referrer'
    image.sizes = focusSizes(photo)
    image.srcset = driveFocusSrcset(photo.sourceFileId, focusWidthLimit.value)
    image.src = driveFocusSrc(photo.sourceFileId, focusWidthLimit.value)
  }
}

function handleFocusImageLoad() {
  focusLoaded.value = true
  preloadNeighbours()
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
  if (!focusPhoto.value) return
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
  if (state === 'retry') return withRetryParam(thumbnailBase(photo, mode))
  return state === 'proxy' ? `${root}/photos/${photo.id}/image?variant=thumbnail` : `${root}/photos/${photo.id}/image`
}

function thumbnailSrcset(photo: Photo, mode: GalleryLayout = layout.value) {
  if (thumbnailState.value[photo.id]) return undefined
  return mode === 'grid' ? driveGridSrcset(photo.sourceFileId, photo.width, photo.height) : driveFitSrcset(photo.sourceFileId)
}

// Direct Drive CDN, one delayed retry, then the authenticated proxy thumbnail, then the original.
function handleThumbnailError(photoId: string) {
  const state = thumbnailState.value[photoId]
  if (!state) {
    setTimeout(() => { if (!thumbnailState.value[photoId]) thumbnailState.value[photoId] = 'retry' }, retryDelayMs())
    return
  }
  if (state === 'retry') thumbnailState.value[photoId] = 'proxy'
  else thumbnailState.value[photoId] = state === 'proxy' ? 'original' : 'failed'
}

function focusSrc(photo: Photo) {
  if (focusStage.value === 'original') return `${root}/photos/${photo.id}/image`
  const src = driveFocusSrc(photo.sourceFileId, focusWidthLimit.value)
  return focusStage.value === 'retry' ? withRetryParam(src) : src
}

function focusSrcset(photo: Photo) {
  return focusStage.value === 'drive' ? driveFocusSrcset(photo.sourceFileId, focusWidthLimit.value) : undefined
}

function handleFocusImageError() {
  focusLoaded.value = false
  if (focusStage.value === 'drive') {
    const photoId = focusPhoto.value?.id
    setTimeout(() => { if (focusPhoto.value?.id === photoId && focusStage.value === 'drive') focusStage.value = 'retry' }, retryDelayMs())
  } else if (focusStage.value === 'retry') focusStage.value = 'original'
  else focusImageFailed.value = true
}

onMounted(() => {
  window.addEventListener('keydown', handleFocusKey)
  void enter()
})
onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer)
  clearTimeout(noteSaveTimer)
  clearTimeout(statusTimer)
  window.removeEventListener('keydown', handleFocusKey)
  stageObserver?.disconnect()
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
            <GalleryLayoutSwitch v-model="layout" />
          </div>
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
              <template #default="{ item: photo, box, layout: mode, eager }">
                <PhotoTile
                  :filename="photo.filename"
                  :layout="mode"
                  :box="box"
                  :src="thumbnailSrc(photo, mode)"
                  :srcset="thumbnailSrcset(photo, mode)"
                  :eager="eager"
                  :failed="thumbnailState[photo.id] === 'failed'"
                  :action-label="`Mở ảnh ${photo.filename}`"
                  :caption-height="56"
                  @activate="openPhoto(photo)"
                  @error="handleThumbnailError(photo.id)"
                >
                  <template v-if="overview.status === 'PUBLISHED'" #action>
                    <button type="button" class="focus-ring grid size-11 shrink-0 place-items-center rounded-full border text-lg shadow-sm transition-colors" :class="selectedSet.has(photo.id) ? 'border-heart bg-heart-soft text-heart' : 'border-line bg-white/90 text-muted'" :aria-label="`${selectedSet.has(photo.id) ? 'Bỏ chọn' : 'Chọn'} ${photo.filename}`" :aria-pressed="selectedSet.has(photo.id)" @click="toggle(photo)">♥</button>
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
      <div v-if="canSelect" class="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-full bg-brand py-1.5 pl-5 pr-1.5 text-white shadow-lg">
        <p class="min-w-0 flex-1 leading-tight">
          <span class="block text-sm font-semibold tabular-nums"><span aria-hidden="true">♥ </span>{{ selectedIds.length }} ảnh đã chọn</span>
          <span v-if="limitHint" class="block truncate text-xs text-white/75">{{ limitHint }}</span>
        </p>
        <button type="button" class="min-h-11 shrink-0 rounded-full bg-white px-4 text-sm font-semibold text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" :aria-pressed="filter === 'selected'" @click="filter = filter === 'selected' ? 'all' : 'selected'">{{ filter === 'selected' ? 'Xem tất cả' : 'Xem ảnh đã chọn' }}</button>
      </div>
    </div>
    <div v-if="focusPhoto" class="fixed inset-0 z-30 flex flex-col overscroll-contain bg-night text-white sm:flex-row" role="dialog" aria-modal="true" :aria-label="focusPhoto.filename">
      <div class="flex min-h-0 min-w-0 flex-1 flex-col">
        <div class="flex items-center gap-3 px-3 pt-[max(.5rem,env(safe-area-inset-top))] pb-2 sm:px-5 sm:py-3">
          <p class="shrink-0 text-sm font-semibold tabular-nums text-white/90">{{ focusIndex + 1 }} / {{ focusTotal }}</p>
          <h2 class="min-w-0 flex-1 truncate text-sm text-white/70" :title="focusPhoto.filename">{{ focusPhoto.filename }}</h2>
          <button ref="focusCloseButton" type="button" class="grid size-11 shrink-0 place-items-center rounded-full text-xl hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white" aria-label="Đóng ảnh" @click="closePhoto">✕</button>
        </div>
        <div ref="stageEl" class="relative flex min-h-0 flex-1 touch-manipulation items-center justify-center px-2 pb-2 select-none sm:px-20 sm:pb-6" @touchstart.passive="onStageTouchStart" @touchend.passive="onStageTouchEnd">
          <p v-if="focusImageFailed" role="alert" class="p-6 text-center text-white/80">Không tải được ảnh gốc từ Google Drive.</p>
          <div v-else class="photo-placeholder relative overflow-hidden rounded-md sm:rounded-lg" :class="focusBox ? '' : 'size-full'" :style="focusBox ? { width: `${focusBox.width}px`, height: `${focusBox.height}px` } : undefined" :data-loading="!focusLoaded ? '' : undefined" @dblclick="handleStageDoubleClick">
            <img v-if="!focusLoaded && !thumbnailState[focusPhoto.id]" :src="thumbnailSrc(focusPhoto, 'justified')" alt="" aria-hidden="true" referrerpolicy="no-referrer" class="absolute inset-0 size-full object-cover blur-md">
            <img v-if="focusBox" :key="focusPhoto.id" :src="focusSrc(focusPhoto)" :srcset="focusSrcset(focusPhoto)" :sizes="focusStage === 'drive' ? focusSizes(focusPhoto) : undefined" :alt="focusPhoto.filename" decoding="async" referrerpolicy="no-referrer" class="absolute inset-0 size-full object-contain transition-opacity duration-200" :class="focusLoaded ? 'opacity-100' : 'opacity-0'" @load="handleFocusImageLoad" @error="handleFocusImageError">
            <span aria-hidden="true" class="pointer-events-none absolute inset-0 grid place-items-center text-8xl text-white drop-shadow-lg transition-[opacity,transform] duration-300 motion-reduce:transition-none" :class="heartPop ? 'scale-100 opacity-100' : 'scale-50 opacity-0'">♥</span>
          </div>
          <button v-if="hasPrev" type="button" class="absolute left-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/45 backdrop-blur hover:bg-black/65 focus-visible:outline-2 focus-visible:outline-white sm:left-4 sm:size-12" aria-label="Ảnh trước" @click="step(-1)">
            <svg viewBox="0 0 24 24" class="size-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <button v-if="hasNext" type="button" class="absolute right-2 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/45 backdrop-blur hover:bg-black/65 focus-visible:outline-2 focus-visible:outline-white sm:right-4 sm:size-12" aria-label="Ảnh tiếp theo" @click="step(1)">
            <svg viewBox="0 0 24 24" class="size-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
          </button>
        </div>
      </div>
      <aside v-if="overview?.status === 'PUBLISHED'" class="max-h-[45dvh] shrink-0 overflow-y-auto overscroll-contain rounded-t-2xl bg-white px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-ink sm:max-h-none sm:w-80 sm:rounded-none sm:p-5 lg:w-96">
        <button type="button" class="focus-ring min-h-12 w-full rounded-full border text-base font-semibold transition-colors" :class="focusSelected ? 'border-heart bg-heart text-white' : 'border-line-strong bg-white text-brand'" :aria-pressed="focusSelected" @click="toggle(focusPhoto)">{{ focusSelected ? '♥ Đã chọn' : '♡ Chọn ảnh' }}</button>
        <div v-if="focusSelected && noteLoading" role="status" aria-busy="true" aria-label="Đang tải ghi chú" class="mt-4">
          <UiSkeleton class="h-4 w-32" />
          <UiSkeleton class="mt-2 h-20 w-full rounded-xl sm:h-32" />
          <span class="sr-only">Đang tải ghi chú…</span>
        </div>
        <label v-else-if="focusSelected" class="mt-4 block text-sm font-semibold">Ghi chú chỉnh sửa<textarea v-model="noteText" :disabled="noteLoading || noteLoadError" maxlength="5000" rows="3" name="photo-note" class="control mt-2 py-3 sm:min-h-36" placeholder="Bạn muốn chỉnh gì ở ảnh này?"></textarea></label>
        <p v-else-if="overview.joined" class="mt-3 text-center text-sm text-muted sm:text-left">Chọn ảnh này để ghi chú cần chỉnh sửa.</p>
        <UiButton v-if="noteLoadError && focusSelected" variant="secondary" size="sm" class="mt-3" @click="openPhoto(focusPhoto)">Thử tải lại ghi chú</UiButton>
        <p role="status" aria-live="polite" class="mt-1 min-h-5 text-xs text-muted">{{ status || (focusSelected && !noteLoading ? 'Ghi chú tự lưu khi bạn gõ.' : '') }}</p>
      </aside>
    </div>
  </div>
</template>
