<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import type { ExportItem } from '~~/shared/domain/export'
import { RESULT_EXPORTS, type ResultExportFormat, type ResultSummary } from '~/lib/album-results'

type ResultPage = ResultSummary & { items: ExportItem[]; nextCursor: string | null }
const props = withDefaults(defineProps<{ apiRoot: string; backTo: string; backLabel?: string; filterBase: string; imageBase?: string }>(), { backLabel: 'Quay lại' })
const results = ref<ResultSummary | null>(null)
const items = shallowRef<ExportItem[]>([])
const nextCursor = ref<string | null>(null)
const lockedVersionId = ref<string | null>(null)
const search = ref('')
const notesFilter = ref<'all' | 'with' | 'without'>('all')
let loadGeneration = 0
const loadingMore = ref(false)
const error = ref('')
const busy = ref(true)
const message = ref('')

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

const filterLink = computed(() => results.value
  ? `${props.filterBase}${props.filterBase.includes('?') ? '&' : '?'}version=${encodeURIComponent(results.value.selectionVersionId)}` : '')

onMounted(async () => {
  try {
    await loadPage()
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

async function copyFilenames() {
  if (!results.value) return
  try {
    await navigator.clipboard.writeText(await filenamesText())
    message.value = 'Đã copy tên file.'
  } catch { message.value = 'Không thể copy tự động. Hãy dùng mục Xuất danh sách / ghi chú.' }
}

</script>

<template>
  <div class="min-h-dvh bg-canvas text-ink">
    <a href="#main-content" class="sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:not-sr-only focus:rounded-xl focus:bg-white focus:px-4 focus:py-3 focus:font-semibold focus:text-brand focus:outline-2 focus:outline-brand">Đến nội dung chính</a>
    <header class="border-b border-line bg-canvas">
      <div class="mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-6 lg:px-8">
        <NuxtLink :to="backTo" class="focus-ring -ml-2 inline-flex min-h-11 items-center gap-1 rounded-full px-2 font-semibold text-brand hover:bg-tint">← {{ backLabel }}</NuxtLink>
      </div>
    </header>
    <main id="main-content" class="mx-auto max-w-6xl px-4 pt-5 pb-[max(2.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:pt-8 lg:px-8">
      <UiPageHeader title="Kết quả chọn ảnh" />
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
        <AlbumResultsSummary :summary="results" />
        <UiNotice v-if="message" class="mt-4" aria-live="polite">{{ message }}</UiNotice>
        <AlbumResultsSelection
          v-model:search="search"
          v-model:notes-filter="notesFilter"
          :items="items"
          :total="results.total"
          :has-more="!!nextCursor"
          :loading-more="loadingMore"
          :filter-link="filterLink"
          :image-base="imageBase"
          @load-more="loadMore"
          @copy="copyFilenames"
          @export="downloadExport"
        />
      </template>
    </main>
  </div>
</template>
