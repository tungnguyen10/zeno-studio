<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import type { ExportItem } from '~~/shared/domain/export'
import { PRODUCTION_STATUS_LABELS, countRetouched } from '~~/shared/domain/album-status'

type ResultPage = { selectionVersionId: string; finalizedAt: string; versionNumber: number; total: number; notesCount: number; items: ExportItem[]; nextCursor: string | null }
type ProductionItem = { id: string; filename: string; status: string }
type ProductionPage = { canDeliver: boolean; items: ProductionItem[]; review?: { roundNumber: number; status: string } | null }
type ResultView = 'selection' | 'production' | 'delivery'
const props = withDefaults(defineProps<{ apiRoot: string; backTo: string; backLabel?: string; filterBase?: string }>(), { backLabel: 'Quay lại' })
const route = useRoute()
const results = ref<Omit<ResultPage, 'items' | 'nextCursor'> | null>(null)
const items = shallowRef<ExportItem[]>([])
const nextCursor = ref<string | null>(null)
const lockedVersionId = ref<string | null>(null)
const search = ref('')
const notesFilter = ref<'all' | 'with' | 'without'>('all')
let loadGeneration = 0
const loadingMore = ref(false)
const production = ref<ProductionPage | null>(null)
const editedDriveUrl = ref('')
const deliveryDriveUrl = ref('')
const productionFilter = ref('all')
const activeTaskId = ref<string | null>(null)
const submittingReview = ref(false)
const submittingDelivery = ref(false)
const reviewError = ref('')
const deliveryError = ref('')
const error = ref('')
const busy = ref(true)
const message = ref('')
const scrollPanel = ref<HTMLElement | null>(null)

const EXPORTS = [
  { format: 'filenames-txt', label: 'TXT', filename: 'filenames.txt' },
  { format: 'selection-csv', label: 'Selection CSV', filename: 'selection.csv' },
  { format: 'notes-csv', label: 'Notes CSV', filename: 'notes.csv' },
  { format: 'notes-txt', label: 'Notes TXT', filename: 'notes.txt' },
] as const

const virtualizer = useVirtualizer(computed(() => ({
  count: items.value.length,
  getScrollElement: () => scrollPanel.value,
  estimateSize: () => 84,
  overscan: 8,
  gap: 10,
})))
const virtualRows = computed(() => virtualizer.value.getVirtualItems())
const retouched = computed(() => countRetouched(production.value?.items ?? []))
const allReady = computed(() => !!production.value?.items.length && production.value.items.every(item => item.status === 'WAITING_REVIEW'))
const delivered = computed(() => !!production.value?.items.length && production.value.items.every(item => item.status === 'DELIVERED'))
const canOpenReview = computed(() => allReady.value && (!production.value?.review || production.value.review.status === 'REVISION_REQUESTED'))
const canSubmitDelivery = computed(() => !!production.value?.canDeliver && production.value.review?.status === 'APPROVED' && !!production.value.items.length && production.value.items.every(item => item.status === 'APPROVED') && !delivered.value)
const remainingToRetouch = computed(() => (production.value?.items.length ?? 0) - retouched.value)
const visibleProduction = computed(() => production.value?.items.filter(item => productionFilter.value === 'all' || item.status === productionFilter.value) ?? [])
const activeView = computed<ResultView>(() => {
  const view = route.query.view
  return view === 'production' || view === 'delivery' ? view : 'selection'
})
const steps: ReadonlyArray<{ id: ResultView; label: string }> = [
  { id: 'selection', label: 'Ảnh đã chốt' },
  { id: 'production', label: 'Hậu kỳ' },
  { id: 'delivery', label: 'Duyệt & bàn giao' },
]
const nextStep = computed(() => {
  if (!production.value) return { view: 'selection' as ResultView, label: 'Xem ảnh đã chốt', hint: 'Danh sách và ghi chú của phiên bản đã chốt.' }
  if (!production.value.items.length) return { view: 'selection' as ResultView, label: 'Xem ảnh đã chốt', hint: 'Chưa có công việc hậu kỳ cho phiên bản này.' }
  if (delivered.value) return { view: 'delivery' as ResultView, label: 'Đã bàn giao', hint: 'Album đã hoàn tất.' }
  if (canSubmitDelivery.value) return { view: 'delivery' as ResultView, label: 'Bàn giao album', hint: 'Khách đã duyệt ảnh thành phẩm.' }
  if (production.value.review?.status === 'APPROVED') return { view: 'delivery' as ResultView, label: 'Chờ bàn giao', hint: 'Khách đã duyệt; người có quyền bàn giao sẽ hoàn tất.' }
  if (production.value.review?.status === 'WAITING_REVIEW') return { view: 'delivery' as ResultView, label: 'Xem vòng duyệt', hint: 'Đang chờ khách duyệt ảnh.' }
  if (canOpenReview.value) return { view: 'delivery' as ResultView, label: 'Mở vòng duyệt', hint: 'Ảnh đã sẵn sàng gửi khách.' }
  return { view: 'production' as ResultView, label: 'Tiếp tục hậu kỳ', hint: `${remainingToRetouch.value} ảnh cần hoàn tất trước khi gửi duyệt.` }
})

function viewTo(view: ResultView) {
  return { path: route.path, query: { ...route.query, view } }
}

async function loadPage() {
  if (loadingMore.value || (results.value && !nextCursor.value && items.value.length > 0)) return
  const generation = loadGeneration
  loadingMore.value = true
  try {
    const page = await $fetch<ResultPage>(`${props.apiRoot}/results`, { query: { limit: 100, versionId: lockedVersionId.value ?? undefined, search: search.value, notesFilter: notesFilter.value, ...(nextCursor.value ? { cursor: nextCursor.value } : {}) } })
    if (generation !== loadGeneration) return
    lockedVersionId.value = page.selectionVersionId
    results.value = { selectionVersionId: page.selectionVersionId, finalizedAt: page.finalizedAt, versionNumber: page.versionNumber, total: page.total, notesCount: page.notesCount }
    items.value = items.value.concat(page.items)
    nextCursor.value = page.nextCursor
  } finally { if (generation === loadGeneration) loadingMore.value = false }
}

watch([search, notesFilter], () => {
  loadGeneration++
  items.value = []
  nextCursor.value = null
  loadingMore.value = false
  void loadPage().catch(cause => { message.value = cause instanceof Error ? cause.message : 'Không tải được kết quả' })
})

const filterLink = computed(() => props.filterBase && results.value
  ? `${props.filterBase}&version=${encodeURIComponent(results.value.selectionVersionId)}` : '')

watch(virtualRows, rows => {
  const last = rows.at(-1)
  if (last && nextCursor.value && last.index >= items.value.length - 20) void loadPage().catch(cause => { message.value = cause instanceof Error ? cause.message : 'Không tải được kết quả' })
})

onMounted(async () => {
  try {
    await loadPage()
    try { await loadProduction() }
    catch { message.value = 'Hậu kỳ hiện không khả dụng. Bạn vẫn có thể xuất kết quả đã chốt.' }
  }
  catch (cause) { error.value = cause instanceof Error ? cause.message : 'Không tải được kết quả' }
  finally { busy.value = false }
})

function exportUrl(format: typeof EXPORTS[number]['format']) {
  return `${props.apiRoot}/results/export?format=${format}&versionId=${lockedVersionId.value ?? ''}`
}

async function filenamesText() {
  return $fetch<string>(exportUrl('filenames-txt'), { responseType: 'text' })
}

async function downloadExport(item: typeof EXPORTS[number]) {
  try {
    const blob = await $fetch<Blob>(exportUrl(item.format), { responseType: 'blob' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = item.filename
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (cause) { message.value = cause instanceof Error ? cause.message : 'Không xuất được file' }
}

async function loadProduction() {
  production.value = await $fetch<ProductionPage>(`${props.apiRoot}/production`)
}

async function moveTask(id: string, status: 'RETOUCHING' | 'WAITING_REVIEW') {
  if (activeTaskId.value) return
  activeTaskId.value = id
  try {
    await $fetch(`${props.apiRoot}/production/${id}`, { method: 'PATCH', body: { status } })
    await loadProduction()
    message.value = 'Đã cập nhật trạng thái ảnh.'
  } catch (cause) { message.value = cause instanceof Error ? cause.message : 'Không cập nhật được hậu kỳ' }
  finally { activeTaskId.value = null }
}

async function sendReview() {
  if (!canOpenReview.value || submittingReview.value) return
  submittingReview.value = true
  reviewError.value = ''
  try {
    const review = await $fetch<{ roundNumber: number }>(`${props.apiRoot}/review`, { method: 'POST', body: { driveUrl: editedDriveUrl.value } })
    message.value = `Đã mở vòng duyệt ${review.roundNumber}. Gửi link album khách để duyệt ảnh.`
    await loadProduction()
  } catch (cause) { reviewError.value = cause instanceof Error ? cause.message : 'Không gửi duyệt được' }
  finally { submittingReview.value = false }
}

async function deliver() {
  if (!canSubmitDelivery.value || submittingDelivery.value) return
  submittingDelivery.value = true
  deliveryError.value = ''
  try {
    await $fetch(`${props.apiRoot}/delivery`, { method: 'POST', body: { driveUrl: deliveryDriveUrl.value } })
    message.value = 'Đã bàn giao album.'
    await loadProduction()
  } catch (cause) { deliveryError.value = cause instanceof Error ? cause.message : 'Không bàn giao được' }
  finally { submittingDelivery.value = false }
}

async function copyFilenames() {
  if (!results.value) return
  try {
    await navigator.clipboard.writeText(await filenamesText())
    message.value = 'Đã copy tên file.'
  } catch { message.value = 'Không thể copy tự động. Hãy dùng mục Xuất danh sách / ghi chú.' }
}

async function openFilter() {
  if (!results.value) return
  if (filterLink.value) { await navigateTo(filterLink.value); return }
  sessionStorage.setItem('zeno-filter-filenames', await filenamesText())
  await navigateTo('/tools/file-filter?from=results')
}
</script>

<template>
  <div class="min-h-screen bg-canvas text-ink">
    <a href="#main-content" class="sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:not-sr-only focus:rounded-xl focus:bg-white focus:px-4 focus:py-3 focus:font-semibold focus:text-brand focus:outline-2 focus:outline-brand">Đến nội dung chính</a>
    <header class="border-b border-line bg-white px-4 py-3 sm:px-6">
      <div class="mx-auto max-w-6xl">
        <NuxtLink :to="backTo" class="inline-flex min-h-11 items-center font-semibold text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">← {{ backLabel }}</NuxtLink>
      </div>
    </header>
    <main id="main-content" class="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
      <h1 class="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">Kết quả chọn ảnh</h1>
      <div v-if="busy" role="status" aria-busy="true" aria-label="Đang tải kết quả" class="mt-3">
        <UiSkeleton class="h-5 w-40" />
        <div class="mt-7 flex flex-wrap gap-2">
          <UiSkeleton v-for="n in 6" :key="n" class="h-12 w-28 rounded-full" />
        </div>
        <div class="mt-6 space-y-2.5 rounded-2xl border border-line bg-tint p-2 sm:p-3">
          <div v-for="n in 6" :key="n" class="rounded-xl border border-line bg-white p-4">
            <UiSkeleton class="h-4 w-1/3" />
            <UiSkeleton class="mt-2 h-3 w-2/3" />
          </div>
        </div>
        <span class="sr-only">Đang tải kết quả…</span>
      </div>
      <p v-else-if="error" class="mt-8 rounded-xl bg-white p-5 text-red-700" role="alert">{{ error }}</p>
      <template v-else-if="results">
        <div class="mt-5 grid gap-4 rounded-3xl border border-line bg-white p-4 shadow-sm sm:p-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-8">
          <div>
            <p class="text-xs font-bold uppercase tracking-[.16em] text-brand-soft">Bộ ảnh đã chốt</p>
            <div class="mt-3 flex flex-wrap gap-2 text-sm font-medium">
              <span class="rounded-full bg-tint px-3 py-1.5">Phiên bản {{ results.versionNumber }}</span>
              <span class="rounded-full bg-tint px-3 py-1.5">{{ results.total }} ảnh</span>
              <span class="rounded-full bg-tint px-3 py-1.5">{{ results.notesCount }} ảnh có ghi chú</span>
            </div>
            <p class="mt-3 text-sm text-muted">Chốt {{ new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(results.finalizedAt)) }}</p>
          </div>
          <div v-if="production" class="border-t border-line pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <p class="text-xs font-bold uppercase tracking-[.16em] text-muted">Việc tiếp theo</p>
            <p class="mt-2 font-semibold text-brand">{{ nextStep.label }}</p>
            <p class="mt-1 text-sm text-muted">{{ nextStep.hint }}</p>
            <NuxtLink v-if="!delivered && activeView !== nextStep.view" :to="viewTo(nextStep.view)" class="mt-3 inline-flex min-h-11 items-center rounded-full bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">{{ nextStep.label }} →</NuxtLink>
          </div>
        </div>
        <nav v-if="production" aria-label="Các bước xử lý" class="mt-5 flex gap-2 overflow-x-auto border-b border-line pb-3 text-sm font-semibold">
          <NuxtLink v-for="step in steps" :key="step.id" :to="viewTo(step.id)" :aria-current="activeView === step.id ? 'page' : undefined" class="inline-flex min-h-11 shrink-0 items-center rounded-full px-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" :class="activeView === step.id ? 'bg-brand text-white' : 'bg-white text-brand hover:bg-tint'">{{ step.label }}</NuxtLink>
        </nav>
        <p v-if="message" role="status" class="mt-5 rounded-xl border border-line bg-tint px-4 py-3 text-sm text-brand">{{ message }}</p>
        <section v-if="activeView === 'selection' || !production" id="selection" class="mt-6">
          <div class="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 class="text-2xl font-semibold">Ảnh đã chốt</h2>
              <p class="mt-1 text-sm text-muted">Tên file và yêu cầu chỉnh sửa được giữ theo phiên bản này.</p>
            </div>
            <div class="flex flex-wrap gap-2 text-sm font-semibold">
              <NuxtLink v-if="filterLink" :to="filterLink" class="inline-flex min-h-11 items-center rounded-full bg-brand px-5 text-white hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">Lọc ảnh gốc</NuxtLink>
              <button v-else type="button" class="min-h-11 rounded-full bg-brand px-5 text-white hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" @click="openFilter">Lọc file trên máy</button>
              <button type="button" class="min-h-11 rounded-full border border-line bg-white px-5 text-brand hover:bg-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" @click="copyFilenames">Copy tên file</button>
              <details class="relative rounded-full border border-line bg-white px-5 py-3 text-brand"><summary class="cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">Xuất danh sách / ghi chú</summary><div class="absolute right-0 z-10 mt-3 min-w-44 rounded-xl border border-line bg-white p-2 shadow-lg"><button v-for="item in EXPORTS" :key="item.format" type="button" class="block min-h-11 w-full rounded-lg px-3 text-left hover:bg-tint focus-visible:outline-2 focus-visible:outline-brand" @click="downloadExport(item)">{{ item.label }}</button></div></details>
            </div>
          </div>
          <p class="mt-2 text-xs text-muted">Copy và xuất áp dụng cho toàn bộ ảnh của phiên bản này, kể cả khi đang lọc danh sách.</p>
          <div class="mt-5 flex flex-col gap-3 rounded-2xl border border-line bg-white p-4 sm:flex-row sm:items-end">
            <label class="min-w-0 flex-1 text-sm font-medium">Tìm tên file<input v-model="search" type="search" name="result-search" autocomplete="off" class="mt-1 block min-h-11 w-full rounded-xl border border-line bg-white px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" placeholder="Ví dụ DSC_0123…"></label>
            <label class="text-sm font-medium">Ghi chú<select v-model="notesFilter" name="result-notes" class="mt-1 block min-h-11 w-full rounded-xl border border-line bg-white px-3 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:min-w-44"><option value="all">Tất cả</option><option value="with">Có ghi chú</option><option value="without">Chưa có ghi chú</option></select></label>
          </div>
          <div v-if="results.total <= 50 && !nextCursor" class="mt-5 overflow-hidden rounded-2xl border border-line bg-white" role="region" aria-label="Danh sách ảnh đã chốt">
            <div class="hidden grid-cols-[4rem_minmax(0,1fr)_minmax(10rem,1.2fr)] gap-5 border-b border-line bg-tint px-4 py-3 text-xs font-bold uppercase tracking-wide text-muted sm:grid">
              <span aria-hidden="true"></span><span>Tên file</span><span>Ghi chú</span>
            </div>
            <ul class="divide-y divide-line">
              <li v-for="item in items" :key="item.photoId" class="px-4 py-3">
                <AlbumResultRow :item="item" :image-url="filterBase ? apiRoot + '/photos/' + item.photoId + '/image' : undefined" />
              </li>
            </ul>
          </div>
          <ClientOnly v-else>
          <div ref="scrollPanel" class="mt-5 max-h-[70vh] overflow-auto overscroll-contain rounded-2xl border border-line bg-tint p-2 sm:p-3" role="region" aria-label="Danh sách ảnh đã chốt" tabindex="0">
            <ul class="relative w-full" :style="{ height: `${virtualizer.getTotalSize()}px` }" :aria-busy="loadingMore">
              <li
                v-for="row in virtualRows"
                :key="items[row.index]!.photoId"
                :ref="el => virtualizer.measureElement(el as Element | null)"
                :data-index="row.index"
                :aria-posinset="row.index + 1"
                :aria-setsize="results.total"
                class="absolute inset-x-0 rounded-xl border border-line bg-white p-4"
                :style="{ transform: `translateY(${row.start}px)` }"
              >
                <AlbumResultRow :item="items[row.index]!" :image-url="filterBase ? apiRoot + '/photos/' + items[row.index]!.photoId + '/image' : undefined" />
              </li>
            </ul>
            <div v-if="loadingMore" role="status" aria-label="Đang tải thêm" class="mt-2.5 space-y-2.5">
              <div v-for="n in 2" :key="n" class="rounded-xl border border-line bg-white p-4">
                <UiSkeleton class="h-4 w-1/3" />
                <UiSkeleton class="mt-2 h-3 w-1/2" />
              </div>
            </div>
          </div>
        </ClientOnly>
          <p v-if="!loadingMore && items.length === 0" class="mt-3 text-sm text-muted">Không có ảnh phù hợp.</p>
        </section>
        <section v-if="production && activeView === 'production'" id="production" class="mt-6">
          <div class="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 class="text-2xl font-semibold">Tiến độ hậu kỳ</h2>
              <p class="mt-1 text-sm text-muted">Cập nhật từng ảnh trước khi gửi khách duyệt.</p>
            </div>
            <label class="text-sm font-medium">Trạng thái
              <select v-model="productionFilter" name="production-status" class="mt-1 block min-h-11 rounded-xl border border-line bg-white px-3 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
                <option value="all">Tất cả</option>
                <option value="PENDING">Chờ chỉnh</option>
                <option value="RETOUCHING">Đang chỉnh</option>
                <option value="WAITING_REVIEW">Chờ khách duyệt</option>
                <option value="REVISION_REQUESTED">Cần chỉnh lại</option>
                <option value="APPROVED">Khách đã duyệt</option>
                <option value="DELIVERED">Đã bàn giao</option>
              </select>
            </label>
          </div>
          <div v-if="production.items.length" class="mt-5 rounded-2xl border border-line bg-white p-5">
            <div class="flex items-baseline justify-between gap-3 text-sm"><span class="font-semibold text-ink">{{ retouched }}/{{ production.items.length }} ảnh đã chỉnh</span><span class="text-muted">{{ remainingToRetouch }} ảnh còn lại</span></div>
            <progress class="mt-3 h-2 w-full overflow-hidden rounded-full bg-tint accent-brand" :value="retouched" :max="production.items.length" aria-label="Tiến độ chỉnh ảnh" />
          </div>
          <ul v-if="visibleProduction.length" class="mt-4 space-y-2" aria-label="Công việc hậu kỳ">
            <li v-for="task in visibleProduction" :key="task.id" class="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white px-4 py-3 text-sm [contain-intrinsic-size:auto_64px] [content-visibility:auto]">
              <div class="min-w-0"><p class="break-all font-semibold" translate="no">{{ task.filename }}</p><p class="mt-1 text-xs font-semibold text-muted">{{ PRODUCTION_STATUS_LABELS[task.status] ?? task.status }}</p></div>
              <button v-if="task.status === 'PENDING' || task.status === 'REVISION_REQUESTED'" type="button" :disabled="activeTaskId !== null" class="min-h-11 rounded-full border border-brand px-4 font-semibold text-brand hover:bg-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50" @click="moveTask(task.id, 'RETOUCHING')">{{ activeTaskId === task.id ? 'Đang lưu…' : 'Bắt đầu chỉnh' }}</button>
              <button v-else-if="task.status === 'RETOUCHING'" type="button" :disabled="activeTaskId !== null" class="min-h-11 rounded-full border border-brand px-4 font-semibold text-brand hover:bg-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50" @click="moveTask(task.id, 'WAITING_REVIEW')">{{ activeTaskId === task.id ? 'Đang lưu…' : 'Ảnh đã chỉnh' }}</button>
            </li>
          </ul>
          <p v-else class="mt-4 rounded-2xl border border-line bg-white p-5 text-sm text-muted">{{ production.items.length ? 'Không có ảnh ở trạng thái này.' : 'Chưa có công việc hậu kỳ.' }}</p>
        </section>
        <section v-if="production && activeView === 'delivery'" id="delivery" class="mt-6">
          <h2 class="text-2xl font-semibold">Duyệt & bàn giao</h2>
          <p class="mt-1 text-sm text-muted">Gửi ảnh đã chỉnh, theo dõi phản hồi và bàn giao thành phẩm.</p>
          <div class="mt-5 grid gap-4 lg:grid-cols-2">
            <div class="rounded-2xl border border-line bg-white p-5 sm:p-6">
              <p class="text-xs font-bold uppercase tracking-[.16em] text-brand-soft">Bước 1</p>
              <h3 class="mt-2 text-lg font-semibold">Gửi ảnh đã chỉnh để khách duyệt</h3>
              <form v-if="canOpenReview" class="mt-4" @submit.prevent="sendReview">
                <label class="block text-sm font-medium">Link folder Google Drive<input v-model="editedDriveUrl" required type="url" name="edited-drive-url" autocomplete="off" class="mt-2 min-h-11 w-full rounded-xl border border-line p-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" placeholder="https://drive.google.com/drive/folders/…"></label>
                <p v-if="reviewError" role="alert" class="mt-2 text-sm text-red-700">{{ reviewError }}</p>
                <button :disabled="submittingReview" class="mt-4 min-h-11 rounded-full bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50">{{ submittingReview ? 'Đang mở vòng duyệt…' : 'Mở vòng duyệt' }}</button>
              </form>
              <p v-else-if="production.review?.status === 'WAITING_REVIEW'" class="mt-4 rounded-xl bg-tint p-4 text-sm text-brand">Đang chờ khách duyệt vòng {{ production.review.roundNumber }}. Gửi link album khách để khách xem ảnh đã chỉnh.</p>
              <p v-else-if="production.review?.status === 'APPROVED' || delivered" class="mt-4 rounded-xl bg-tint p-4 text-sm text-brand">Khách đã duyệt ảnh thành phẩm.</p>
              <p v-else-if="!production.items.length" class="mt-4 rounded-xl bg-tint p-4 text-sm text-muted">Chưa có ảnh để gửi duyệt.</p>
              <p v-else class="mt-4 rounded-xl bg-tint p-4 text-sm text-muted">Cần đánh dấu {{ remainingToRetouch }}/{{ production.items.length }} ảnh đã chỉnh trước khi mở vòng duyệt.</p>
            </div>
            <div class="rounded-2xl border border-line bg-white p-5 sm:p-6">
              <p class="text-xs font-bold uppercase tracking-[.16em] text-brand-soft">Bước 2</p>
              <h3 class="mt-2 text-lg font-semibold">Bàn giao thành phẩm</h3>
              <form v-if="canSubmitDelivery" class="mt-4" @submit.prevent="deliver">
                <label class="block text-sm font-medium">Link Drive thành phẩm<input v-model="deliveryDriveUrl" required type="url" name="delivery-drive-url" autocomplete="off" class="mt-2 min-h-11 w-full rounded-xl border border-line p-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" placeholder="https://drive.google.com/drive/folders/…"></label>
                <p v-if="deliveryError" role="alert" class="mt-2 text-sm text-red-700">{{ deliveryError }}</p>
                <button :disabled="submittingDelivery" class="mt-4 min-h-11 rounded-full border border-brand px-5 text-sm font-semibold text-brand hover:bg-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50">{{ submittingDelivery ? 'Đang bàn giao…' : 'Đánh dấu hoàn tất' }}</button>
              </form>
              <p v-else-if="delivered" class="mt-4 rounded-xl bg-tint p-4 text-sm text-brand">Album đã bàn giao.</p>
              <p v-else-if="production.review?.status === 'APPROVED'" class="mt-4 rounded-xl bg-tint p-4 text-sm text-muted">Khách đã duyệt; tài khoản này chưa có quyền bàn giao.</p>
              <p v-else class="mt-4 rounded-xl bg-tint p-4 text-sm text-muted">Mở sau khi khách duyệt tất cả ảnh đã chỉnh.</p>
            </div>
          </div>
        </section>
      </template>
    </main>
  </div>
</template>
