<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import GalleryLayoutSwitch from '~/components/album/GalleryLayoutSwitch.vue'
import PhotoTile from '~/components/album/PhotoTile.vue'
import SelectionIsland from '~/components/album/SelectionIsland.vue'
import type { GalleryLayout } from '~/lib/gallery-layout'
import { DEMO_GRID_CAPTION_HEIGHT, demoLayout } from '~/lib/homepage-demo/layout'
import { DEMO_ALBUM, demoSubtitle, type DemoPhoto } from '~/lib/homepage-demo/photos'
import { visibleDemoPhotos, type DemoAction, type DemoSelectionState } from '~/lib/homepage-demo/selection'
import { STORYBOARD_SELECTION, heartScrollTarget, type StoryboardGeometry, type TapTarget } from '~/lib/homepage-demo/storyboard'
import type { DownloadCapabilities } from '~~/shared/domain/download-policy'

// Phone-sized copy of the customer album page (app/pages/album/[albumId].vue) driven by
// local demo state only: no auth, polling, network writes or stored layout preference.
const props = defineProps<{
  photos: readonly DemoPhoto[]
  state: DemoSelectionState
  interactive: boolean
  failed: Readonly<Record<string, boolean>>
  /** Autoplay only: scroll offset chosen by the storyboard. */
  scroll?: number
  tap?: { target: TapTarget; progress: number } | null
  fade?: number
  downloadBusy?: boolean
}>()
const emit = defineEmits<{ action: [action: DemoAction]; download: []; error: [id: string] }>()

// Main padding on the album page at phone width: 16px sides, 20px top, 112px bottom.
const MAIN_BOTTOM_PADDING = 112
// The host renders this screen as a 390×720 phone viewport (scaled to fit), so the content
// is 390 − 2×16px wide; measuring only matters if a host ever renders it at another size.
const FALLBACK_WIDTH = 358

const scroller = useTemplateRef<HTMLElement>('scroller')
const gallery = useTemplateRef<HTMLElement>('gallery')
const islandWrap = useTemplateRef<HTMLElement>('islandWrap')
const root = useTemplateRef<HTMLElement>('root')
const closeButton = useTemplateRef<HTMLButtonElement>('closeButton')

const width = ref(FALLBACK_WIDTH)
const galleryTop = ref(0)
const viewportHeight = ref(0)

const selectedSet = computed(() => new Set(props.state.selected))
const visible = computed(() => visibleDemoPhotos(props.photos, props.state))
const layoutResult = computed(() => demoLayout(visible.value, props.state.layout, width.value))
const placed = computed(() => layoutResult.value.boxes.map(box => ({ box, photo: visible.value[box.index]! })))
const subtitle = demoSubtitle(props.photos.length)
const download = computed<DownloadCapabilities>(() => ({
  canSingle: false, canSelected: true, canAll: false, reason: null, selectedSource: 'live', selectedCount: props.state.selected.length,
}))

// Scroll targets come from the same layout the screen renders, so a resize or a UI change
// moves the storyboard with the cards instead of replaying coordinates from a screenshot.
const geometry = computed<StoryboardGeometry>(() => {
  const full = demoLayout(props.photos, 'masonry', width.value)
  const maxFull = Math.max(0, galleryTop.value + full.height + MAIN_BOTTOM_PADDING - viewportHeight.value)
  const chosen = new Set<string>(STORYBOARD_SELECTION)
  const result = demoLayout(props.photos.filter(photo => chosen.has(photo.id)), 'masonry', width.value)
  const maxResult = Math.max(0, galleryTop.value + result.height + MAIN_BOTTOM_PADDING - viewportHeight.value)
  return {
    scrollTo: id => heartScrollTarget({ galleryTop: galleryTop.value, cardTop: full.boxes.find(box => box.id === id)?.top ?? 0, viewportHeight: viewportHeight.value, maxScroll: maxFull }),
    // Leave the last card just above the island (16px inset + 56px island + 20px air).
    resultScroll: Math.max(0, Math.min(maxResult, galleryTop.value + result.height - (viewportHeight.value - 92))),
  }
})

let observer: ResizeObserver | undefined
function measure() {
  if (!scroller.value || !gallery.value) return
  width.value = gallery.value.clientWidth || FALLBACK_WIDTH
  viewportHeight.value = scroller.value.clientHeight
  // Layout offsets, not client rects: the host may scale this screen with a CSS transform.
  galleryTop.value = gallery.value.offsetTop
}
onMounted(() => {
  observer = new ResizeObserver(measure)
  if (scroller.value) observer.observe(scroller.value)
  if (gallery.value) observer.observe(gallery.value)
  measure()
})
onBeforeUnmount(() => observer?.disconnect())

watch(() => [props.scroll, props.interactive] as const, ([scroll, interactive]) => {
  if (!interactive && scroller.value && scroll !== undefined) scroller.value.scrollTop = scroll
}, { flush: 'post' })

// Tap ring: positioned on the real heart / filter control in screen coordinates.
const tapPoint = computed(() => {
  void props.scroll
  const tap = props.tap
  if (!tap || !root.value) return null
  const element = tap.target.kind === 'heart'
    ? root.value.querySelector<HTMLElement>(`[data-heart="${tap.target.id}"]`)
    : islandWrap.value?.querySelector<HTMLElement>('button[aria-pressed]')
  if (!element) return null
  const host = root.value.getBoundingClientRect()
  const rect = element.getBoundingClientRect()
  // Client rects include the host's scale; convert back to the screen's own CSS pixels.
  const unscale = host.width ? root.value.offsetWidth / host.width : 1
  return { x: (rect.left - host.left + rect.width / 2) * unscale, y: (rect.top - host.top + rect.height / 2) * unscale, progress: tap.progress }
})

function act(action: DemoAction) {
  emit('action', action)
}
function chooseLayout(layout: GalleryLayout) {
  act({ type: 'setLayout', layout })
}

// Simple preview: close button, Esc, select/unselect; focus returns to the opening tile.
const previewId = ref<string | null>(null)
const previewIndex = computed(() => visible.value.findIndex(photo => photo.id === previewId.value))
const previewPhoto = computed(() => props.photos.find(photo => photo.id === previewId.value) ?? null)
const previewSelected = computed(() => !!previewId.value && selectedSet.value.has(previewId.value))

async function openPreview(id: string) {
  if (!props.interactive) return
  previewId.value = id
  await nextTick()
  closeButton.value?.focus()
}
async function closePreview() {
  const id = previewId.value
  previewId.value = null
  await nextTick()
  const tile = id ? root.value?.querySelector<HTMLElement>(`[data-photo-id="${id}"] button`) : null
  const fallback = root.value?.querySelector<HTMLElement>('[data-empty-action]') ?? islandWrap.value?.querySelector<HTMLElement>('button[aria-pressed]')
  ;(tile ?? fallback)?.focus()
}
function onPreviewKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    void closePreview()
    return
  }
  if (event.key !== 'Tab') return
  const focusable = [...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('button:not([disabled])')]
  if (!focusable.length) return
  const first = focusable[0]!
  const last = focusable.at(-1)!
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}
watch(() => props.interactive, interactive => { if (!interactive) previewId.value = null })

function resetScroll() {
  if (scroller.value) scroller.value.scrollTop = 0
}
function readScroll(): number {
  return scroller.value?.scrollTop ?? 0
}
function restoreScroll(value: number) {
  if (scroller.value) scroller.value.scrollTop = value
}

defineExpose({ geometry, resetScroll, readScroll, restoreScroll })
</script>

<template>
  <div ref="root" class="relative size-full overflow-hidden bg-canvas text-left text-ink" :inert="interactive ? undefined : true">
    <div
      ref="scroller"
      class="absolute inset-0 overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      :class="interactive ? 'overflow-y-auto' : 'overflow-hidden'"
      data-demo-scroller
    >
      <div class="sticky top-0 z-20 flex h-16 items-center border-b border-line bg-canvas/95 px-4 backdrop-blur">
        <BrandLogo />
      </div>
      <div class="px-4 pt-5" :style="{ paddingBottom: `${MAIN_BOTTOM_PADDING}px` }">
        <div class="px-1">
          <p class="text-2xl font-semibold tracking-tight text-balance break-words">{{ DEMO_ALBUM.title }}</p>
          <p class="mt-1.5 text-sm text-muted tabular-nums">{{ subtitle }}</p>
        </div>
        <div class="mb-3 mt-5 flex items-center justify-between gap-3 px-1">
          <p class="text-sm font-semibold text-muted">{{ state.filter ? 'Ảnh đã chọn' : '' }}</p>
          <GalleryLayoutSwitch :model-value="state.layout" @update:model-value="chooseLayout" />
        </div>
        <div ref="gallery">
          <div v-if="!visible.length" class="surface p-6 text-center text-muted">
            <p>Chưa có ảnh được chọn.</p>
            <button
              type="button"
              data-empty-action
              class="focus-ring mt-4 inline-flex min-h-11 items-center rounded-full border border-line-strong bg-white px-5 text-sm font-semibold text-brand transition-colors hover:border-brand"
              @click="act({ type: 'setFilter', value: false })"
            >
              Xem tất cả ảnh
            </button>
          </div>
          <ul v-else class="relative w-full" :style="{ height: `${layoutResult.height}px` }" aria-label="Ảnh trong album mẫu">
            <li
              v-for="{ box, photo } in placed"
              :key="photo.id"
              class="absolute"
              :data-photo-id="photo.id"
              :aria-posinset="box.index + 1"
              :aria-setsize="visible.length"
              :style="{ top: `${box.top}px`, left: `${box.left}px`, width: `${box.width}px`, height: `${box.height}px` }"
            >
              <PhotoTile
                :filename="photo.filename"
                :layout="state.layout"
                :box="{ width: box.width, height: box.height }"
                :src="photo.src"
                :eager="box.index < 6"
                :priority="box.index < 2"
                :failed="!!failed[photo.id]"
                :action-label="`Xem ảnh ${photo.filename}`"
                :caption-height="DEMO_GRID_CAPTION_HEIGHT"
                @activate="openPreview(photo.id)"
                @error="emit('error', photo.id)"
              >
                <template #action>
                  <button
                    type="button"
                    :data-heart="photo.id"
                    class="focus-ring grid size-11 shrink-0 place-items-center rounded-full border text-lg shadow-sm transition-colors"
                    :class="selectedSet.has(photo.id) ? 'border-heart bg-heart-soft text-heart' : 'border-line bg-white/90 text-muted'"
                    :aria-label="`${selectedSet.has(photo.id) ? 'Bỏ chọn' : 'Chọn'} ${photo.filename}`"
                    :aria-pressed="selectedSet.has(photo.id)"
                    @click="act({ type: 'toggle', id: photo.id })"
                  >
                    ♥
                  </button>
                </template>
              </PhotoTile>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <div ref="islandWrap" class="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-4">
      <SelectionIsland
        can-select
        compact-filter
        status="PUBLISHED"
        limit-hint=""
        :selected-count="state.selected.length"
        :filter-selected="state.filter"
        :download="download"
        :download-disabled="!state.selected.length || downloadBusy"
        :basket-count="0"
        @toggle-filter="act({ type: 'toggleFilter' })"
        @download="emit('download')"
      />
    </div>

    <div
      v-if="previewPhoto && interactive"
      class="absolute inset-0 z-30 flex flex-col bg-night text-white"
      role="dialog"
      aria-modal="true"
      :aria-label="previewPhoto.filename"
      @keydown="onPreviewKeydown"
    >
      <div class="flex items-center gap-3 px-3 pb-2 pt-2">
        <p class="shrink-0 text-sm font-semibold tabular-nums text-white/90">{{ previewIndex + 1 }} / {{ visible.length }}</p>
        <p class="min-w-0 flex-1 truncate text-sm text-white/70" :title="previewPhoto.filename" translate="no">{{ previewPhoto.filename }}</p>
        <button ref="closeButton" type="button" class="grid size-11 shrink-0 place-items-center rounded-full text-xl hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white" aria-label="Đóng ảnh" @click="closePreview">✕</button>
      </div>
      <div class="flex min-h-0 flex-1 items-center justify-center px-2 pb-2">
        <p v-if="failed[previewPhoto.id]" role="alert" class="p-6 text-center text-white/80">Không tải được ảnh mẫu.</p>
        <img v-else :src="previewPhoto.src" :alt="previewPhoto.filename" :width="previewPhoto.width" :height="previewPhoto.height" class="max-h-full max-w-full rounded-md object-contain">
      </div>
      <div class="rounded-t-2xl bg-white px-3 pb-3 pt-2 text-ink">
        <button
          type="button"
          class="focus-ring min-h-11 w-full rounded-full border text-base font-semibold transition-colors"
          :class="previewSelected ? 'border-heart bg-heart text-white' : 'border-line-strong bg-white text-brand'"
          :aria-pressed="previewSelected"
          @click="act({ type: 'toggle', id: previewPhoto.id })"
        >
          {{ previewSelected ? '♥ Đã chọn' : '♡ Chọn ảnh' }}
        </button>
      </div>
    </div>

    <span
      v-if="tapPoint"
      aria-hidden="true"
      class="pointer-events-none absolute z-40"
      :style="{ left: `${tapPoint.x}px`, top: `${tapPoint.y}px` }"
      data-demo-tap
    >
      <span
        class="absolute rounded-full border-2 border-brand"
        :style="{ width: `${(15 + tapPoint.progress * 17) * 2}px`, height: `${(15 + tapPoint.progress * 17) * 2}px`, transform: 'translate(-50%, -50%)', opacity: Math.sin(Math.PI * tapPoint.progress) * 0.8 }"
      />
      <span class="absolute size-[18px] rounded-full bg-white" :style="{ transform: 'translate(-50%, -50%)', opacity: Math.sin(Math.PI * tapPoint.progress) * 0.62 }" />
      <span class="absolute size-[7px] rounded-full bg-brand" :style="{ transform: 'translate(-50%, -50%)', opacity: Math.sin(Math.PI * tapPoint.progress) }" />
    </span>
    <div v-if="fade" aria-hidden="true" class="pointer-events-none absolute inset-0 z-50 bg-canvas" :style="{ opacity: fade }" />
  </div>
</template>
