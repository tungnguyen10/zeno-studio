<script setup lang="ts">
import { GALLERY_LAYOUTS, type GalleryLayout } from '~/lib/gallery-layout'

const layout = defineModel<GalleryLayout>({ required: true })

const ICONS: Record<GalleryLayout, string> = {
  justified: 'M3 5h7v6H3zM12 5h9v6h-9zM3 13h11v6H3zM16 13h5v6h-5z',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  masonry: 'M4 3h7v10H4zM13 3h7v6h-7zM4 15h7v6H4zM13 11h7v10h-7z',
  list: 'M4 5h4v4H4zM10 6h10v2H10zM4 15h4v4H4zM10 16h10v2H10z',
}
</script>

<template>
  <div class="inline-flex rounded-full border border-line bg-white p-0.5" role="group" aria-label="Kiểu hiển thị">
    <button
      v-for="option in GALLERY_LAYOUTS"
      :key="option.value"
      type="button"
      class="focus-ring grid size-11 place-items-center rounded-full transition-colors"
      :class="layout === option.value ? 'bg-brand text-white' : 'text-muted hover:bg-tint'"
      :aria-label="option.label"
      :title="option.label"
      :aria-pressed="layout === option.value"
      @click="layout = option.value"
    >
      <svg viewBox="0 0 24 24" class="size-5" fill="currentColor" aria-hidden="true"><path :d="ICONS[option.value]" /></svg>
    </button>
  </div>
</template>
