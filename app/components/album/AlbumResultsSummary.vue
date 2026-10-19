<script setup lang="ts">
import { computed } from 'vue'
import type { ResultSummary } from '~/lib/album-results'

const props = defineProps<{
  summary: ResultSummary
}>()

const finalizedLabel = computed(() => new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(props.summary.finalizedAt)))
</script>

<template>
  <div class="surface mt-4 p-4 shadow-sm sm:mt-5 sm:rounded-3xl sm:p-6">
    <div class="min-w-0">
      <p class="text-xs font-bold uppercase tracking-[.16em] text-brand-soft">Bộ ảnh đã chốt</p>
      <ul class="mt-3 flex flex-wrap gap-2 text-sm font-medium tabular-nums">
        <li class="rounded-full bg-tint px-3 py-1.5">Phiên bản {{ summary.versionNumber }}</li>
        <li class="rounded-full bg-tint px-3 py-1.5">{{ summary.total }} ảnh</li>
        <li class="rounded-full bg-tint px-3 py-1.5">{{ summary.notesCount }} ảnh có ghi chú</li>
      </ul>
      <p class="mt-3 text-sm text-muted">Chốt <time :datetime="summary.finalizedAt">{{ finalizedLabel }}</time></p>
    </div>
  </div>
</template>
