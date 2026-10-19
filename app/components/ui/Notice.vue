<script setup lang="ts">
withDefaults(defineProps<{ tone?: 'info' | 'success' | 'warn' | 'error' }>(), { tone: 'info' })

const TONES = {
  info: 'border-line bg-tint text-brand',
  success: 'border-line bg-tint text-brand',
  warn: 'border-warn-line bg-warn-soft text-warn',
  error: 'border-danger/20 bg-danger-soft text-danger',
} as const
</script>

<template>
  <p :role="tone === 'error' ? 'alert' : 'status'" class="rounded-xl border px-4 py-3 text-sm text-pretty" :class="TONES[tone]">
    <slot />
  </p>
</template>
