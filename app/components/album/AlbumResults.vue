<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import type { ExportItem } from '~~/shared/domain/export'
import { countRetouched } from '~~/shared/domain/album-status'
import { RESULT_EXPORTS, type ProductionPage, type ResultExportFormat, type ResultSummary, type ResultView } from '~/lib/album-results'

type ResultPage = ResultSummary & { items: ExportItem[]; nextCursor: string | null }
const props = withDefaults(defineProps<{ apiRoot: string; backTo: string; backLabel?: string; filterBase?: string }>(), { backLabel: 'Quay lại' })
const route = useRoute()
const results = ref<ResultSummary | null>(null)
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

const retouched = computed(() => countRetouched(production.value?.items ?? []))
const allReady = computed(() => !!production.value?.items.length && production.value.items.every(item => item.status === 'WAITING_REVIEW'))
const delivered = computed(() => !!production.value?.items.length && production.value.items.every(item => item.status === 'DELIVERED'))
const canOpenReview = computed(() => allReady.value && (!production.value?.review || production.value.review.status === 'REVISION_REQUESTED'))
const canSubmitDelivery = computed(() => !!production.value?.canDeliver && production.value.review?.status === 'APPROVED' && !!production.value.items.length && production.value.items.every(item => item.status === 'APPROVED') && !delivered.value)
const remainingToRetouch = computed(() => (production.value?.items.length ?? 0) - retouched.value)
const activeView = computed<ResultView>(() => {
  const view = route.query.view
  return view === 'production' || view === 'delivery' ? view : 'selection'
})
const steps = computed(() => ([
  { id: 'selection', label: 'Ảnh đã chốt' },
  { id: 'production', label: 'Hậu kỳ' },
  { id: 'delivery', label: 'Duyệt & bàn giao' },
] as const).map(step => ({ ...step, to: viewTo(step.id) })))
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
const summaryNext = computed(() => production.value
  ? { label: nextStep.value.label, hint: nextStep.value.hint, to: !delivered.value && activeView.value !== nextStep.value.view ? viewTo(nextStep.value.view) : undefined }
  : undefined)

function viewTo(view: ResultView) {
  return { path: route.path, query: { ...route.query, view } }
}

function failureText(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback
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

function loadMore() {
  void loadPage().catch(cause => { message.value = failureText(cause, 'Không tải được kết quả') })
}

watch([search, notesFilter], () => {
  loadGeneration++
  items.value = []
  nextCursor.value = null
  loadingMore.value = false
  loadMore()
})

const filterLink = computed(() => props.filterBase && results.value
  ? `${props.filterBase}&version=${encodeURIComponent(results.value.selectionVersionId)}` : '')

onMounted(async () => {
  try {
    await loadPage()
    try { await loadProduction() }
    catch { message.value = 'Hậu kỳ hiện không khả dụng. Bạn vẫn có thể xuất kết quả đã chốt.' }
  }
  catch (cause) { error.value = cause instanceof Error ? cause.message : 'Không tải được kết quả' }
  finally { busy.value = false }
})

function exportUrl(format: ResultExportFormat) {
  return `${props.apiRoot}/results/export?format=${format}&versionId=${lockedVersionId.value ?? ''}`
}

async function filenamesText() {
  return $fetch<string>(exportUrl('filenames-txt'), { responseType: 'text' })
}

async function downloadExport(format: ResultExportFormat) {
  const item = RESULT_EXPORTS.find(entry => entry.key === format)!
  try {
    const blob = await $fetch<Blob>(exportUrl(format), { responseType: 'blob' })
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
  <div class="min-h-dvh bg-canvas text-ink">
    <a href="#main-content" class="sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:not-sr-only focus:rounded-xl focus:bg-white focus:px-4 focus:py-3 focus:font-semibold focus:text-brand focus:outline-2 focus:outline-brand">Đến nội dung chính</a>
    <header class="border-b border-line bg-canvas px-4 sm:px-5">
      <div class="mx-auto flex h-16 max-w-6xl items-center">
        <NuxtLink :to="backTo" class="focus-ring -ml-2 inline-flex min-h-11 items-center gap-1 rounded-full px-2 font-semibold text-brand hover:bg-tint">← {{ backLabel }}</NuxtLink>
      </div>
    </header>
    <main id="main-content" class="mx-auto max-w-6xl px-4 pt-6 pb-[max(2.5rem,env(safe-area-inset-bottom))] sm:px-5 sm:py-10">
      <p class="text-xs font-bold uppercase tracking-[.18em] text-brand-soft">Selection Results</p>
      <h1 class="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">Kết quả chọn ảnh</h1>
      <div v-if="busy" role="status" aria-busy="true" aria-label="Đang tải kết quả" class="mt-4">
        <UiSkeleton class="h-32 w-full rounded-2xl sm:h-36 sm:rounded-3xl" />
        <div class="mt-5 flex gap-2">
          <UiSkeleton v-for="n in 3" :key="n" class="h-11 w-28 rounded-full" />
        </div>
        <div class="mt-6 space-y-2.5 rounded-2xl border border-line bg-tint p-2 sm:p-3">
          <div v-for="n in 6" :key="n" class="rounded-xl border border-line bg-white p-4">
            <UiSkeleton class="h-4 w-1/3" />
            <UiSkeleton class="mt-2 h-3 w-2/3" />
          </div>
        </div>
        <span class="sr-only">Đang tải kết quả…</span>
      </div>
      <UiNotice v-else-if="error" tone="error" class="mt-6">{{ error }}</UiNotice>
      <template v-else-if="results">
        <AlbumResultsSummary :summary="results" :next="summaryNext" />
        <div v-if="production" class="sticky top-0 z-10 -mx-4 mt-4 border-b border-line bg-canvas/95 px-4 py-2 backdrop-blur sm:-mx-5 sm:mt-5 sm:px-5">
          <UiTabs label="Các bước xử lý" :items="steps" :current="activeView" />
        </div>
        <UiNotice v-if="message" class="mt-4" aria-live="polite">{{ message }}</UiNotice>
        <AlbumResultsSelection
          v-if="activeView === 'selection' || !production"
          v-model:search="search"
          v-model:notes-filter="notesFilter"
          :items="items"
          :total="results.total"
          :has-more="!!nextCursor"
          :loading-more="loadingMore"
          :filter-link="filterLink || undefined"
          :image-base="filterBase ? `${apiRoot}/photos` : undefined"
          @load-more="loadMore"
          @copy="copyFilenames"
          @export="downloadExport"
          @open-filter="openFilter"
        />
        <AlbumResultsProduction
          v-if="production && activeView === 'production'"
          v-model:filter="productionFilter"
          :items="production.items"
          :retouched="retouched"
          :active-task-id="activeTaskId"
          @move="moveTask"
        />
        <AlbumResultsDelivery
          v-if="production && activeView === 'delivery'"
          v-model:edited-url="editedDriveUrl"
          v-model:delivery-url="deliveryDriveUrl"
          :production="production"
          :can-open-review="canOpenReview"
          :can-submit-delivery="canSubmitDelivery"
          :delivered="delivered"
          :remaining="remainingToRetouch"
          :submitting-review="submittingReview"
          :submitting-delivery="submittingDelivery"
          :review-error="reviewError"
          :delivery-error="deliveryError"
          @send-review="sendReview"
          @deliver="deliver"
        />
      </template>
    </main>
  </div>
</template>
