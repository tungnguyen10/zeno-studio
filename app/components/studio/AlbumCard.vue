<script setup lang="ts">
import { computed } from 'vue'
import {
  ALBUM_STATUS_LABELS, EXPIRY_WARNING_DAYS, NEXT_STEP_LABELS, daysLeft, effectiveStatus, nextStep,
  type AlbumStatus,
} from '~~/shared/domain/album-status'
import type { StudioAlbum } from '~/lib/studio-album'

const props = defineProps<{ album: StudioAlbum; studioId: string; canPublish: boolean; canShare: boolean }>()
const emit = defineEmits<{ published: [] }>()

const status = computed(() => effectiveStatus(props.album))
const step = computed(() => nextStep({ ...props.album, status: status.value }, { publish: props.canPublish, share: props.canShare }))
const remaining = computed(() => daysLeft(props.album.expiresAt))
const expiring = computed(() => status.value !== 'EXPIRED' && remaining.value <= EXPIRY_WARNING_DAYS)
const expiryText = computed(() => status.value === 'EXPIRED' ? 'Đã hết hạn' : remaining.value <= 1 ? 'Còn dưới 1 ngày' : `Còn ${remaining.value} ngày`)
const sharePrimary = computed(() => step.value.kind === 'publish' || step.value.kind === 'share')
const detailTo = computed(() => `/studio/albums/${props.album.id}?studio=${props.studioId}`)
const resultsTo = computed(() => `/studio/albums/${props.album.id}/results?studio=${props.studioId}`)

const BADGES: Record<AlbumStatus, string> = {
  DRAFT: 'bg-[#eceee8] text-[#555d51]',
  PUBLISHED: 'bg-[#e4efe0] text-brand',
  FINALIZED: 'bg-brand text-white',
  DELIVERED: 'bg-[#d3e6cd] text-brand',
  EXPIRED: 'bg-[#f6e3e0] text-[#9a3a2e]',
}

const linkBase = 'inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'
const primaryLink = `${linkBase} bg-brand text-white`
const secondaryLink = `${linkBase} border border-[#b8c8b3] bg-white text-brand hover:bg-tint`
</script>

<template>
  <article class="flex flex-col gap-4 rounded-2xl border border-line bg-white p-4 sm:p-5">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <h2 class="break-words text-lg font-semibold leading-snug">{{ album.title }}</h2>
        <p class="mt-1 text-sm text-muted">{{ album.photoCount }} ảnh<template v-if="status !== 'DELIVERED'"> · <span :class="expiring || status === 'EXPIRED' ? 'font-semibold text-[#9a3a2e]' : ''">{{ expiryText }}</span></template></p>
      </div>
      <span class="shrink-0 rounded-full px-3 py-1 text-xs font-semibold" :class="BADGES[status]">{{ ALBUM_STATUS_LABELS[status] }}</span>
    </div>

    <p class="text-sm text-[#4f5d4b]">{{ step.hint }}</p>

    <div class="mt-auto flex flex-wrap items-center gap-2 border-t border-line pt-4">
      <StudioAlbumShareActions v-if="sharePrimary" :studio-id="studioId" :album-id="album.id" :status="status" :can-publish="canPublish" :can-share="canShare" primary @published="emit('published')" />
      <NuxtLink v-if="step.kind === 'finalize'" :to="detailTo" :class="primaryLink">{{ NEXT_STEP_LABELS.finalize }}</NuxtLink>
      <NuxtLink v-else-if="step.kind === 'results'" :to="resultsTo" :class="primaryLink">{{ NEXT_STEP_LABELS.results }}</NuxtLink>
      <NuxtLink v-if="step.kind !== 'finalize'" :to="detailTo" :class="secondaryLink">Chi tiết</NuxtLink>
      <StudioAlbumShareActions v-if="!sharePrimary" :studio-id="studioId" :album-id="album.id" :status="status" :can-publish="canPublish" :can-share="canShare" />
    </div>
  </article>
</template>
