<script setup lang="ts">
import { computed } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import type { ResultSummary } from '~/lib/album-results'

const props = defineProps<{
  summary: ResultSummary
  next?: { label: string; hint: string; to?: RouteLocationRaw }
}>()

const finalizedLabel = computed(() => new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(props.summary.finalizedAt)))
</script>

<template>
  <div class="surface mt-4 grid gap-4 p-4 shadow-sm sm:mt-5 sm:rounded-3xl sm:p-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-8">
    <div class="min-w-0">
      <p class="text-xs font-bold uppercase tracking-[.16em] text-brand-soft">Bộ ảnh đã chốt</p>
      <ul class="mt-3 flex flex-wrap gap-2 text-sm font-medium tabular-nums">
        <li class="rounded-full bg-tint px-3 py-1.5">Phiên bản {{ summary.versionNumber }}</li>
        <li class="rounded-full bg-tint px-3 py-1.5">{{ summary.total }} ảnh</li>
        <li class="rounded-full bg-tint px-3 py-1.5">{{ summary.notesCount }} ảnh có ghi chú</li>
      </ul>
      <p class="mt-3 text-sm text-muted">Chốt <time :datetime="summary.finalizedAt">{{ finalizedLabel }}</time></p>
    </div>
    <div v-if="next" class="min-w-0 border-t border-line pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
      <p class="text-xs font-bold uppercase tracking-[.16em] text-muted">Việc tiếp theo</p>
      <p class="mt-2 font-semibold text-brand">{{ next.label }}</p>
      <p class="mt-1 text-sm text-pretty text-muted">{{ next.hint }}</p>
      <UiButton v-if="next.to" :to="next.to" class="mt-3 w-full sm:w-auto">{{ next.label }} <span aria-hidden="true">→</span></UiButton>
    </div>
  </div>
</template>
