<script setup lang="ts">
defineProps<{ step: number | string; title: string; description?: string }>()
</script>

<template>
  <section class="rounded-3xl border border-line bg-white p-4 sm:p-6">
    <div class="flex items-start gap-3">
      <span aria-hidden="true" class="grid size-8 shrink-0 place-items-center rounded-full bg-tint text-sm font-bold text-brand tabular-nums">{{ step }}</span>
      <div class="min-w-0 pt-0.5">
        <h2 class="text-lg font-semibold leading-tight sm:text-xl">{{ title }}</h2>
        <p v-if="description" class="mt-1.5 text-sm text-pretty text-muted">{{ description }}</p>
      </div>
    </div>
    <div class="mt-5">
      <slot />
    </div>
  </section>
</template>
