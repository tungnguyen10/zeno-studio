<script setup lang="ts">
defineProps<{ pressed: boolean }>()
defineEmits<{ click: [] }>()
</script>

<template>
  <button
    type="button"
    class="focus-ring inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition-colors"
    :class="pressed ? 'border-brand bg-brand text-white' : 'border-line bg-white text-brand hover:bg-tint'"
    :aria-pressed="pressed"
    @click="$emit('click')"
  >
    <slot />
  </button>
</template>
