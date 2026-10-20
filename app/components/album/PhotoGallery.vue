<script setup lang="ts" generic="T extends { id: string; width: number | null; height: number | null }">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useWindowVirtualizer } from '@tanstack/vue-virtual'
import { gridColumns, gridRows, justifiedRows, listRows, masonryItemHeight, type GalleryLayout, type LayoutRow } from '~/lib/gallery-layout'

export interface GalleryBox { width: number; height: number }

const props = withDefaults(defineProps<{
  items: T[]
  layout: GalleryLayout
  total: number
  hasMore: boolean
  loading: boolean
  label: string
  captionHeight?: number
  listRowHeight?: number
}>(), { captionHeight: 48, listRowHeight: 96 })

const emit = defineEmits<{ end: [] }>()
defineSlots<{ default(props: { item: T; index: number; box: GalleryBox; layout: GalleryLayout; eager: boolean; priority: boolean }): unknown }>()

const container = ref<HTMLElement | null>(null)
const width = ref(0)
const scrollMargin = ref(0)

const gap = computed(() => (width.value < 640 ? 8 : 12))
const columns = computed(() => {
  if (props.layout === 'masonry') return gridColumns(width.value, width.value < 640 ? 150 : 220, gap.value)
  return gridColumns(width.value, width.value < 640 ? 150 : width.value < 1024 ? 190 : 210, gap.value)
})
const masonryColumnWidth = computed(() => (width.value - gap.value * (columns.value - 1)) / columns.value)
const rows = computed<LayoutRow[]>(() => {
  if (props.layout === 'grid') return gridRows(props.items.length, width.value, columns.value, gap.value, 0.8, props.captionHeight)
  if (props.layout === 'justified') return justifiedRows(props.items, width.value, width.value < 640 ? 140 : width.value < 1024 ? 180 : 220, gap.value)
  if (props.layout === 'list') return listRows(props.items.length, width.value, props.listRowHeight)
  return []
})
const isMasonry = computed(() => props.layout === 'masonry')
const firstRowCount = computed(() => props.layout === 'list' ? 1 : props.layout === 'justified' ? (rows.value[0]?.items.length ?? 1) : columns.value)
const count = computed(() => (isMasonry.value ? (width.value > 0 ? props.items.length : 0) : rows.value.length))

const virtualizer = useWindowVirtualizer(computed(() => ({
  count: count.value,
  estimateSize: (index: number) => (isMasonry.value ? masonryItemHeight(props.items[index]!, masonryColumnWidth.value) : rows.value[index]!.height),
  getItemKey: (index: number) => (isMasonry.value ? props.items[index]!.id : `${props.layout}:${index}`),
  overscan: isMasonry.value ? 4 : 3,
  lanes: isMasonry.value ? columns.value : 1,
  gap: gap.value,
  scrollMargin: scrollMargin.value,
})))

const virtualItems = computed(() => virtualizer.value.getVirtualItems())
const totalHeight = computed(() => virtualizer.value.getTotalSize())

watch([() => props.layout, width, columns], () => { virtualizer.value.measure() })

// Asking for the next page while a few screens of content remain hides network latency.
const prefetchDistance = computed(() => (isMasonry.value ? columns.value * 8 : 8))
watch([virtualItems, () => props.hasMore, () => props.loading], () => {
  if (!props.hasMore || props.loading) return
  const last = virtualItems.value.at(-1)
  if (count.value === 0 || (last && last.index >= count.value - prefetchDistance.value)) emit('end')
}, { immediate: true })

let observer: ResizeObserver | undefined
let frame = 0
function measure() {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(() => {
    if (!container.value) return
    width.value = container.value.clientWidth
    scrollMargin.value = container.value.getBoundingClientRect().top + window.scrollY
  })
}

onMounted(() => {
  observer = new ResizeObserver(measure)
  if (container.value) observer.observe(container.value)
  observer.observe(document.body)
  measure()
})
onBeforeUnmount(() => {
  observer?.disconnect()
  cancelAnimationFrame(frame)
})
</script>

<template>
  <div>
    <ul ref="container" class="relative w-full" :style="{ height: `${totalHeight}px` }" :aria-label="label" :aria-busy="loading">
      <template v-if="isMasonry">
        <li
          v-for="virtual in virtualItems"
          :key="virtual.key as string"
          class="absolute"
          :aria-posinset="virtual.index + 1"
          :aria-setsize="total"
          :style="{ top: `${virtual.start - scrollMargin}px`, left: `${virtual.lane * (masonryColumnWidth + gap)}px`, width: `${masonryColumnWidth}px`, height: `${virtual.size}px` }"
        >
          <slot :item="items[virtual.index]!" :index="virtual.index" :box="{ width: masonryColumnWidth, height: virtual.size }" :layout="layout" :eager="virtual.index < firstRowCount" :priority="virtual.index < Math.min(2, firstRowCount)" />
        </li>
      </template>
      <template v-else>
        <template v-for="virtual in virtualItems" :key="virtual.key as string">
          <li
            v-for="placed in rows[virtual.index]?.items ?? []"
            :key="items[placed.index]!.id"
            class="absolute"
            :aria-posinset="placed.index + 1"
            :aria-setsize="total"
            :style="{ top: `${virtual.start - scrollMargin}px`, left: `${placed.left}px`, width: `${placed.width}px`, height: `${placed.height}px` }"
          >
            <slot :item="items[placed.index]!" :index="placed.index" :box="{ width: placed.width, height: placed.height }" :layout="layout" :eager="placed.index < firstRowCount" :priority="placed.index < Math.min(2, firstRowCount)" />
          </li>
        </template>
      </template>
    </ul>
    <div v-if="loading && items.length" class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3" aria-hidden="true">
      <UiPhotoSkeleton v-for="n in 4" :key="n" class="h-40" />
    </div>
  </div>
</template>
