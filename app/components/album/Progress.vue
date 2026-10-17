<script setup lang="ts">
import { computed } from 'vue'
import { WORKFLOW_STEPS, workflowStepIndex, type AlbumStatus } from '~~/shared/domain/album-status'

const props = defineProps<{ status: string }>()
const current = computed(() => workflowStepIndex(props.status as AlbumStatus))
</script>

<template>
  <ol v-if="current !== null" aria-label="Tiến trình album" class="mt-5 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 sm:text-sm">
    <li
      v-for="(label, index) in WORKFLOW_STEPS"
      :key="label"
      :aria-current="index === current ? 'step' : undefined"
      class="flex min-w-0 items-center gap-2 rounded-full border px-3 py-1.5"
      :class="index === current ? 'border-brand bg-brand font-semibold text-white' : index < current ? 'border-[#cfdcc9] bg-tint text-brand' : 'border-line bg-white text-muted'"
    >
      <span aria-hidden="true" class="grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold" :class="index === current ? 'bg-white text-brand' : index < current ? 'bg-brand text-white' : 'bg-[#eceee8] text-muted'">{{ index < current ? '✓' : index + 1 }}</span>
      <span class="truncate">{{ label }}</span>
      <span v-if="index < current" class="sr-only">(đã xong)</span>
    </li>
  </ol>
</template>
