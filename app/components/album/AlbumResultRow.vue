<script setup lang="ts">
import type { ExportItem } from '~~/shared/domain/export'

defineProps<{ item: ExportItem; imageUrl?: string }>()
</script>

<template>
  <div class="flex min-w-0 items-start gap-3">
    <div class="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-tint text-[10px] text-muted">
      <img v-if="imageUrl" :src="imageUrl" alt="" loading="lazy" width="48" height="48" class="size-full object-cover" @error="($event.target as HTMLImageElement).hidden = true">
      <span v-else aria-hidden="true">Ảnh</span>
    </div>
    <div class="min-w-0 flex-1">
      <h3 class="truncate text-sm font-semibold text-ink" translate="no" :title="item.filename">{{ item.filename }}</h3>
      <template v-if="item.notes.length">
        <p v-for="(note, index) in item.notes" :key="index" class="mt-0.5 whitespace-pre-line break-words text-xs leading-5 text-brand">{{ note.text }}</p>
      </template>
      <p v-else class="mt-0.5 text-xs text-muted/70">Chưa có ghi chú</p>
    </div>
  </div>
</template>
