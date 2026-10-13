<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { exportFilenamesTxt, exportNotesCsv, exportNotesTxt, exportSelectionCsv, type ExportItem } from '~~/shared/domain/export'

useSeoMeta({ title: 'Kết quả chọn ảnh — Zeno Studio' })
const route = useRoute()
const studioId = typeof route.query.studio === 'string' ? route.query.studio : ''
const albumId = String(route.params.albumId)
const results = ref<{ versionNumber: number; items: ExportItem[] } | null>(null)
const production = ref<{ canDeliver: boolean; items: Array<{ id: string; filename: string; status: string }> } | null>(null)
const editedDriveUrl = ref('')
const deliveryDriveUrl = ref('')
const error = ref('')
const busy = ref(true)
const message = ref('')

onMounted(async () => {
  if (!studioId) { error.value = 'Thiếu studio ID'; busy.value = false; return }
  try {
    results.value = await $fetch<{ versionNumber: number; items: ExportItem[] }>(`/api/studio/${studioId}/albums/${albumId}/results`)
    await loadProduction()
  }
  catch (cause) { error.value = cause instanceof Error ? cause.message : 'Không tải được kết quả' }
  finally { busy.value = false }
})

async function loadProduction() {
  production.value = await $fetch<{ canDeliver: boolean; items: Array<{ id: string; filename: string; status: string }> }>(`/api/studio/${studioId}/albums/${albumId}/production`)
}

async function moveTask(id: string, status: 'RETOUCHING' | 'WAITING_REVIEW') {
  try {
    await $fetch(`/api/studio/${studioId}/albums/${albumId}/production/${id}`, { method: 'PATCH', body: { status } })
    await loadProduction()
  } catch (cause) { message.value = cause instanceof Error ? cause.message : 'Không cập nhật được hậu kỳ' }
}

async function sendReview() {
  try {
    const review = await $fetch<{ roundNumber: number }>(`/api/studio/${studioId}/albums/${albumId}/review`, { method: 'POST', body: { driveUrl: editedDriveUrl.value } })
    message.value = `Đã mở vòng duyệt ${review.roundNumber}. Gửi link album khách để duyệt ảnh.`
  } catch (cause) { message.value = cause instanceof Error ? cause.message : 'Không gửi duyệt được' }
}

async function deliver() {
  try {
    await $fetch(`/api/studio/${studioId}/albums/${albumId}/delivery`, { method: 'POST', body: { driveUrl: deliveryDriveUrl.value } })
    message.value = 'Đã bàn giao album.'
    await loadProduction()
  } catch (cause) { message.value = cause instanceof Error ? cause.message : 'Không bàn giao được' }
}

function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function copyFilenames() {
  if (!results.value) return
  await navigator.clipboard.writeText(exportFilenamesTxt(results.value.items))
  message.value = 'Đã copy tên file.'
}

async function openFilter() {
  if (!results.value) return
  sessionStorage.setItem('zeno-filter-filenames', exportFilenamesTxt(results.value.items))
  await navigateTo('/tools/file-filter?from=results')
}
</script>

<template>
  <div class="min-h-screen bg-[#f8f7f3] text-[#24231f]">
    <header class="border-b border-[#e2e5dc] bg-white px-5 py-5"><div class="mx-auto max-w-5xl"><NuxtLink to="/studio" class="font-bold text-[#344732]">← Studio</NuxtLink></div></header>
    <main class="mx-auto max-w-5xl px-5 py-12">
      <p class="text-xs font-bold uppercase tracking-[.18em] text-[#718a66]">Selection Results</p>
      <h1 class="mt-3 text-4xl font-semibold">Ảnh đã chốt</h1>
      <p v-if="busy" class="mt-8" role="status">Đang tải kết quả…</p>
      <p v-else-if="error" class="mt-8 rounded-xl bg-white p-5 text-red-700" role="alert">{{ error }}</p>
      <template v-else-if="results">
        <p class="mt-3 text-[#667461]">Phiên bản {{ results.versionNumber }} · {{ results.items.length }} ảnh</p>
        <div class="mt-7 flex flex-wrap gap-2 text-sm font-semibold">
          <button class="rounded-full bg-[#344732] px-5 py-3 text-white" @click="openFilter">Lọc file trên máy</button>
          <button class="rounded-full border px-5 py-3" @click="copyFilenames">Copy tên file</button>
          <button class="rounded-full border px-5 py-3" @click="download('filenames.txt', exportFilenamesTxt(results.items), 'text/plain;charset=utf-8')">TXT</button>
          <button class="rounded-full border px-5 py-3" @click="download('selection.csv', exportSelectionCsv(results.items), 'text/csv;charset=utf-8')">Selection CSV</button>
          <button class="rounded-full border px-5 py-3" @click="download('notes.csv', exportNotesCsv(results.items), 'text/csv;charset=utf-8')">Notes CSV</button>
          <button class="rounded-full border px-5 py-3" @click="download('notes.txt', exportNotesTxt(results.items), 'text/plain;charset=utf-8')">Notes TXT</button>
        </div>
        <p role="status" class="mt-3 text-sm text-[#526b4e]">{{ message }}</p>
        <div class="mt-6 space-y-3">
          <article v-for="item in results.items" :key="item.photoId" class="rounded-2xl border border-[#e0e4d9] bg-white p-5">
            <h2 class="break-all font-semibold">{{ item.filename }}</h2>
            <p v-if="!item.notes.length" class="mt-2 text-sm text-[#81877e]">Không có ghi chú</p>
            <p v-for="(note, index) in item.notes" :key="index" class="mt-2 text-sm"><strong>{{ note.participant }}:</strong> {{ note.text }}</p>
          </article>
        </div>
        <section v-if="production" class="mt-12 border-t border-[#dfe4da] pt-8">
          <h2 class="text-2xl font-semibold">Hậu kỳ và duyệt</h2>
          <div class="mt-5 space-y-2">
            <div v-for="task in production.items" :key="task.id" class="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-4 text-sm">
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
