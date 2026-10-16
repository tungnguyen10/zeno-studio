<script setup lang="ts">
import { GALLERY_LAYOUTS, type GalleryLayout } from '~/lib/gallery-layout'

const layout = defineModel<GalleryLayout>({ required: true })
</script>

<template>
  <div class="inline-flex rounded-full border border-[#dfe4d8] bg-white p-1" role="group" aria-label="Kiểu hiển thị">
    <button
      v-for="option in GALLERY_LAYOUTS"
      :key="option.value"
      type="button"
      class="min-h-9 rounded-full px-3 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#344732] sm:text-sm"
      :class="layout === option.value ? 'bg-[#344732] text-white' : 'text-[#4f5d4b] hover:bg-[#f1f5ed]'"
      :aria-pressed="layout === option.value"
      @click="layout = option.value"
    >{{ option.label }}</button>
  </div>
</template>
