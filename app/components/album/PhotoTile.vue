<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { GalleryLayout } from '~/lib/gallery-layout'

const props = withDefaults(defineProps<{
  filename: string
  layout: GalleryLayout
  box: { width: number; height: number }
  src: string
  srcset?: string
  eager: boolean
  priority: boolean
  failed: boolean
  actionLabel: string
  interactive?: boolean
  pressed?: boolean
  highlighted?: boolean
  captionHeight: number
}>(), { interactive: true })
const emit = defineEmits<{ activate: []; error: [] }>()

const overlayCaption = computed(() => props.layout === 'justified' || props.layout === 'masonry')
const imageWidth = computed(() => (props.layout === 'list' ? 64 : props.box.width))
const sizes = computed(() => `${Math.max(1, Math.round(imageWidth.value))}px`)
const loaded = ref(false)
watch(() => props.src, () => { loaded.value = false })
</script>

<template>
  <div
    class="relative flex size-full overflow-hidden border bg-white transition-[border-color,box-shadow]"
    :class="[
      interactive && 'group',
      layout === 'list' ? 'flex-row items-center gap-3 rounded-2xl p-2' : 'flex-col',
      overlayCaption ? 'rounded-xl' : layout === 'grid' ? 'rounded-2xl' : '',
      highlighted ? 'border-brand ring-2 ring-brand' : 'border-line',
    ]"
  >
    <component
      :is="interactive ? 'button' : 'div'"
      :type="interactive ? 'button' : undefined"
      class="photo-placeholder relative block shrink-0 overflow-hidden focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-brand"
      :class="layout === 'list' ? 'h-20 w-16 rounded-lg' : 'w-full flex-1'"
      :data-loading="!loaded && !failed ? '' : undefined"
      :aria-label="interactive ? actionLabel : undefined"
      :aria-pressed="interactive ? pressed : undefined"
      @click="interactive && emit('activate')"
    >
      <span v-if="failed" role="img" :aria-label="`Không tải được ảnh ${filename}`" class="flex size-full items-center justify-center bg-white/60 p-2 text-center text-xs text-muted">Không tải được ảnh</span>
      <img
        v-else
        :src="src"
        :srcset="srcset"
        :sizes="srcset ? sizes : undefined"
        :alt="filename"
        :loading="eager ? 'eager' : 'lazy'"
        :fetchpriority="priority ? 'high' : 'auto'"
        decoding="async"
        referrerpolicy="no-referrer"
        draggable="false"
        class="size-full object-cover transition-[opacity,transform] duration-300 motion-reduce:transition-none group-hover:scale-[1.015]"
        :class="loaded ? 'opacity-100' : 'opacity-0'"
        @load="loaded = true"
        @error="emit('error')"
      >
      <span v-if="overlayCaption" class="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/60 to-transparent px-2 pb-1.5 pt-6 text-left text-xs text-white transition-opacity" :class="interactive ? 'hidden opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 sm:block' : 'block opacity-100'">{{ filename }}</span>
    </component>
    <div v-if="layout === 'grid'" class="flex shrink-0 items-center justify-between gap-2 px-3" :style="{ height: `${captionHeight}px` }">
      <span class="min-w-0 truncate text-xs" :title="filename" translate="no">{{ filename }}</span>
      <slot name="action" />
    </div>
    <div v-else-if="layout === 'list'" class="flex min-w-0 flex-1 items-center justify-between gap-3 pr-1">
      <span class="min-w-0 truncate text-sm font-medium" :title="filename" translate="no">{{ filename }}</span>
      <slot name="action" />
    </div>
    <div v-else class="absolute right-1.5 top-1.5">
      <slot name="action" />
    </div>
    <div class="pointer-events-none absolute left-2 top-2">
      <slot name="badge" />
    </div>
  </div>
</template>
