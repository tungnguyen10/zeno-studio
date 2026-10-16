<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import type { ExportItem } from '~~/shared/domain/export'

type ResultPage = { versionNumber: number; total: number; items: ExportItem[]; nextCursor: string | null }
const props = defineProps<{ apiRoot: string; backTo: string }>()
const results = ref<{ versionNumber: number; total: number } | null>(null)
const items = shallowRef<ExportItem[]>([])
const nextCursor = ref<string | null>(null)
const loadingMore = ref(false)
const production = ref<{ canDeliver: boolean; items: Array<{ id: string; filename: string; status: string }> } | null>(null)
const editedDriveUrl = ref('')
const deliveryDriveUrl = ref('')
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

async function loadPage() {
  if (loadingMore.value || (results.value && !nextCursor.value)) return
  loadingMore.value = true
  try {
    const page = await $fetch<ResultPage>(`${props.apiRoot}/results`, { query: { limit: 100, ...(nextCursor.value ? { cursor: nextCursor.value } : {}) } })
    results.value = { versionNumber: page.versionNumber, total: page.total }
    items.value = items.value.concat(page.items)
    nextCursor.value = page.nextCursor
  } finally { loadingMore.value = false }
}

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
  return `${props.apiRoot}/results/export?format=${format}`
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
  production.value = await $fetch<{ canDeliver: boolean; items: Array<{ id: string; filename: string; status: string }> }>(`${props.apiRoot}/production`)
}

async function moveTask(id: string, status: 'RETOUCHING' | 'WAITING_REVIEW') {
  try {
    await $fetch(`${props.apiRoot}/production/${id}`, { method: 'PATCH', body: { status } })
    await loadProduction()
  } catch (cause) { message.value = cause instanceof Error ? cause.message : 'Không cập nhật được hậu kỳ' }
}

async function sendReview() {
  try {
    const review = await $fetch<{ roundNumber: number }>(`${props.apiRoot}/review`, { method: 'POST', body: { driveUrl: editedDriveUrl.value } })
    message.value = `Đã mở vòng duyệt ${review.roundNumber}. Gửi link album khách để duyệt ảnh.`
  } catch (cause) { message.value = cause instanceof Error ? cause.message : 'Không gửi duyệt được' }
}

async function deliver() {
  try {
    await $fetch(`${props.apiRoot}/delivery`, { method: 'POST', body: { driveUrl: deliveryDriveUrl.value } })
    message.value = 'Đã bàn giao album.'
    await loadProduction()
  } catch (cause) { message.value = cause instanceof Error ? cause.message : 'Không bàn giao được' }
}

async function copyFilenames() {
  if (!results.value) return
  await navigator.clipboard.writeText(await filenamesText())
  message.value = 'Đã copy tên file.'
}

async function openFilter() {
  if (!results.value) return
  sessionStorage.setItem('zeno-filter-filenames', await filenamesText())
  await navigateTo('/tools/file-filter?from=results')
}
</script>

<template>
  <div class="min-h-screen bg-[#f8f7f3] text-[#24231f]">
    <header class="border-b border-[#e2e5dc] bg-white px-5 py-5"><div class="mx-auto max-w-5xl"><NuxtLink :to="backTo" class="font-bold text-[#344732]">← Quay lại</NuxtLink></div></header>
    <main class="mx-auto max-w-5xl px-5 py-12">
      <p class="text-xs font-bold uppercase tracking-[.18em] text-[#718a66]">Selection Results</p>
      <h1 class="mt-3 text-4xl font-semibold">Ảnh đã chốt</h1>
      <div v-if="busy" role="status" aria-busy="true" aria-label="Đang tải kết quả" class="mt-3">
        <UiSkeleton class="h-5 w-40" />
        <div class="mt-7 flex flex-wrap gap-2">
          <UiSkeleton v-for="n in 6" :key="n" class="h-12 w-28 rounded-full" />
        </div>
        <div class="mt-6 space-y-2.5 rounded-2xl border border-[#e0e4d9] bg-[#f3f5ef] p-2 sm:p-3">
          <div v-for="n in 6" :key="n" class="rounded-xl border border-[#e0e4d9] bg-white p-4">
            <UiSkeleton class="h-4 w-1/3" />
            <UiSkeleton class="mt-2 h-3 w-2/3" />
          </div>
        </div>
        <span class="sr-only">Đang tải kết quả…</span>
      </div>
      <p v-else-if="error" class="mt-8 rounded-xl bg-white p-5 text-red-700" role="alert">{{ error }}</p>
      <template v-else-if="results">
        <p class="mt-3 text-[#667461]">Phiên bản {{ results.versionNumber }} · {{ results.total }} ảnh</p>
        <div class="mt-7 flex flex-wrap gap-2 text-sm font-semibold">
          <button class="rounded-full bg-[#344732] px-5 py-3 text-white" @click="openFilter">Lọc file trên máy</button>
          <button class="rounded-full border px-5 py-3" @click="copyFilenames">Copy tên file</button>
          <button v-for="item in EXPORTS" :key="item.format" type="button" class="rounded-full border px-5 py-3" @click="downloadExport(item)">{{ item.label }}</button>
        </div>
        <p role="status" class="mt-3 text-sm text-[#526b4e]">{{ message }}</p>
        <ClientOnly>
          <div ref="scrollPanel" class="mt-6 max-h-[70vh] overflow-auto overscroll-contain rounded-2xl border border-[#e0e4d9] bg-[#f3f5ef] p-2 sm:p-3" role="region" aria-label="Danh sách ảnh đã chốt" tabindex="0">
            <ul class="relative w-full" :style="{ height: `${virtualizer.getTotalSize()}px` }" :aria-busy="loadingMore">
              <li
                v-for="row in virtualRows"
                :key="items[row.index]!.photoId"
                :ref="el => virtualizer.measureElement(el as Element | null)"
                :data-index="row.index"
                :aria-posinset="row.index + 1"
                :aria-setsize="results.total"
                class="absolute inset-x-0 rounded-xl border border-[#e0e4d9] bg-white p-4"
                :style="{ transform: `translateY(${row.start}px)` }"
              >
                <h2 class="break-all font-semibold">{{ items[row.index]!.filename }}</h2>
                <p v-if="!items[row.index]!.notes.length" class="mt-1 text-sm text-[#81877e]">Không có ghi chú</p>
                <p v-for="(note, index) in items[row.index]!.notes" :key="index" class="mt-1 whitespace-pre-line text-sm">{{ note.text }}</p>
              </li>
            </ul>
            <div v-if="loadingMore" role="status" aria-label="Đang tải thêm" class="mt-2.5 space-y-2.5">
              <div v-for="n in 2" :key="n" class="rounded-xl border border-[#e0e4d9] bg-white p-4">
                <UiSkeleton class="h-4 w-1/3" />
                <UiSkeleton class="mt-2 h-3 w-1/2" />
              </div>
            </div>
          </div>
        </ClientOnly>
        <section v-if="production" class="mt-12 border-t border-[#dfe4da] pt-8">
          <h2 class="text-2xl font-semibold">Hậu kỳ và duyệt</h2>
          <div class="mt-5 max-h-[60vh] space-y-2 overflow-auto overscroll-contain">
            <div v-for="task in production.items" :key="task.id" class="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-4 text-sm [contain-intrinsic-size:auto_56px] [content-visibility:auto]">
              <span class="break-all font-medium">{{ task.filename }} · {{ task.status }}</span>
              <button v-if="task.status === 'PENDING' || task.status === 'REVISION_REQUESTED'" class="font-semibold text-[#344732] underline" @click="moveTask(task.id, 'RETOUCHING')">Bắt đầu chỉnh</button>
              <button v-else-if="task.status === 'RETOUCHING'" class="font-semibold text-[#344732] underline" @click="moveTask(task.id, 'WAITING_REVIEW')">Ảnh đã chỉnh</button>
            </div>
          </div>
          <form class="mt-7 rounded-2xl bg-white p-5" @submit.prevent="sendReview">
            <h3 class="font-semibold">Gửi ảnh đã chỉnh để khách duyệt</h3>
            <label class="mt-3 block text-sm">Link folder Google Drive<input v-model="editedDriveUrl" required type="url" class="mt-2 w-full rounded-xl border p-3" placeholder="https://drive.google.com/drive/folders/..."></label>
            <button class="mt-3 rounded-full bg-[#344732] px-5 py-2.5 text-sm font-semibold text-white">Mở vòng duyệt</button>
          </form>
          <form v-if="production.canDeliver" class="mt-4 rounded-2xl bg-white p-5" @submit.prevent="deliver">
            <h3 class="font-semibold">Bàn giao sau khi khách duyệt</h3>
            <label class="mt-3 block text-sm">Link Drive thành phẩm<input v-model="deliveryDriveUrl" required type="url" class="mt-2 w-full rounded-xl border p-3" placeholder="https://drive.google.com/drive/folders/..."></label>
            <button class="mt-3 rounded-full border border-[#344732] px-5 py-2.5 text-sm font-semibold text-[#344732]">Đánh dấu hoàn tất</button>
          </form>
        </section>
      </template>
    </main>
  </div>
</template>
