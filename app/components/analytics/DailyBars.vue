<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ title: string; points: Array<{ date: string; value: number }>; unit: string }>()
const maximum = computed(() => Math.max(1, ...props.points.map(point => point.value)))
const format = new Intl.NumberFormat('vi-VN')
</script>

<template>
  <section class="min-w-0 rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-5" :aria-label="title">
    <h2 class="text-base font-semibold">{{ title }}</h2>
    <p v-if="!points.length" class="mt-4 text-sm text-muted">Chưa có dữ liệu trong kỳ này.</p>
    <div v-else class="mt-4 max-w-full overflow-x-auto pb-2">
      <ol class="flex min-w-max items-end gap-1" :aria-label="title">
        <li v-for="point in points" :key="point.date" class="flex w-5 flex-col items-center gap-1">
          <span class="sr-only">{{ point.date }}: {{ format.format(point.value) }} {{ unit }}</span>
          <span aria-hidden="true" class="w-3 rounded-t bg-brand" :style="{ height: `${Math.max(3, Math.round(point.value / maximum * 112))}px` }" />
        </li>
      </ol>
      <div class="mt-2 flex justify-between text-xs text-muted">
        <time :datetime="points[0]!.date">{{ points[0]!.date }}</time>
        <time :datetime="points[points.length - 1]!.date">{{ points[points.length - 1]!.date }}</time>
      </div>
    </div>
  </section>
</template>
