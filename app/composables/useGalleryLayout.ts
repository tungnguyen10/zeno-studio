import { onMounted, ref, watch } from 'vue'
import { isGalleryLayout, type GalleryLayout } from '~/lib/gallery-layout'

export function useGalleryLayout(storageKey: string, fallback: GalleryLayout = 'masonry') {
  const layout = ref<GalleryLayout>(fallback)
  onMounted(() => {
    const stored = localStorage.getItem(storageKey)
    if (isGalleryLayout(stored)) layout.value = stored
    watch(layout, value => { localStorage.setItem(storageKey, value) })
  })
  return layout
}
