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
const createdTitle = ref('')
const afterCreate = 'Tạo xong bạn nhận 2 link: link gửi khách và link quản trị bí mật — hãy lưu link quản trị, vì không lấy lại được nếu mất.'
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
    createdTitle.value = title.value
  } catch (cause) { error.value = studioAlbumErrorMessage(cause) }
  finally { busy.value = false }
}

async function copy(link: string, label: string) {
  try { await navigator.clipboard.writeText(link); message.value = `Đã sao chép ${label}.` }
  catch { message.value = `Không sao chép được ${label}. Bạn có thể mở link ở trên và sao chép trực tiếp.` }
}
</script>

<template>
  <div class="min-h-dvh bg-canvas text-ink">
    <SiteHeader width="6xl">
      <NuxtLink to="/studio" class="focus-ring inline-flex min-h-11 items-center rounded-full border border-line-strong px-4 transition-colors hover:border-brand">Vào studio</NuxtLink>
    </SiteHeader>
    <main class="mx-auto max-w-6xl px-4 pt-5 pb-[max(2.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:pt-8 lg:px-8">
      <UiPageHeader title="Tạo album nhanh" description="Không cần đăng nhập. Dán folder Google Drive đã bật “Bất kỳ ai có đường liên kết” — ảnh gốc vẫn nằm trong Drive của bạn." />
      <div v-if="!adminLink" class="mt-5 grid items-start gap-5 sm:mt-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-8">
        <form class="space-y-4 rounded-3xl border border-line bg-white p-4 shadow-sm sm:p-6" @submit.prevent="create">
          <AlbumDriveShareGuide class="lg:hidden" :after-create="afterCreate" />
          <label class="block text-sm font-semibold">Tên album<UiInput v-model="title" required maxlength="150" name="album-title" autocomplete="off" class="mt-1.5" placeholder="Mai & Quang…" /></label>
          <label class="block text-sm font-semibold">Link folder Drive<UiInput v-model="folderUrl" required type="url" inputmode="url" name="folder-url" autocomplete="off" spellcheck="false" class="mt-1.5" placeholder="https://drive.google.com/drive/folders/…" /></label>
          <div class="grid items-start gap-3 min-[380px]:grid-cols-2">
            <div>
              <label class="block text-sm font-semibold">Tối đa ảnh chọn<UiInput v-model="maxCount" :required="limited" :disabled="!limited" type="number" min="0" inputmode="numeric" name="max-count" class="mt-1.5 disabled:opacity-50" /></label>
              <label class="mt-1 flex min-h-11 cursor-pointer items-center gap-2 text-sm"><input v-model="limited" :true-value="false" :false-value="true" type="checkbox" name="unlimited" class="focus-ring size-5 accent-brand"> Không giới hạn</label>
            </div>
            <label class="block text-sm font-semibold">Hạn album<UiSelect v-model="expiresInDays" label="Hạn album" name="expires-in" :options="durationOptions" class="mt-1.5" /></label>
          </div>
          <UiNotice v-if="error" tone="error">{{ error }}</UiNotice>
          <div class="flex pt-1 sm:justify-end">
            <UiButton type="submit" class="w-full sm:w-auto" :disabled="!hydrated" :loading="busy">{{ busy ? 'Đang kiểm tra Drive và tạo album…' : 'Tạo và xuất bản album' }}</UiButton>
          </div>
        </form>
        <aside class="hidden lg:sticky lg:top-24 lg:block">
          <AlbumDriveShareGuide open :after-create="afterCreate" />
        </aside>
      </div>
      <section v-else class="mt-5 space-y-4 sm:mt-6" aria-label="Link album vừa tạo">
        <div class="flex min-w-0 items-center gap-3 rounded-2xl bg-tint p-4 text-sm">
          <span aria-hidden="true" class="grid size-10 shrink-0 place-items-center rounded-full bg-brand text-white">
            <svg viewBox="0 0 20 20" fill="currentColor" class="size-5"><path fill-rule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.58l7.3-7.3a1 1 0 0 1 1.4 0Z" clip-rule="evenodd" /></svg>
          </span>
          <div class="min-w-0">
            <p class="break-words font-semibold">{{ createdTitle }}</p>
            <p class="mt-0.5 text-muted">Album đã xuất bản. Hãy lưu link quản trị trước khi rời trang.</p>
          </div>
        </div>
        <div class="grid gap-4 lg:grid-cols-2">
          <div class="rounded-2xl border border-line bg-white p-4 sm:p-5">
            <h2 class="text-base font-semibold sm:text-lg">Link gửi khách</h2>
            <p class="mt-1 text-sm text-pretty text-muted">Gửi link này để khách xem, chọn và ghi chú ảnh.</p>
            <StudioAlbumShareLink :link="customerLink" copy-label="Sao chép link khách" class="mt-3" @copy="copy(customerLink, 'link khách')" />
          </div>
          <div class="rounded-2xl border border-line-strong bg-white p-4 sm:p-5">
            <h2 class="text-base font-semibold sm:text-lg">Link quản trị bí mật</h2>
            <p class="mt-1 text-sm text-pretty text-muted">Chỉ người có link này mới quản lý album. Hãy lưu lại; hiện chưa thể lấy lại nếu mất.</p>
            <StudioAlbumShareLink :link="adminLink" label="Link quản trị" copy-label="Sao chép link quản trị" class="mt-3" @copy="copy(adminLink, 'link quản trị')" />
          </div>
        </div>
        <p role="status" class="text-sm text-brand">{{ message }}</p>
        <div class="flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
          <UiButton :href="adminLink" variant="secondary">Mở trang quản trị album</UiButton>
        </div>
      </section>
    </main>
    <SiteFooter width="6xl" />
  </div>
</template>
