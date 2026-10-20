<script setup lang="ts">
import { computed } from 'vue'
import { WORKFLOW_STEPS, workflowStepIndex, type AlbumStatus } from '~~/shared/domain/album-status'

const props = defineProps<{ status: string }>()
const current = computed(() => workflowStepIndex(props.status as AlbumStatus))
</script>

<template>
  <ol v-if="current !== null" aria-label="Tiến trình album" class="mt-5 grid grid-cols-3 gap-2 text-[11px] leading-tight sm:mt-6 sm:gap-3 sm:text-sm">
    <li
      v-for="(label, index) in WORKFLOW_STEPS"
      :key="label"
      :aria-current="index === current ? 'step' : undefined"
      class="flex min-w-0 items-start gap-1.5 border-t-2 pt-2 sm:gap-2 sm:pt-3"
      :class="index === current ? 'border-brand font-semibold text-brand' : index < current ? 'border-brand-soft text-brand' : 'border-line text-muted'"
    >
      <span aria-hidden="true" class="grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold" :class="index === current ? 'bg-brand text-white' : index < current ? 'bg-tint text-brand' : 'bg-skeleton text-muted'">{{ index < current ? '✓' : index + 1 }}</span>
      <span class="min-w-0 break-words">{{ label }}</span>
      <span v-if="index < current" class="sr-only">(đã xong)</span>
    </li>
  </ol>
</template>
