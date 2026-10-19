<script setup lang="ts">
import type { ExportItem } from '~~/shared/domain/export'

defineProps<{ item: ExportItem; imageUrl?: string }>()
</script>

<template>
  <div class="grid min-w-0 grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[4rem_minmax(0,1fr)_minmax(10rem,1.2fr)] sm:gap-5">
    <div class="grid size-14 place-items-center overflow-hidden rounded-xl bg-tint text-xs text-muted sm:size-16">
      <img v-if="imageUrl" :src="imageUrl" alt="" loading="lazy" width="64" height="64" class="size-full object-cover" @error="($event.target as HTMLImageElement).hidden = true">
      <span v-else aria-hidden="true">Ảnh</span>
    </div>
    <div class="min-w-0">
      <h3 class="break-all text-sm font-semibold text-ink sm:text-base" translate="no">{{ item.filename }}</h3>
      <p v-if="item.notes.length" class="mt-1 text-xs font-medium text-brand sm:hidden">{{ item.notes.length }} ghi chú</p>
    </div>
    <div class="col-span-2 min-w-0 pl-[4.25rem] sm:col-span-1 sm:pl-0">
      <template v-if="item.notes.length">
        <p v-for="(note, index) in item.notes" :key="index" class="whitespace-pre-line break-words text-sm text-muted">{{ note.text }}</p>
      </template>
      <span v-else class="hidden text-sm text-muted sm:inline">—</span>
    </div>
  </div>
</template>
