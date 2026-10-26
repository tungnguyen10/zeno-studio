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
  <div v-if="visible" class="pointer-events-auto flex w-full max-w-sm items-center gap-2 rounded-full bg-brand py-1.5 pl-5 pr-1.5 text-white shadow-lg">
    <p class="min-w-0 flex-1 leading-tight">
      <span class="block text-sm font-semibold tabular-nums">{{ status === 'PUBLISHED' ? `♥ ${count} ảnh đã chọn` : `${count} ảnh đã chốt` }}</span>
      <span v-if="basketCount" class="block text-xs text-white/80">{{ basketCount }} ảnh trong giỏ tải</span>
      <span v-else-if="limitHint && canSelect" class="block truncate text-xs text-white/75">{{ limitHint }}</span>
    </p>
    <button v-if="canSelect" type="button" class="min-h-11 shrink-0 rounded-full bg-white px-3 text-xs font-semibold text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" :aria-pressed="filterSelected" @click="emit('toggleFilter')">{{ filterSelected ? 'Xem tất cả' : 'Xem ảnh đã chọn' }}</button>
    <button v-if="canDownload" type="button" class="min-h-11 shrink-0 rounded-full bg-white px-4 text-sm font-semibold text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white" @click="emit('download')">Tải xuống</button>
  </div>
</template>
