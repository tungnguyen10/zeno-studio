<script setup lang="ts">
defineProps<{ items: Array<{ label: string; value: number; hint?: string }> }>()
const format = new Intl.NumberFormat('vi-VN')
</script>

<template>
  <dl class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    <div v-for="item in items" :key="item.label" class="min-w-0 rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-5">
      <dt class="text-sm font-medium text-muted">{{ item.label }}</dt>
      <dd class="mt-2 text-3xl font-semibold tabular-nums text-ink">{{ format.format(item.value) }}</dd>
      <p v-if="item.hint" class="mt-2 text-xs text-muted">{{ item.hint }}</p>
    </div>
  </dl>
</template>
