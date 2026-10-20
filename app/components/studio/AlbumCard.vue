<script setup lang="ts">
import { computed } from 'vue'
import {
  ALBUM_STATUS_LABELS, EXPIRY_WARNING_DAYS, NEXT_STEP_LABELS, daysLeft, effectiveStatus, nextStep,
} from '~~/shared/domain/album-status'
import { STATUS_BADGE_CLASSES, type AlbumManageAction, type StudioAlbum } from '~/lib/studio-album'

const props = defineProps<{ album: StudioAlbum; studioId: string; canPublish: boolean; canShare: boolean; canManage?: boolean }>()
const emit = defineEmits<{ published: []; manage: [action: AlbumManageAction] }>()

const status = computed(() => effectiveStatus(props.album))
const step = computed(() => nextStep({ ...props.album, status: status.value }, { publish: props.canPublish, share: props.canShare }))
const remaining = computed(() => daysLeft(props.album.expiresAt))
const expiring = computed(() => status.value !== 'EXPIRED' && remaining.value <= EXPIRY_WARNING_DAYS)
const expiryText = computed(() => status.value === 'EXPIRED' ? 'Đã hết hạn' : remaining.value <= 1 ? 'Còn dưới 1 ngày' : `Còn ${remaining.value} ngày`)
const sharePrimary = computed(() => step.value.kind === 'publish' || step.value.kind === 'share')
const detailTo = computed(() => `/studio/albums/${props.album.id}?studio=${props.studioId}`)
const resultsTo = computed(() => `/studio/albums/${props.album.id}/results?studio=${props.studioId}`)
const menuItems = computed((): Array<{ key: AlbumManageAction; label: string }> => {
  if (!props.canManage) return []
  const items: Array<{ key: AlbumManageAction; label: string }> = []
  if (status.value !== 'EXPIRED') items.push({ key: 'edit', label: 'Sửa album' })
  items.push(props.album.archivedAt ? { key: 'restore', label: 'Khôi phục' } : { key: 'archive', label: 'Lưu trữ' })
  if (status.value === 'DRAFT') items.push({ key: 'delete', label: 'Xóa bản nháp' })
  return items
})
</script>

<template>
  <article class="flex min-w-0 flex-col rounded-2xl border border-line bg-white p-4 sm:p-5">
    <div class="flex items-start justify-between gap-3">
      <h2 class="min-w-0 break-words text-lg font-semibold leading-snug">{{ album.title }}</h2>
      <span class="shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold" :class="STATUS_BADGE_CLASSES[status]">{{ ALBUM_STATUS_LABELS[status] }}</span>
    </div>
    <p class="mt-1 text-sm text-muted tabular-nums">{{ album.photoCount }} ảnh · {{ album.selectedCount }} đã chọn<template v-if="status !== 'DELIVERED'"> · <span :class="expiring || status === 'EXPIRED' ? 'font-semibold text-danger' : ''">{{ expiryText }}</span></template></p>

    <p class="mt-3 rounded-xl bg-canvas px-3 py-2 text-sm text-pretty text-muted">{{ step.hint }}</p>

    <div class="mt-auto flex flex-wrap items-center gap-2 pt-4">
      <template v-if="!album.archivedAt">
        <UiButton v-if="step.kind === 'finalize'" :to="detailTo" size="sm">{{ NEXT_STEP_LABELS.finalize }}</UiButton>
        <UiButton v-else-if="step.kind === 'results'" :to="resultsTo" size="sm">{{ NEXT_STEP_LABELS.results }}</UiButton>
        <StudioAlbumShareActions compact :album-title="album.title" :primary="sharePrimary" :studio-id="studioId" :album-id="album.id" :status="status" :can-publish="canPublish" :can-share="canShare" @published="emit('published')" />
      </template>
      <UiButton v-if="album.archivedAt || step.kind !== 'finalize'" :to="detailTo" variant="secondary" size="sm">Chi tiết</UiButton>
      <UiMenu v-if="menuItems.length" icon-only class="ml-auto" :label="`Tùy chọn ${album.title}`" :items="menuItems" @select="emit('manage', $event)" />
    </div>
  </article>
</template>
