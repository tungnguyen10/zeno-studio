<script setup lang="ts">
import { computed } from 'vue'
import { ALBUM_STATUS_LABELS, EXPIRY_WARNING_DAYS, NEXT_STEP_LABELS, daysLeft, effectiveStatus, nextStep } from '~~/shared/domain/album-status'
import { STATUS_BADGE_CLASSES, type AlbumManageAction, type StudioAlbum } from '~/lib/studio-album'

const props = defineProps<{ albums: StudioAlbum[]; studioId: string; canManage: boolean; canShare: boolean }>()
const emit = defineEmits<{ published: []; manage: [action: AlbumManageAction, album: StudioAlbum] }>()

const rows = computed(() => props.albums.map(album => {
  const status = effectiveStatus(album)
  const remaining = daysLeft(album.expiresAt)
  return {
    album,
    status,
    step: nextStep({ ...album, status }, { publish: props.canManage, share: props.canShare }),
    remaining,
    expiring: status !== 'EXPIRED' && remaining <= EXPIRY_WARNING_DAYS,
    menu: props.canManage ? [
      ...(status !== 'EXPIRED' ? [{ key: 'edit' as const, label: 'Sửa album' }] : []),
      album.archivedAt ? { key: 'restore' as const, label: 'Khôi phục' } : { key: 'archive' as const, label: 'Lưu trữ' },
      ...(status === 'DRAFT' ? [{ key: 'delete' as const, label: 'Xóa bản nháp' }] : []),
    ] : [],
  }
}))
</script>

<template>
  <div class="overflow-x-auto rounded-2xl border border-line bg-white">
    <table class="w-full min-w-[56rem] text-left text-sm">
      <thead class="border-b border-line bg-tint text-xs font-semibold text-muted">
        <tr>
          <th scope="col" class="px-5 py-3">Album</th>
          <th scope="col" class="px-4 py-3">Ảnh</th>
          <th scope="col" class="px-4 py-3">Trạng thái</th>
          <th scope="col" class="px-4 py-3">Hạn</th>
          <th scope="col" class="px-5 py-3 text-right">Thao tác</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-line">
        <tr v-for="row in rows" :key="row.album.id" class="align-middle transition-colors hover:bg-canvas">
          <th scope="row" class="min-w-48 break-words px-5 py-4 text-left font-semibold leading-snug">{{ row.album.title }}</th>
          <td class="whitespace-nowrap px-4 py-4 tabular-nums">
            <span class="block">{{ row.album.photoCount }} ảnh</span>
            <span class="text-xs text-muted">{{ row.album.selectedCount }} đã chọn</span>
          </td>
          <td class="px-4 py-4">
            <span class="inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold" :class="STATUS_BADGE_CLASSES[row.status]">{{ ALBUM_STATUS_LABELS[row.status] }}</span>
            <span class="mt-1 block max-w-64 text-xs text-pretty text-muted">{{ row.step.hint }}</span>
          </td>
          <td class="whitespace-nowrap px-4 py-4 tabular-nums">
            <span class="block" :class="row.expiring || row.status === 'EXPIRED' ? 'font-semibold text-danger' : ''">{{ row.status === 'EXPIRED' ? 'Đã hết hạn' : row.remaining <= 1 ? 'Còn dưới 1 ngày' : `Còn ${row.remaining} ngày` }}</span>
            <span class="text-xs text-muted">{{ new Date(row.album.expiresAt).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) }}</span>
          </td>
          <td class="px-5 py-3">
            <div class="flex flex-wrap items-center justify-end gap-2">
              <template v-if="!row.album.archivedAt">
                <UiButton v-if="row.step.kind === 'finalize'" :to="`/studio/albums/${row.album.id}?studio=${studioId}`" size="sm">{{ NEXT_STEP_LABELS.finalize }}</UiButton>
                <UiButton v-else-if="row.step.kind === 'results'" :to="`/studio/albums/${row.album.id}/results?studio=${studioId}`" size="sm">{{ NEXT_STEP_LABELS.results }}</UiButton>
                <StudioAlbumShareActions compact :album-title="row.album.title" :primary="row.step.kind === 'publish' || row.step.kind === 'share'" :studio-id="studioId" :album-id="row.album.id" :status="row.status" :can-publish="canManage" :can-share="canShare" @published="emit('published')" />
              </template>
              <UiButton v-if="row.album.archivedAt || row.step.kind !== 'finalize'" :to="`/studio/albums/${row.album.id}?studio=${studioId}`" variant="secondary" size="sm">Chi tiết</UiButton>
              <UiMenu v-if="row.menu.length" icon-only :label="`Tùy chọn ${row.album.title}`" :items="row.menu" @select="emit('manage', $event, row.album)" />
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
