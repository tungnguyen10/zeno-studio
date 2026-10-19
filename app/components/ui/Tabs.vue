<script setup lang="ts" generic="T extends string">
import type { RouteLocationRaw } from 'vue-router'

defineProps<{ items: ReadonlyArray<{ id: T; label: string; to?: RouteLocationRaw; count?: number }>; current: T; label: string }>()
defineEmits<{ select: [id: T] }>()

const base = 'focus-ring inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold whitespace-nowrap transition-colors'
const active = 'bg-brand text-white'
const idle = 'bg-white text-brand hover:bg-tint'
</script>

<template>
  <nav :aria-label="label" class="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
    <ul class="flex w-max gap-2">
      <li v-for="item in items" :key="item.id">
        <NuxtLink v-if="item.to" :to="item.to" :aria-current="current === item.id ? 'page' : undefined" :class="[base, current === item.id ? active : idle]">
          {{ item.label }} <span v-if="item.count !== undefined" class="tabular-nums opacity-80">({{ item.count }})</span>
        </NuxtLink>
        <button v-else type="button" :aria-pressed="current === item.id" :class="[base, current === item.id ? active : idle]" @click="$emit('select', item.id)">
          {{ item.label }} <span v-if="item.count !== undefined" class="tabular-nums opacity-80">({{ item.count }})</span>
        </button>
      </li>
    </ul>
  </nav>
</template>
