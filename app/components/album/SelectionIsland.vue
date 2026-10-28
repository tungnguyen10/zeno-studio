<script setup lang="ts">
import type { DownloadCapabilities } from '~~/shared/domain/download-policy'

const props = defineProps<{
  canSelect: boolean
  selectedCount: number
  status: string
  limitHint: string
  filterSelected: boolean
  download?: DownloadCapabilities
  basketCount: number
}>()
const emit = defineEmits<{ download: []; toggleFilter: [] }>()
const canDownload = computed(() => !!props.download && (props.download.canSelected || props.download.canAll))
const visible = computed(() => props.canSelect || canDownload.value)
const count = computed(() => props.status === 'PUBLISHED' ? props.selectedCount : props.download?.selectedCount ?? 0)
</script>

<template>
  <div v-if="visible" class="pointer-events-auto flex w-full max-w-md items-center gap-1.5 rounded-full bg-brand py-1.5 pl-2 pr-1.5 text-white shadow-xl ring-1 ring-white/10">
    <span aria-hidden="true" class="grid size-10 shrink-0 place-items-center rounded-full bg-white/10">
      <svg v-if="status === 'PUBLISHED'" viewBox="0 0 20 20" fill="currentColor" class="size-5 text-heart"><path d="M10 17.3 8.8 16.2C4.6 12.4 2 10 2 7.1 2 4.7 3.9 2.8 6.3 2.8c1.4 0 2.7.6 3.7 1.7 1-1.1 2.3-1.7 3.7-1.7C16.1 2.8 18 4.7 18 7.1c0 2.9-2.6 5.3-6.8 9.1L10 17.3Z" /></svg>
      <svg v-else viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-5"><path d="m5 10.5 3 3 7-7" /></svg>
    </span>
    <p class="min-w-0 flex-1 pl-1 leading-tight">
      <span class="block truncate text-sm font-semibold tabular-nums">{{ status === 'PUBLISHED' ? `${count} ảnh đã chọn` : `${count} ảnh đã chốt` }}</span>
      <span v-if="basketCount" class="block truncate text-xs text-white/80 tabular-nums">{{ basketCount }} ảnh trong giỏ tải</span>
      <span v-else-if="limitHint && canSelect" class="block truncate text-xs text-white/75">{{ limitHint }}</span>
    </p>
    <button
      v-if="canSelect"
      type="button"
      class="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-semibold ring-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transition-none"
      :class="filterSelected ? 'bg-white/20 ring-white/60' : 'ring-white/30 hover:bg-white/10'"
      :aria-label="filterSelected ? 'Xem tất cả' : 'Xem ảnh đã chọn'"
      :aria-pressed="filterSelected"
      @click="emit('toggleFilter')"
    >
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" class="size-4 shrink-0">
        <path v-if="filterSelected" d="M3.5 5h13M3.5 10h13M3.5 15h13" />
        <path v-else d="M3.5 5h13l-5 6v4.5l-3 1.5v-6l-5-6Z" stroke-linejoin="round" />
      </svg>
      <span class="hidden min-[400px]:inline">{{ filterSelected ? 'Xem tất cả' : 'Xem ảnh đã chọn' }}</span>
    </button>
    <button
      v-if="canDownload"
      type="button"
      class="relative inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-white pl-3 pr-4 text-sm font-semibold text-brand transition-colors hover:bg-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transition-none"
      @click="emit('download')"
    >
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="size-4 shrink-0"><path d="M10 3.5v9M6 9l4 4 4-4M4 16.5h12" /></svg>
      Tải xuống
    </button>
  </div>
</template>
