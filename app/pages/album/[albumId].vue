<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

type Photo = { id: string; filename: string; width: number | null; height: number | null; status: 'READY' | 'MISSING' | 'BROKEN'; sortOrder: number }
type Overview = { id: string; title: string; status: string; expiresAt: string; participant: { id: string; displayName: string } | null; settings: { limitKind: string; limitMin: number | null; limitMax: number | null; collaborationMode: string; shortlistRounds: number } }
type SaveResult = { status: 'saved' | 'conflict' | 'limit_reached'; version: number; selected: boolean; count: number }
const route = useRoute()
const albumId = String(route.params.albumId)
const root = `/api/album/${albumId}`
const overview = ref<Overview | null>(null)
const photos = ref<Photo[]>([])
const selectedIds = ref<string[]>([])
const selectionVersion = ref(0)
const nextCursor = ref<string | null>(null)
const participantName = ref('')
const focusPhoto = ref<Photo | null>(null)
const noteText = ref('')
const noteVersion = ref(0)
const noteLoading = ref(false)
const noteLoadError = ref(false)
const view = ref<'grid' | 'list'>('grid')
const filter = ref<'all' | 'selected'>('all')
const busy = ref(false)
const loading = ref(true)
const error = ref('')
const status = ref('')
const review = ref<{ roundNumber: number; driveUrl: string | null; deliveryUrl: string | null; status: string } | null>(null)
const revisionText = ref('')
let pollTimer: ReturnType<typeof setInterval> | undefined
let noteReadRequest = 0

useSeoMeta({ title: () => overview.value ? `${overview.value.title} — Zeno Studio` : 'Album — Zeno Studio' })
const visiblePhotos = computed(() => filter.value === 'selected' ? photos.value.filter(photo => selectedIds.value.includes(photo.id)) : photos.value)
const limitLabel = computed(() => {
  const s = overview.value?.settings
  if (!s || s.limitKind === 'unlimited') return 'Không giới hạn'
  if (s.limitKind === 'range') return `${s.limitMin}–${s.limitMax} ảnh`
  return `${s.limitMax ?? s.limitMin} ảnh`
})

async function loadSelection() {
  if (!overview.value?.participant || overview.value.status !== 'PUBLISHED') return
  const result = await $fetch<{ version: number; selectedPhotoIds: string[] }>(`${root}/selection`)
  selectionVersion.value = result.version
  selectedIds.value = result.selectedPhotoIds
}

async function loadPhotos() {
  if (busy.value) return
  busy.value = true
  try {
    const result = await $fetch<{ items: Photo[]; nextCursor: string | null }>(`${root}/photos`, { query: { limit: 60, ...(nextCursor.value ? { cursor: nextCursor.value } : {}) } })
    photos.value.push(...result.items)
    nextCursor.value = result.nextCursor
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Không tải được ảnh' }
  finally { busy.value = false }
}

async function enter() {
  loading.value = true
  error.value = ''
  try {
    const token = typeof route.query.token === 'string' ? route.query.token : null
    if (token) {
      await $fetch(`${root}/access`, { method: 'POST', body: { token } })
      await navigateTo({ path: route.path }, { replace: true })
    }
    overview.value = (await $fetch<{ album: Overview }>(`${root}/access`)).album
    await loadPhotos()
    await loadSelection()
    if (overview.value.status === 'FINALIZED' || overview.value.status === 'DELIVERED') await loadReview()
    if (import.meta.client) {
      view.value = localStorage.getItem('zeno-gallery-view') === 'list' ? 'list' : 'grid'
      pollTimer = setInterval(() => {
        if (document.visibilityState === 'visible' && !busy.value && !focusPhoto.value) void loadSelection().catch(() => { status.value = 'Mất kết nối đồng bộ. Đang thử lại…' })
      }, 4000)
    }
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Link album không hợp lệ hoặc đã hết hạn' }
  finally { loading.value = false }
}

async function loadReview() {
  review.value = (await $fetch<{ review: typeof review.value }>(`${root}/review`)).review
}

async function sendReview(decision: 'approve' | 'request_revision') {
  if (busy.value) return
  busy.value = true
  try {
    await $fetch(`${root}/review`, { method: 'POST', body: { decision, note: decision === 'request_revision' ? revisionText.value : '' } })
    await loadReview()
    status.value = decision === 'approve' ? 'Đã duyệt ảnh thành phẩm.' : 'Đã gửi yêu cầu sửa.'
  } catch (cause) { status.value = cause instanceof Error ? cause.message : 'Không gửi được phản hồi' }
  finally { busy.value = false }
}

async function join() {
  busy.value = true
  error.value = ''
  try {
    await $fetch(`${root}/join`, { method: 'POST', body: { name: participantName.value } })
    overview.value = (await $fetch<{ album: Overview }>(`${root}/access`)).album
    await loadSelection()
    if (overview.value.status === 'FINALIZED' || overview.value.status === 'DELIVERED') await loadReview()
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Không thể tham gia album' }
  finally { busy.value = false }
}

async function toggle(photo: Photo) {
  if (!overview.value?.participant || overview.value.status !== 'PUBLISHED' || busy.value) return
  busy.value = true
  status.value = 'Đang lưu lựa chọn…'
  const wanted = !selectedIds.value.includes(photo.id)
  try {
    const result = await $fetch<SaveResult>(`${root}/selection/${photo.id}`, { method: 'PUT', body: { selected: wanted, expectedVersion: selectionVersion.value } })
    if (result.status === 'saved') {
      selectedIds.value = wanted ? [...selectedIds.value, photo.id] : selectedIds.value.filter(id => id !== photo.id)
      selectionVersion.value = result.version
      status.value = 'Đã lưu lựa chọn'
    } else {
      await loadSelection()
      status.value = result.status === 'limit_reached' ? `Đã đạt giới hạn ${limitLabel.value}` : 'Lựa chọn đã thay đổi ở thiết bị khác. Đã đồng bộ lại.'
    }
  } catch (cause) { status.value = cause instanceof Error ? cause.message : 'Lưu thất bại. Vui lòng thử lại.' }
  finally { busy.value = false }
}

async function openPhoto(photo: Photo) {
  const request = ++noteReadRequest
  focusPhoto.value = photo
  noteText.value = ''
  noteVersion.value = 0
  noteLoadError.value = false
  noteLoading.value = !!overview.value?.participant
  if (!overview.value?.participant) return
  try {
    const note = await $fetch<{ body: string; version: number }>(`${root}/notes/${photo.id}`)
    if (request !== noteReadRequest || focusPhoto.value?.id !== photo.id) return
    noteText.value = note.body
    noteVersion.value = note.version
  } catch {
    if (request !== noteReadRequest || focusPhoto.value?.id !== photo.id) return
    noteLoadError.value = true
    status.value = 'Không tải được ghi chú. Vui lòng thử lại.'
  } finally {
    if (request === noteReadRequest) noteLoading.value = false
  }
}

function closePhoto() {
  noteReadRequest++
  focusPhoto.value = null
}

async function saveNote() {
  if (!focusPhoto.value || overview.value?.status !== 'PUBLISHED' || busy.value || noteLoading.value || noteLoadError.value) return
  busy.value = true
  const photoId = focusPhoto.value.id
  try {
    const note = await $fetch<{ status: 'saved' | 'conflict'; version: number; body: string }>(`${root}/notes/${photoId}`, { method: 'PUT', body: { text: noteText.value, expectedVersion: noteVersion.value } })
    if (focusPhoto.value?.id !== photoId) return
    noteVersion.value = note.version
    noteText.value = note.body
    status.value = note.status === 'saved' ? 'Đã lưu ghi chú' : 'Ghi chú đã đổi ở thiết bị khác. Đã tải bản mới.'
  } catch (cause) { status.value = cause instanceof Error ? cause.message : 'Lưu ghi chú thất bại' }
  finally { busy.value = false }
}

function setView(value: 'grid' | 'list') {
  view.value = value
  localStorage.setItem('zeno-gallery-view', value)
}

onMounted(() => { void enter() })
onBeforeUnmount(() => { if (pollTimer) clearInterval(pollTimer) })
</script>

<template>
  <div class="min-h-screen bg-[#f8f7f3] text-[#24231f]">
    <header class="sticky top-0 z-20 border-b border-[#e1e4da] bg-[#f8f7f3]/95 px-4 py-4 backdrop-blur sm:px-8">
      <div class="mx-auto flex max-w-7xl items-center justify-between gap-3">
        <NuxtLink to="/" class="font-bold text-[#344732]">Zeno Studio</NuxtLink>
        <span v-if="overview?.participant" class="truncate text-sm text-[#5f705b]">{{ overview.participant.displayName }}</span>
      </div>
    </header>
    <main class="mx-auto max-w-7xl px-4 pb-24 pt-8 sm:px-8">
      <p v-if="loading" role="status">Đang mở album…</p>
      <div v-else-if="error && !overview" role="alert" class="rounded-2xl bg-white p-6 text-red-700">{{ error }}</div>
      <template v-else-if="overview">
        <p class="text-xs font-bold uppercase tracking-[.18em] text-[#718a66]">Album ảnh</p>
        <h1 class="mt-2 text-3xl font-semibold tracking-tight sm:text-5xl">{{ overview.title }}</h1>
        <p class="mt-3 text-sm text-[#687264]">{{ overview.status === 'PUBLISHED' ? `${selectedIds.length} ảnh đã chọn · ${limitLabel}` : overview.status === 'DELIVERED' ? 'Đã bàn giao' : 'Bộ ảnh đã chốt' }} · Hạn {{ new Date(overview.expiresAt).toLocaleDateString('vi-VN') }}</p>
        <section v-if="review" class="mt-7 max-w-2xl rounded-2xl border border-[#d6decf] bg-white p-5">
          <h2 class="text-xl font-semibold">Duyệt ảnh đã chỉnh · Vòng {{ review.roundNumber }}</h2>
          <p class="mt-2 text-sm text-[#687264]">Trạng thái: {{ review.status }}</p>
          <a v-if="review.driveUrl" :href="review.driveUrl" target="_blank" rel="noopener noreferrer" class="mt-3 inline-block font-semibold text-[#344732] underline">Mở ảnh đã chỉnh trên Google Drive ↗</a>
          <a v-if="review.deliveryUrl" :href="review.deliveryUrl" target="_blank" rel="noopener noreferrer" class="mt-3 block font-semibold text-[#344732] underline">Mở album thành phẩm đã bàn giao ↗</a>
          <div v-if="review.status === 'WAITING_REVIEW' && overview.participant" class="mt-5 space-y-3">
            <label class="block text-sm font-semibold">Yêu cầu sửa (nếu có)<textarea v-model="revisionText" maxlength="5000" rows="3" class="mt-2 w-full rounded-xl border p-3 font-normal"></textarea></label>
            <div class="flex flex-wrap gap-2"><button :disabled="busy" class="rounded-full bg-[#344732] px-5 py-2.5 text-sm font-semibold text-white" @click="sendReview('approve')">Duyệt thành phẩm</button><button :disabled="busy || !revisionText.trim()" class="rounded-full border px-5 py-2.5 text-sm font-semibold disabled:opacity-50" @click="sendReview('request_revision')">Yêu cầu sửa</button></div>
          </div>
        </section>
        <form v-if="!overview.participant" class="mt-8 max-w-md rounded-2xl bg-white p-6 shadow-sm" @submit.prevent="join">
          <h2 class="text-xl font-semibold">Bắt đầu chọn ảnh</h2>
          <p class="mt-2 text-sm text-[#697367]">Nhập tên để lưu lựa chọn và ghi chú của bạn.</p>
          <label class="mt-5 block text-sm font-semibold">Tên của bạn<input v-model="participantName" required maxlength="80" class="mt-2 w-full rounded-xl border border-[#cbd4c6] px-4 py-3 font-normal" autocomplete="name"></label>
          <button :disabled="busy" class="mt-4 rounded-full bg-[#344732] px-6 py-3 font-semibold text-white disabled:opacity-50">Vào album</button>
          <p v-if="error" role="alert" class="mt-3 text-sm text-red-700">{{ error }}</p>
        </form>
        <template v-else>
          <div class="mt-8 flex flex-wrap items-center gap-2">
            <button class="rounded-full px-4 py-2 text-sm font-semibold" :class="filter === 'all' ? 'bg-[#344732] text-white' : 'bg-white'" @click="filter = 'all'">Tất cả</button>
            <button class="rounded-full px-4 py-2 text-sm font-semibold" :class="filter === 'selected' ? 'bg-[#344732] text-white' : 'bg-white'" @click="filter = 'selected'">Đã chọn ({{ selectedIds.length }})</button>
            <div class="ml-auto flex gap-2">
              <button class="rounded-full border px-3 py-2 text-sm" :aria-pressed="view === 'grid'" @click="setView('grid')">Lưới</button>
              <button class="rounded-full border px-3 py-2 text-sm" :aria-pressed="view === 'list'" @click="setView('list')">Danh sách</button>
            </div>
          </div>
          <p class="min-h-6 py-2 text-sm text-[#60735b]" role="status" aria-live="polite">{{ status }}</p>
          <div v-if="!visiblePhotos.length" class="rounded-2xl bg-white p-8 text-center text-[#687264]">{{ filter === 'selected' ? 'Chưa có ảnh được chọn.' : 'Album chưa có ảnh có thể hiển thị.' }}</div>
          <div v-else :class="view === 'grid' ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5' : 'space-y-3'">
            <article v-for="photo in visiblePhotos" :key="photo.id" class="overflow-hidden rounded-2xl border border-[#e2e5dc] bg-white">
              <button type="button" class="block w-full" :aria-label="`Mở ảnh ${photo.filename}`" @click="openPhoto(photo)">
                <img :src="`${root}/photos/${photo.id}/image`" :alt="photo.filename" loading="lazy" :class="view === 'grid' ? 'aspect-[.8] w-full object-cover' : 'h-32 w-full object-contain'">
              </button>
              <div class="flex items-center justify-between gap-2 p-3">
                <span class="truncate text-xs" :title="photo.filename">{{ photo.filename }}</span>
                <button v-if="overview.status === 'PUBLISHED'" type="button" :disabled="busy" class="grid size-10 shrink-0 place-items-center rounded-full border text-lg disabled:opacity-50" :class="selectedIds.includes(photo.id) ? 'border-[#b55364] bg-[#fff0f2] text-[#b55364]' : 'border-[#d8ddd3]'" :aria-label="`${selectedIds.includes(photo.id) ? 'Bỏ chọn' : 'Chọn'} ${photo.filename}`" :aria-pressed="selectedIds.includes(photo.id)" @click="toggle(photo)">♥</button>
              </div>
            </article>
          </div>
          <button v-if="nextCursor" :disabled="busy" class="mx-auto mt-8 block rounded-full border border-[#b9c9b5] px-6 py-3 font-semibold" @click="loadPhotos">Tải thêm ảnh</button>
        </template>
      </template>
    </main>
    <div v-if="focusPhoto" class="fixed inset-0 z-30 flex items-end justify-center bg-[#202920]/80 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" :aria-label="focusPhoto.filename">
      <div class="flex max-h-[95vh] w-full max-w-5xl flex-col overflow-auto rounded-t-3xl bg-white sm:flex-row sm:rounded-3xl">
        <div class="min-h-0 flex-1 bg-[#e9ede7]"><img :src="`${root}/photos/${focusPhoto.id}/image`" :alt="focusPhoto.filename" class="max-h-[60vh] w-full object-contain sm:max-h-[85vh]"></div>
        <aside class="w-full p-5 sm:w-80">
          <div class="flex items-start justify-between gap-4"><h2 class="break-all font-semibold">{{ focusPhoto.filename }}</h2><button class="rounded-full border px-3 py-1" aria-label="Đóng ảnh" @click="closePhoto">✕</button></div>
          <button v-if="overview?.status === 'PUBLISHED'" :disabled="busy" class="mt-5 rounded-full border px-4 py-2 text-sm font-semibold" @click="toggle(focusPhoto)">{{ selectedIds.includes(focusPhoto.id) ? '♥ Đã chọn' : '♡ Chọn ảnh' }}</button>
          <label v-if="overview?.status === 'PUBLISHED'" class="mt-7 block text-sm font-semibold">Ghi chú chỉnh sửa<textarea v-model="noteText" :disabled="noteLoading || noteLoadError || busy" maxlength="5000" rows="5" class="mt-2 w-full rounded-xl border border-[#cbd4c6] p-3 font-normal disabled:opacity-50" placeholder="Bạn muốn chỉnh gì ở ảnh này?"></textarea></label>
          <p v-if="noteLoading" class="mt-2 text-sm text-[#687264]" role="status">Đang tải ghi chú…</p>
          <button v-if="noteLoadError" class="mt-3 rounded-full border px-5 py-2.5 text-sm font-semibold" @click="openPhoto(focusPhoto)">Thử tải lại ghi chú</button>
          <button v-if="overview?.status === 'PUBLISHED'" :disabled="busy || noteLoading || noteLoadError" class="mt-3 rounded-full bg-[#344732] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50" @click="saveNote">Lưu ghi chú</button>
        </aside>
      </div>
    </div>
  </div>
</template>
