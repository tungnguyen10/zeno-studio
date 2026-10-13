<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

type Photo = { id: string; filename: string; sortOrder: number; selectedBy: string[] }
type Workspace = { id: string; title: string; status: string; expiresAt: string; canFinalize: boolean; settings: { limitKind: string; limitMin: number | null; limitMax: number | null; collaborationMode: string }; photos: Photo[] }
const route = useRoute()
const studioId = typeof route.query.studio === 'string' ? route.query.studio : ''
const albumId = String(route.params.albumId)
const workspace = ref<Workspace | null>(null)
const chosen = ref<string[]>([])
const busy = ref(false)
const error = ref('')
const message = ref('')
const showOnlyMarked = ref(false)
const markedPhotos = computed(() => workspace.value?.photos.filter(photo => !showOnlyMarked.value || photo.selectedBy.length > 0) ?? [])
useSeoMeta({ title: () => workspace.value ? `${workspace.value.title} — Studio` : 'Chi tiết album — Studio' })

async function load() {
  if (!studioId) { error.value = 'Thiếu studio ID'; return }
  busy.value = true
  try {
    workspace.value = await $fetch<Workspace>(`/api/studio/${studioId}/albums/${albumId}`)
    if (workspace.value.status === 'PUBLISHED') chosen.value = workspace.value.photos.filter(photo => photo.selectedBy.length > 0).map(photo => photo.id)
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Không tải được album' }
  finally { busy.value = false }
}

function toggle(id: string) { chosen.value = chosen.value.includes(id) ? chosen.value.filter(item => item !== id) : [...chosen.value, id] }

async function finalize() {
  if (!workspace.value || busy.value) return
  busy.value = true
  message.value = ''
  try {
    const result = await $fetch<{ versionNumber: number }>(`/api/studio/${studioId}/albums/${albumId}/finalize`, { method: 'POST', body: { photoIds: chosen.value } })
    message.value = `Đã chốt phiên bản ${result.versionNumber}.`
    await load()
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Không thể chốt ảnh' }
  finally { busy.value = false }
}

async function reopen() {
  if (busy.value) return
  busy.value = true
  try { await $fetch(`/api/studio/${studioId}/albums/${albumId}/reopen`, { method: 'POST' }); await load(); message.value = 'Đã mở vòng chọn mới.' }
  catch (cause) { error.value = cause instanceof Error ? cause.message : 'Không thể mở lại album' }
  finally { busy.value = false }
}

onMounted(() => { void load() })
</script>

<template>
  <div class="min-h-screen bg-[#f8f7f3] text-[#24231f]">
    <header class="border-b border-[#e2e5dc] bg-white px-5 py-5"><div class="mx-auto max-w-5xl"><NuxtLink to="/studio" class="font-bold text-[#344732]">← Studio</NuxtLink></div></header>
    <main class="mx-auto max-w-5xl px-5 py-12">
      <p class="text-xs font-bold uppercase tracking-[.18em] text-[#718a66]">Album Detail</p>
      <h1 class="mt-3 text-4xl font-semibold">{{ workspace?.title ?? 'Album' }}</h1>
      <p v-if="busy && !workspace" role="status" class="mt-8">Đang tải album…</p>
      <p v-if="error" role="alert" class="mt-5 rounded-xl bg-white p-4 text-red-700">{{ error }}</p>
      <template v-if="workspace">
        <p class="mt-3 text-sm text-[#667461]">{{ workspace.status }} · {{ workspace.photos.length }} ảnh · {{ workspace.settings.collaborationMode }}</p>
        <div class="mt-7 flex flex-wrap items-center gap-3">
          <NuxtLink v-if="workspace.status === 'FINALIZED' || workspace.status === 'DELIVERED'" :to="`/studio/albums/${albumId}/results?studio=${studioId}`" class="rounded-full bg-[#344732] px-5 py-3 font-semibold text-white">Xem kết quả đã chốt</NuxtLink>
          <button v-if="workspace.status === 'FINALIZED' && workspace.canFinalize" :disabled="busy" class="rounded-full border px-5 py-3 font-semibold" @click="reopen">Mở vòng chọn mới</button>
          <button v-if="workspace.status === 'PUBLISHED' && workspace.canFinalize" :disabled="busy" class="rounded-full bg-[#344732] px-5 py-3 font-semibold text-white" @click="finalize">Chốt {{ chosen.length }} ảnh</button>
          <label class="ml-auto flex items-center gap-2 text-sm"><input v-model="showOnlyMarked" type="checkbox"> Chỉ ảnh được chọn/nhận phiếu</label>
        </div>
        <p class="mt-3 text-sm text-[#61735d]" role="status">{{ message }}</p>
        <p v-if="workspace.status === 'PUBLISHED'" class="mt-3 text-sm text-[#687264]">Kiểm tra từng ảnh rồi chọn bộ cuối. Hệ thống kiểm tra giới hạn khi chốt; ghi chú được đóng băng trong phiên bản kết quả.</p>
        <div class="mt-6 grid gap-3 sm:grid-cols-2">
          <label v-for="photo in markedPhotos" :key="photo.id" class="flex cursor-pointer items-start gap-3 rounded-2xl border border-[#e0e4d9] bg-white p-4">
            <input v-if="workspace.status === 'PUBLISHED' && workspace.canFinalize" type="checkbox" class="mt-1 size-5" :checked="chosen.includes(photo.id)" :aria-label="`Chốt ${photo.filename}`" @change="toggle(photo.id)">
            <div class="min-w-0"><p class="break-all font-semibold">{{ photo.filename }}</p><p class="mt-1 text-sm text-[#687264]">{{ photo.selectedBy.length }} lựa chọn/phiếu<span v-if="photo.selectedBy.length"> · {{ photo.selectedBy.join(', ') }}</span></p></div>
          </label>
        </div>
      </template>
    </main>
  </div>
</template>
