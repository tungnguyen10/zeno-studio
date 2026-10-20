<script setup lang="ts">
defineProps<{ title: string; description?: string; titleId?: string }>()
defineSlots<{ default?(): any; actions?(): any }>()
</script>

<template>
  <div class="flex items-end justify-between gap-3">
    <div class="min-w-0">
      <h1 :id="titleId" class="break-words text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{{ title }}</h1>
      <p v-if="description || $slots.default" class="mt-1 max-w-3xl text-sm text-pretty text-muted">
        <slot>{{ description }}</slot>
      </p>
    </div>
    <div v-if="$slots.actions" class="shrink-0">
      <slot name="actions" />
    </div>
  </div>
</template>
