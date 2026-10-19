<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { authClient } from '~/lib/auth-client'
import { studioAlbumErrorMessage } from '~/lib/studio-album-error'

const route = useRoute()
const albumId = String(route.params.albumId)
const apiRoot = `/api/guest/albums/${albumId}`
const ready = ref(false)
const busy = ref(false)
const error = ref('')
const message = ref('')
const customerLink = ref('')
const adminLink = ref('')
useSeoMeta({ title: 'Quản trị album — Zeno Studio' })

onMounted(async () => {
  try {
    const token = /^#admin-([A-Za-z0-9_-]{43})$/.exec(location.hash)?.[1]
    if (token) {
      await $fetch(`${apiRoot}/access`, { method: 'POST', body: { token } })
      adminLink.value = `${location.origin}${route.path}#admin-${token}`
      history.replaceState(history.state, '', `${location.pathname}${location.search}`)
    }
    await $fetch(apiRoot)
    ready.value = true
  } catch (cause) { error.value = studioAlbumErrorMessage(cause) }
})

async function share() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    const result = await $fetch<{ customerToken: string }>(`${apiRoot}/share`, { method: 'POST' })
    customerLink.value = `${location.origin}/album/${albumId}?token=${result.customerToken}`
    message.value = 'Đã cấp link khách mới. Các link khách trước đó vẫn còn hiệu lực.'
  } catch (cause) { error.value = studioAlbumErrorMessage(cause) }
  finally { busy.value = false }
}

async function copy(link: string) {
  try { await navigator.clipboard.writeText(link); message.value = 'Đã sao chép link.' }
  catch { message.value = 'Không sao chép được. Bạn có thể chọn và sao chép link bên dưới.' }
}

async function claim() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    const session = await authClient.getSession()
    if (!session.data?.user) {
      await navigateTo(`/studio?next=${encodeURIComponent(route.path)}`)
      return
    }
    let studios = (await $fetch<{ studios: Array<{ id: string; role: string }> }>('/api/studio')).studios
    let owned = studios.find(studio => studio.role === 'owner')
    if (!owned) {
      owned = (await $fetch<{ studio: { id: string; role: string } }>('/api/studio/bootstrap', { method: 'POST' })).studio
    }
    const claimed = await $fetch<{ studioId: string }>(`${apiRoot}/claim`, { method: 'POST', body: { studioId: owned.id } })
    await navigateTo(`/studio/albums/${albumId}?studio=${claimed.studioId}`)
  } catch (cause) { error.value = studioAlbumErrorMessage(cause) }
  finally { busy.value = false }
}
</script>

<template>
  <div class="bg-canvas text-ink">
    <section class="mx-auto max-w-5xl px-4 pt-6 sm:px-5 sm:pt-10">
      <p class="text-xs font-bold uppercase tracking-[.18em] text-brand-soft">Quản trị bằng link bí mật</p>
      <h1 class="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Album của bạn</h1>
      <div v-if="!ready && !error" role="status" aria-busy="true" aria-label="Đang kiểm tra link quản trị" class="surface mt-5 p-4 sm:mt-6 sm:p-5">
        <UiSkeleton class="h-4 w-full max-w-lg" />
        <UiSkeleton class="mt-2 h-4 w-2/3" />
        <div class="mt-4 flex flex-wrap gap-3">
          <UiSkeleton class="h-11 w-44 rounded-full" />
          <UiSkeleton class="h-11 w-52 rounded-full" />
        </div>
        <span class="sr-only">Đang kiểm tra link quản trị…</span>
      </div>
      <UiNotice v-if="error" tone="error" class="mt-5">{{ error }}</UiNotice>
      <div v-if="ready" class="surface mt-5 p-4 sm:mt-6 sm:p-5">
        <p class="text-sm text-pretty text-muted">Link quản trị cho phép xem kết quả và quản lý album. Hãy giữ link này riêng tư.</p>
        <div class="mt-4 grid gap-2 sm:flex sm:flex-wrap sm:gap-3">
          <UiButton :disabled="busy" @click="share">Cấp link khách mới</UiButton>
          <UiButton variant="secondary" :disabled="busy" @click="claim">Nhận album vào tài khoản</UiButton>
        </div>
        <p v-if="message" role="status" class="mt-4 text-sm text-brand">{{ message }}</p>
        <div v-if="customerLink" class="mt-4 rounded-xl bg-tint p-4">
          <p class="font-semibold">Link khách</p><a :href="customerLink" target="_blank" rel="noopener noreferrer" translate="no" class="focus-ring mt-2 block rounded break-all text-sm text-brand underline">{{ customerLink }}</a>
          <UiButton variant="secondary" size="sm" class="mt-3" @click="copy(customerLink)">Sao chép link khách</UiButton>
        </div>
        <div v-if="adminLink" class="mt-4 rounded-xl bg-tint p-4">
          <p class="font-semibold">Lưu link quản trị</p><p class="mt-1 text-sm">Không thể khôi phục link này trước khi nhận album vào tài khoản.</p>
          <a :href="adminLink" translate="no" class="focus-ring mt-2 block rounded break-all text-sm text-brand underline">{{ adminLink }}</a>
          <UiButton variant="secondary" size="sm" class="mt-3" @click="copy(adminLink)">Sao chép link quản trị</UiButton>
        </div>
      </div>
    </section>
    <AlbumWorkspace v-if="ready" :api-root="apiRoot" back-to="/" :results-to="`/guest/albums/${albumId}/results`" />
  </div>
</template>
