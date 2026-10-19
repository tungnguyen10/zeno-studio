<script setup lang="ts">
import type { FilterManifest } from '~~/app/composables/useLocalPhotoFilter'

const route = useRoute()
const albumId = String(route.params.albumId)
const studioId = typeof route.query.studio === 'string' ? route.query.studio : ''
const versionId = typeof route.query.version === 'string' ? route.query.version : ''
const apiRoot = `/api/studio/${studioId}/albums/${albumId}`
const { data: manifest, error, status } = useFetch<FilterManifest>(`${apiRoot}/selections/${versionId}/filter-manifest`, { server: false })
useSeoMeta({ title: 'Lọc ảnh gốc — Zeno Studio' })
</script>

<template>
  <div class="min-h-dvh bg-canvas text-ink">
    <header class="sticky top-0 z-20 border-b border-line bg-canvas/95 px-4 backdrop-blur sm:px-5"><div class="mx-auto flex h-16 max-w-6xl items-center"><NuxtLink :to="`/studio/albums/${albumId}/results?studio=${studioId}`" class="focus-ring -ml-2 inline-flex min-h-11 items-center gap-1 rounded-full px-2 font-semibold text-brand hover:bg-tint">← Ảnh đã chốt</NuxtLink></div></header>
    <main class="mx-auto max-w-6xl px-4 pt-6 pb-[max(2.5rem,env(safe-area-inset-bottom))] sm:px-5 sm:py-10">
      <p class="text-xs font-bold uppercase tracking-[.18em] text-brand-soft">Local Photo Filter</p>
      <h1 class="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Lọc ảnh gốc</h1>
      <ClientOnly>
        <p v-if="status === 'pending'" class="mt-6 text-muted" role="status">Đang tải bộ ảnh đã chốt…</p>
        <UiNotice v-else-if="error" tone="error" class="mt-6">Không tải được bộ ảnh đã chốt: {{ error.statusMessage || error.message }}</UiNotice>
        <AlbumLocalFilter v-else-if="manifest" :manifest="manifest" />
        <template #fallback><p class="mt-6 text-muted" role="status">Đang tải bộ ảnh đã chốt…</p></template>
      </ClientOnly>
    </main>
  </div>
</template>
