<script setup lang="ts">
defineProps<{ modelValue: 7 | 30 | 90 }>()
const emit = defineEmits<{ 'update:modelValue': [value: 7 | 30 | 90] }>()
const ranges = [7, 30, 90] as const
</script>

<template>
  <div role="group" aria-label="Khoảng thời gian" class="inline-flex max-w-full gap-1 overflow-x-auto rounded-full border border-line bg-white p-1">
    <button v-for="range in ranges" :key="range" type="button" :aria-pressed="modelValue === range"
      class="focus-ring min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold transition-colors"
      :class="modelValue === range ? 'bg-brand text-white' : 'text-muted hover:bg-tint hover:text-ink'"
      @click="emit('update:modelValue', range)">
      {{ range }} ngày
    </button>
  </div>
</template>
