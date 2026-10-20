<script setup lang="ts" generic="T extends string">
import { nextTick, onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from 'vue'
import type { RouteLocationRaw } from 'vue-router'

const props = defineProps<{ items: ReadonlyArray<{ id: T; label: string; to?: RouteLocationRaw; count?: number }>; current: T; label: string }>()
defineEmits<{ select: [id: T] }>()

const scroller = useTemplateRef<HTMLElement>('scroller')
const list = useTemplateRef<HTMLElement>('list')
const canScrollLeft = shallowRef(false)
const canScrollRight = shallowRef(false)
let observer: ResizeObserver | undefined

function updateScrollCue() {
  const element = scroller.value
  if (!element) return
  canScrollLeft.value = element.scrollLeft > 4
  canScrollRight.value = element.scrollWidth - element.clientWidth - element.scrollLeft > 4
}

onMounted(() => {
  updateScrollCue()
  observer = new ResizeObserver(updateScrollCue)
  if (scroller.value) observer.observe(scroller.value)
  if (list.value) observer.observe(list.value)
})
onBeforeUnmount(() => observer?.disconnect())
watch(() => props.items, async () => { await nextTick(); updateScrollCue() })

const base = 'focus-ring inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold whitespace-nowrap transition-colors'
const active = 'bg-brand text-white'
const idle = 'bg-white text-brand hover:bg-tint'
</script>

<template>
  <div class="relative min-w-0">
    <nav ref="scroller" :aria-label="label" class="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0" @scroll="updateScrollCue">
    <ul ref="list" class="flex w-max gap-2">
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
    <span v-if="canScrollLeft" aria-hidden="true" class="pointer-events-none absolute inset-y-0 left-0 grid w-7 place-items-center bg-gradient-to-r from-canvas to-transparent text-brand sm:hidden">‹</span>
    <span v-if="canScrollRight" aria-hidden="true" class="pointer-events-none absolute inset-y-0 right-0 grid w-7 place-items-center bg-gradient-to-l from-canvas to-transparent text-brand sm:hidden">›</span>
  </div>
</template>
