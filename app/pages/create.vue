<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { studioAlbumErrorMessage } from '~/lib/studio-album-error'
import { publicPage } from '~~/shared/site'

const createPage = publicPage('/create')
useSeoMeta({ title: createPage.title, description: createPage.description, ogTitle: createPage.title, ogDescription: createPage.description })
const title = ref('')
const folderUrl = ref('')
const expiresInDays = ref<15 | 30>(15)
const durationOptions = [{ value: 15, label: '15 ngày' }, { value: 30, label: '30 ngày' }] as const
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
  <div class="min-h-dvh bg-canvas text-ink">
    <SiteHeader width="3xl">
      <NuxtLink to="/studio" class="focus-ring inline-flex min-h-11 items-center rounded-full border border-line-strong px-4 transition-colors hover:border-brand">Vào studio</NuxtLink>
    </SiteHeader>
    <main class="mx-auto max-w-3xl px-4 pt-6 pb-[max(2.5rem,env(safe-area-inset-bottom))] sm:px-5 sm:py-16">
      <p class="text-xs font-bold uppercase tracking-[.18em] text-brand-soft">Không cần đăng nhập</p>
      <h1 class="mt-2 text-3xl font-semibold tracking-tight text-balance sm:mt-3 sm:text-4xl">Tạo album nhanh</h1>
      <p class="mt-2 text-pretty text-muted sm:mt-3">Dán folder Google Drive đã bật “Bất kỳ ai có đường liên kết”. Ảnh gốc vẫn nằm trong Drive của bạn.</p>
      <form v-if="!adminLink" class="mt-6 space-y-5 rounded-3xl border border-line bg-white p-4 shadow-sm sm:mt-8 sm:p-8" @submit.prevent="create">
        <AlbumDriveShareGuide open after-create="Tạo xong bạn nhận 2 link: link gửi khách và link quản trị bí mật — hãy lưu link quản trị, vì không lấy lại được nếu mất." />
        <label class="block font-semibold">Tên album<UiInput v-model="title" required maxlength="150" name="album-title" autocomplete="off" class="mt-2" placeholder="Mai & Quang…" /></label>
        <label class="block font-semibold">Link folder Drive<UiInput v-model="folderUrl" required type="url" inputmode="url" name="folder-url" autocomplete="off" spellcheck="false" class="mt-2" placeholder="https://drive.google.com/drive/folders/…" /></label>
        <label class="flex min-h-11 cursor-pointer items-center gap-3 font-semibold"><input v-model="limited" type="checkbox" name="limited" class="focus-ring size-5 accent-brand"> Giới hạn số ảnh khách chọn</label>
        <label v-if="limited" class="block font-semibold">Số ảnh tối đa<UiInput v-model="maxCount" required type="number" min="0" inputmode="numeric" name="max-count" class="mt-2" /></label>
        <label class="block font-semibold">Hạn album<UiSelect v-model="expiresInDays" label="Hạn album" name="expires-in" :options="durationOptions" class="mt-2" /></label>
        <UiButton type="submit" class="w-full sm:w-auto" :disabled="!hydrated" :loading="busy">{{ busy ? 'Đang kiểm tra Drive và tạo album…' : 'Tạo và xuất bản album' }}</UiButton>
        <p v-if="error" role="alert" class="text-sm text-danger">{{ error }}</p>
      </form>
      <section v-else class="mt-6 space-y-4 sm:mt-8 sm:space-y-5" aria-label="Link album vừa tạo">
        <p role="status" class="rounded-xl bg-tint p-4 text-brand">{{ message }}</p>
        <div class="surface p-4 sm:p-5">
          <h2 class="text-lg font-semibold sm:text-xl">Link gửi khách</h2>
          <p class="mt-1 text-sm text-muted">Gửi link này để khách xem, chọn và ghi chú ảnh.</p>
          <a :href="customerLink" target="_blank" rel="noopener noreferrer" translate="no" class="focus-ring mt-3 block rounded break-all text-sm text-brand underline">{{ customerLink }}</a>
          <UiButton variant="secondary" class="mt-4 w-full sm:w-auto" @click="copy(customerLink, 'link khách')">Sao chép link khách</UiButton>
        </div>
        <div class="rounded-2xl border border-line-strong bg-white p-4 sm:p-5">
          <h2 class="text-lg font-semibold sm:text-xl">Link quản trị bí mật</h2>
          <p class="mt-1 text-sm text-pretty text-muted">Chỉ người có link này mới quản lý album. Hãy lưu lại; hiện chưa thể lấy lại nếu mất.</p>
          <a :href="adminLink" translate="no" class="focus-ring mt-3 block rounded break-all text-sm text-brand underline">{{ adminLink }}</a>
          <UiButton class="mt-4 w-full sm:w-auto" @click="copy(adminLink, 'link quản trị')">Sao chép link quản trị</UiButton>
        </div>
        <a :href="adminLink" class="focus-ring inline-flex min-h-11 items-center rounded font-semibold text-brand underline">Mở trang quản trị album <span aria-hidden="true">&nbsp;→</span></a>
      </section>
    </main>
    <SiteFooter />
  </div>
</template>
