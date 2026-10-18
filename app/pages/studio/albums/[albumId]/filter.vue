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
  <div class="min-h-screen bg-[#f8f7f3] text-[#24231f]">
    <header class="border-b bg-white px-5 py-5"><div class="mx-auto max-w-6xl"><NuxtLink :to="`/studio/albums/${albumId}/results?studio=${studioId}`" class="font-semibold text-[#344732]">← Ảnh đã chốt</NuxtLink></div></header>
    <main class="mx-auto max-w-6xl px-5 py-10">
      <p class="text-xs font-bold uppercase tracking-[.18em] text-[#718a66]">Local Photo Filter</p>
      <h1 class="mt-2 text-4xl font-semibold">Lọc ảnh gốc</h1>
      <ClientOnly>
        <p v-if="status === 'pending'" class="mt-6" role="status">Đang tải bộ ảnh đã chốt…</p>
        <p v-else-if="error" class="mt-6 text-red-700" role="alert">Không tải được bộ ảnh đã chốt: {{ error.statusMessage || error.message }}</p>
        <AlbumLocalFilter v-else-if="manifest" :manifest="manifest" />
        <template #fallback><p class="mt-6" role="status">Đang tải bộ ảnh đã chốt…</p></template>
      </ClientOnly>
    </main>
  </div>
</template>
