<script setup lang="ts">
withDefaults(defineProps<{ link: string; label?: string; copyLabel?: string }>(), { label: 'Link khách hàng', copyLabel: 'Sao chép lại link' })
defineEmits<{ copy: [] }>()
</script>

<template>
  <div class="w-full min-w-0">
    <p class="mb-1 text-xs font-semibold text-muted">{{ label }}</p>
    <div class="flex w-full min-w-0 items-center gap-1 rounded-xl border border-line bg-tint py-1 pl-3 pr-1 text-sm">
      <a :href="link" target="_blank" rel="noopener noreferrer" :title="link" translate="no" class="focus-ring min-w-0 flex-1 truncate rounded py-2 text-muted underline-offset-4 hover:text-brand hover:underline">{{ link }}</a>
      <button type="button" :aria-label="copyLabel" :title="copyLabel" class="focus-ring grid size-11 shrink-0 place-items-center rounded-lg text-brand hover:bg-white" @click="$emit('copy')">
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" class="size-4"><rect x="7" y="7" width="9" height="9" rx="2" /><path d="M13 7V5.5A1.5 1.5 0 0 0 11.5 4h-6A1.5 1.5 0 0 0 4 5.5v6A1.5 1.5 0 0 0 5.5 13H7" /></svg>
      </button>
    </div>
  </div>
</template>
