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
  DRAFT: 'bg-skeleton text-muted',
  PUBLISHED: 'bg-tint text-brand',
  FINALIZED: 'bg-brand text-white',
  DELIVERED: 'bg-brand-soft/25 text-brand',
  EXPIRED: 'bg-danger-soft text-danger',
}
</script>

<template>
  <article class="flex min-w-0 flex-col gap-3 rounded-2xl border border-line bg-white p-4 sm:gap-4 sm:p-5">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <h2 class="break-words text-lg font-semibold leading-snug">{{ album.title }}</h2>
        <p class="mt-1 text-sm text-muted tabular-nums">{{ album.photoCount }} ảnh<template v-if="status !== 'DELIVERED'"> · <span :class="expiring || status === 'EXPIRED' ? 'font-semibold text-danger' : ''">{{ expiryText }}</span></template></p>
      </div>
      <span class="shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold" :class="BADGES[status]">{{ ALBUM_STATUS_LABELS[status] }}</span>
    </div>

    <p class="text-sm text-pretty text-muted">{{ step.hint }}</p>

    <div class="mt-auto flex flex-wrap items-center gap-2 border-t border-line pt-3 sm:pt-4">
      <StudioAlbumShareActions v-if="sharePrimary" :studio-id="studioId" :album-id="album.id" :status="status" :can-publish="canPublish" :can-share="canShare" primary @published="emit('published')" />
      <UiButton v-if="step.kind === 'finalize'" :to="detailTo" size="sm">{{ NEXT_STEP_LABELS.finalize }}</UiButton>
      <UiButton v-else-if="step.kind === 'results'" :to="resultsTo" size="sm">{{ NEXT_STEP_LABELS.results }}</UiButton>
      <UiButton v-if="step.kind !== 'finalize'" :to="detailTo" variant="secondary" size="sm">Chi tiết</UiButton>
      <StudioAlbumShareActions v-if="!sharePrimary" :studio-id="studioId" :album-id="album.id" :status="status" :can-publish="canPublish" :can-share="canShare" />
    </div>
  </article>
</template>
