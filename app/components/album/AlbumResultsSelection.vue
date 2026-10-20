<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import type { ExportItem } from '~~/shared/domain/export'
import { RESULT_EXPORTS, type ResultExportFormat } from '~/lib/album-results'

const props = defineProps<{
  items: ExportItem[]
  total: number
  hasMore: boolean
  loadingMore: boolean
  filterLink: string
  imageBase?: string
}>()
const emit = defineEmits<{ loadMore: []; copy: []; export: [format: ResultExportFormat] }>()
const search = defineModel<string>('search', { required: true })
const notesFilter = defineModel<'all' | 'with' | 'without'>('notesFilter', { required: true })

const scrollPanel = ref<HTMLElement | null>(null)
const virtualizer = useVirtualizer(computed(() => ({
  count: props.items.length,
  getScrollElement: () => scrollPanel.value,
  estimateSize: () => 72,
  overscan: 8,
  gap: 8,
})))
const virtualRows = computed(() => virtualizer.value.getVirtualItems())
const simpleList = computed(() => props.total <= 50 && !props.hasMore)

watch(virtualRows, rows => {
  const last = rows.at(-1)
  if (last && props.hasMore && last.index >= props.items.length - 20) emit('loadMore')
})

function imageUrl(item: ExportItem) {
  return props.imageBase ? `${props.imageBase}/${item.photoId}/image` : undefined
}
</script>

<template>
  <section id="selection" aria-labelledby="selection-heading" class="mt-6">
    <div class="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
      <div class="min-w-0">
        <h2 id="selection-heading" class="text-xl font-semibold sm:text-2xl">Ảnh đã chốt</h2>
        <p class="mt-1 text-sm text-pretty text-muted">Tên file và ghi chú được giữ theo phiên bản này.</p>
      </div>
      <div class="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <UiButton :to="filterLink" class="col-span-2">Lọc ảnh gốc</UiButton>
        <UiButton variant="secondary" @click="emit('copy')">Copy tên file</UiButton>
        <UiMenu label="Xuất danh sách / ghi chú" :items="RESULT_EXPORTS" class="[&>button]:w-full [&>button]:justify-center sm:[&>button]:w-auto" @select="emit('export', $event)" />
      </div>
    </div>
    <p class="mt-2 text-xs text-pretty text-muted">Copy và xuất áp dụng cho toàn bộ ảnh của phiên bản này, kể cả khi đang lọc danh sách.</p>

    <div class="surface mt-4 grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-end">
      <UiField v-slot="{ id }" label="Tìm tên file">
        <UiInput :id="id" v-model="search" type="search" name="result-search" autocomplete="off" spellcheck="false" enterkeyhint="search" placeholder="Ví dụ DSC_0123…" />
      </UiField>
      <UiField v-slot="{ id }" label="Ghi chú">
        <UiSelect :id="id" v-model="notesFilter" label="Ghi chú" name="result-notes" :options="[{ value: 'all', label: 'Tất cả' }, { value: 'with', label: 'Có ghi chú' }, { value: 'without', label: 'Chưa có ghi chú' }]" />
      </UiField>
    </div>

    <div v-if="simpleList" class="mt-3" role="region" aria-label="Danh sách ảnh đã chốt">
      <ul class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <li v-for="item in items" :key="item.photoId" class="rounded-xl border bg-white p-2.5" :class="item.notes.length ? 'border-brand-soft/60' : 'border-line'">
          <AlbumResultRow :item="item" :image-url="imageUrl(item)" />
        </li>
      </ul>
    </div>
    <ClientOnly v-else>
      <div ref="scrollPanel" class="focus-ring mt-3 max-h-[70dvh] overflow-auto overscroll-contain rounded-2xl border border-line bg-tint p-2" role="region" aria-label="Danh sách ảnh đã chốt" tabindex="0">
        <ul class="relative w-full" :style="{ height: `${virtualizer.getTotalSize()}px` }" :aria-busy="loadingMore">
          <li
            v-for="row in virtualRows"
            :key="items[row.index]!.photoId"
            :ref="el => virtualizer.measureElement(el as Element | null)"
            :data-index="row.index"
            :aria-posinset="row.index + 1"
            :aria-setsize="total"
            class="absolute inset-x-0 rounded-xl border border-line bg-white p-2.5"
            :style="{ transform: `translateY(${row.start}px)` }"
          >
            <AlbumResultRow :item="items[row.index]!" :image-url="imageUrl(items[row.index]!)" />
          </li>
        </ul>
        <div v-if="loadingMore" role="status" aria-label="Đang tải thêm" class="mt-2.5 space-y-2.5">
          <div v-for="n in 2" :key="n" class="rounded-xl border border-line bg-white p-4">
            <UiSkeleton class="h-4 w-1/3" />
            <UiSkeleton class="mt-2 h-3 w-1/2" />
          </div>
        </div>
      </div>
    </ClientOnly>
    <p v-if="!loadingMore && items.length === 0" class="surface mt-3 p-5 text-center text-sm text-muted">Không có ảnh phù hợp.</p>
  </section>
</template>
