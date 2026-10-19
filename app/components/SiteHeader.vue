<script setup lang="ts">
const props = withDefaults(defineProps<{ width?: '3xl' | '6xl' | '7xl' }>(), { width: '7xl' })

const containerClass = {
  '3xl': 'max-w-3xl px-4 sm:px-5',
  '6xl': 'max-w-6xl px-4 sm:px-6 lg:px-8',
  '7xl': 'max-w-7xl px-4 sm:px-8',
}[props.width]
</script>

<template>
  <header class="sticky top-0 z-20 border-b border-line bg-canvas/95 backdrop-blur">
    <div class="mx-auto flex h-16 items-center justify-between gap-3" :class="containerClass">
      <NuxtLink to="/" aria-label="Zeno Studio – Trang chủ" class="focus-ring -ml-1 flex min-h-11 shrink-0 items-center rounded-lg px-1 text-ink">
        <BrandLogo />
      </NuxtLink>
      <div v-if="$slots.default" class="flex min-w-0 items-center gap-2 text-sm font-medium sm:gap-3">
        <slot />
      </div>
    </div>
  </header>
</template>
