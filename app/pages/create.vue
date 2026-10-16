<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { studioAlbumErrorMessage } from '~/lib/studio-album-error'

useSeoMeta({ title: 'Tạo album nhanh — Zeno Studio' })
const title = ref('')
const folderUrl = ref('')
const expiresInDays = ref<15 | 30>(15)
const limited = ref(false)
const maxCount = ref(30)
const busy = ref(false)
const hydrated = ref(false)
const error = ref('')
const message = ref('')
const customerLink = ref('')
const adminLink = ref('')
onMounted(() => { hydrated.value = true })

async function create() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  message.value = ''
  try {
    const result = await $fetch<{ id: string; adminToken: string; customerToken: string }>('/api/guest/albums', {
      method: 'POST', body: {
        title: title.value, folderUrl: folderUrl.value, expiresInDays: expiresInDays.value,
        limit: limited.value ? { kind: 'maximum', count: maxCount.value } : { kind: 'unlimited' },
      },
    })
    customerLink.value = `${location.origin}/album/${result.id}?token=${result.customerToken}`
    adminLink.value = `${location.origin}/guest/albums/${result.id}#admin-${result.adminToken}`
    message.value = 'Album đã xuất bản. Hãy lưu link quản trị trước khi rời trang.'
  } catch (cause) { error.value = studioAlbumErrorMessage(cause) }
  finally { busy.value = false }
}

async function copy(link: string, label: string) {
  try { await navigator.clipboard.writeText(link); message.value = `Đã sao chép ${label}.` }
  catch { message.value = `Không sao chép được ${label}. Bạn có thể chọn và sao chép link bên dưới.` }
}
</script>

<template>
  <div class="min-h-screen bg-[#f8f7f3] text-[#24231f]">
    <header class="border-b border-[#e2e5dc] bg-white px-5 py-5"><div class="mx-auto max-w-3xl"><NuxtLink to="/" class="font-bold text-[#344732]">← Zeno Studio</NuxtLink></div></header>
    <main class="mx-auto max-w-3xl px-5 py-10 sm:py-16">
      <p class="text-xs font-bold uppercase tracking-[.18em] text-[#718a66]">Không cần đăng nhập</p>
      <h1 class="mt-3 text-4xl font-semibold">Tạo album nhanh</h1>
      <p class="mt-3 text-[#687264]">Dán folder Google Drive đã bật “Bất kỳ ai có đường liên kết”. Ảnh gốc vẫn nằm trong Drive của bạn.</p>
      <form v-if="!adminLink" class="mt-8 space-y-5 rounded-3xl border border-[#e0e4d9] bg-white p-5 shadow-sm sm:p-8" @submit.prevent="create">
        <label class="block font-semibold">Tên album<input v-model="title" required maxlength="150" class="mt-2 w-full rounded-xl border border-[#cbd4c6] p-3 font-normal" placeholder="Mai & Quang"></label>
        <label class="block font-semibold">Link folder Drive<input v-model="folderUrl" required type="url" class="mt-2 w-full rounded-xl border border-[#cbd4c6] p-3 font-normal" placeholder="https://drive.google.com/drive/folders/..."></label>
        <label class="flex items-center gap-3 font-semibold"><input v-model="limited" type="checkbox" class="size-5"> Giới hạn số ảnh khách chọn</label>
        <label v-if="limited" class="block font-semibold">Số ảnh tối đa<input v-model.number="maxCount" required type="number" min="0" class="mt-2 w-full rounded-xl border border-[#cbd4c6] p-3 font-normal"></label>
        <label class="block font-semibold">Hạn album<select v-model.number="expiresInDays" class="mt-2 w-full rounded-xl border border-[#cbd4c6] p-3 font-normal"><option :value="15">15 ngày</option><option :value="30">30 ngày</option></select></label>
        <button :disabled="busy || !hydrated" class="min-h-11 rounded-full bg-[#344732] px-6 py-3 font-semibold text-white disabled:opacity-50">{{ busy ? 'Đang kiểm tra Drive và tạo album…' : 'Tạo và xuất bản album' }}</button>
        <p v-if="error" role="alert" class="text-sm text-red-700">{{ error }}</p>
      </form>
      <section v-else class="mt-8 space-y-5" aria-label="Link album vừa tạo">
        <p role="status" class="rounded-xl bg-[#edf3e9] p-4 text-[#344732]">{{ message }}</p>
        <div class="rounded-2xl border border-[#e0e4d9] bg-white p-5">
          <h2 class="text-xl font-semibold">Link gửi khách</h2>
          <p class="mt-1 text-sm text-[#687264]">Gửi link này để khách xem, chọn và ghi chú ảnh.</p>
          <a :href="customerLink" target="_blank" rel="noopener noreferrer" class="mt-3 block break-all text-[#344732] underline">{{ customerLink }}</a>
          <button class="mt-4 min-h-11 rounded-full border px-5 font-semibold" @click="copy(customerLink, 'link khách')">Sao chép link khách</button>
        </div>
        <div class="rounded-2xl border border-[#b7c8b2] bg-white p-5">
          <h2 class="text-xl font-semibold">Link quản trị bí mật</h2>
          <p class="mt-1 text-sm text-[#687264]">Chỉ người có link này mới quản lý album. Hãy lưu lại; hiện chưa thể lấy lại nếu mất.</p>
          <a :href="adminLink" class="mt-3 block break-all text-[#344732] underline">{{ adminLink }}</a>
          <button class="mt-4 min-h-11 rounded-full bg-[#344732] px-5 font-semibold text-white" @click="copy(adminLink, 'link quản trị')">Sao chép link quản trị</button>
        </div>
        <a :href="adminLink" class="inline-block font-semibold text-[#344732] underline">Mở trang quản trị album →</a>
      </section>
    </main>
  </div>
</template>
