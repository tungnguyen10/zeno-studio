<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, useTemplateRef, watch } from 'vue'
import DemoPhoneScreen from '~/components/home/DemoPhoneScreen.vue'
import { GALLERY_LAYOUTS } from '~/lib/gallery-layout'
import { DEMO_PHOTOS, demoZipEntryName } from '~/lib/homepage-demo/photos'
import { applyDemoAction, initialDemoState, type DemoAction, type DemoSelectionState } from '~/lib/homepage-demo/selection'
import { createStoredZipBytes } from '~/lib/homepage-demo/stored-zip'
import {
  STORYBOARD_CAPTIONS,
  STORYBOARD_DURATION,
  STORYBOARD_REDUCED_MOTION_TIME,
  formatStoryboardClock,
  storyboardFrame,
  type StoryboardGeometry,
} from '~/lib/homepage-demo/storyboard'

type Mode = 'demo' | 'manual'

const SCREEN_ID = 'zeno-demo-screen'
const SCREEN_DESCRIPTION = 'Mô phỏng giao diện chọn ảnh hiện tại của Zeno: album 24 ảnh xếp so le, chạm tim hồng để chọn 5 ảnh qua nhiều đoạn cuộn, rồi lọc ảnh đã chọn bằng thanh nổi.'
const RESTING_GEOMETRY: StoryboardGeometry = { scrollTo: () => 0, resultScroll: 0 }
// The phone screen is laid out as a 390×720 viewport (the spec's reference phone) and scaled
// to the frame, so columns, island and switch keep the album page's proportions.
const SCREEN_WIDTH = 390
const SCREEN_HEIGHT = 720

const screen = useTemplateRef<InstanceType<typeof DemoPhoneScreen>>('screen')
const device = useTemplateRef<HTMLElement>('device')
const viewport = useTemplateRef<HTMLElement>('viewport')
// 334px is the screen width inside a full-size 350px frame; corrected on mount.
const scale = ref(334 / SCREEN_WIDTH)

const mode = ref<Mode>('demo')
// Controls only work once the page has hydrated; exposed for tests and styling.
const hydrated = ref(false)
const status = ref('')
const failed = reactive<Record<string, boolean>>({})

// ---- Autoplay controller: one requestAnimationFrame loop, paused off-screen or in a hidden tab.
const elapsed = ref(0)
const userPaused = ref(false)
const onScreen = ref(false)
const pageHidden = ref(false)
const ready = ref(false)
let reducedStart = false
let raf = 0
let lastTime: number | null = null

const running = computed(() => mode.value === 'demo' && ready.value && !userPaused.value && onScreen.value && !pageHidden.value)
const frame = computed(() => storyboardFrame(elapsed.value, screen.value?.geometry ?? RESTING_GEOMETRY))
const caption = computed(() => STORYBOARD_CAPTIONS[frame.value.phase])
const clock = computed(() => formatStoryboardClock(elapsed.value))
const progress = computed(() => `${((elapsed.value / STORYBOARD_DURATION) * 100).toFixed(2)}%`)

function tick(now: number) {
  if (!running.value) { raf = 0; lastTime = null; return }
  // Clamp long gaps (debugger, throttled tab) so the storyboard never jumps ahead.
  if (lastTime !== null) elapsed.value = (elapsed.value + Math.min(100, now - lastTime)) % STORYBOARD_DURATION
  lastTime = now
  raf = requestAnimationFrame(tick)
}
watch(running, isRunning => {
  if (raf) cancelAnimationFrame(raf)
  raf = 0
  lastTime = null
  if (isRunning) raf = requestAnimationFrame(tick)
})

function togglePlayback() {
  if (userPaused.value) {
    if (reducedStart) { elapsed.value = 0; reducedStart = false }
    userPaused.value = false
    status.value = 'Đang phát demo.'
  }
  else {
    userPaused.value = true
    status.value = 'Đã tạm dừng demo.'
  }
}
function replay() {
  elapsed.value = 0
  reducedStart = false
  userPaused.value = false
  status.value = 'Phát lại kịch bản mẫu từ đầu.'
}

// ---- Hands-on mode: page-memory state only, never written to an API or to localStorage.
const manual = shallowRef<DemoSelectionState>(initialDemoState())
const downloadBusy = ref(false)
let manualScroll = 0

const screenState = computed(() => (mode.value === 'demo' ? frame.value.state : manual.value))

function layoutLabel(value: string) {
  return GALLERY_LAYOUTS.find(option => option.value === value)?.label ?? value
}
function onAction(action: DemoAction) {
  if (mode.value !== 'manual') return
  const next = applyDemoAction(manual.value, action)
  manual.value = next
  if (action.type === 'toggle') {
    const name = DEMO_PHOTOS.find(photo => photo.id === action.id)?.filename ?? ''
    status.value = `${next.selected.includes(action.id) ? 'Đã chọn' : 'Đã bỏ chọn'} ${name} · ${next.selected.length} ảnh đã chọn.`
  }
  else if (action.type === 'toggleFilter' || action.type === 'setFilter') {
    status.value = next.filter ? `Đang xem ${next.selected.length} ảnh đã chọn.` : `Đang xem tất cả ${DEMO_PHOTOS.length} ảnh mẫu.`
  }
  else if (action.type === 'setLayout') {
    status.value = `Bố cục ${layoutLabel(next.layout)}.`
  }
}
function resetManual() {
  manual.value = applyDemoAction(manual.value, { type: 'reset' })
  screen.value?.resetScroll()
  status.value = `Đã làm lại. Album có ${DEMO_PHOTOS.length} ảnh mẫu, chưa chọn ảnh nào.`
}

async function setMode(next: Mode) {
  if (next === mode.value) return
  if (next === 'manual') {
    mode.value = 'manual'
    status.value = 'Đã dừng demo tự chạy. Bạn có thể tự chọn ảnh trong album mẫu.'
    await nextTick()
    screen.value?.restoreScroll(manualScroll)
  }
  else {
    manualScroll = screen.value?.readScroll() ?? 0
    mode.value = 'demo'
    status.value = 'Tiếp tục demo tự chạy. Lựa chọn của bạn vẫn được giữ.'
  }
}

async function downloadZip() {
  const chosen = DEMO_PHOTOS.filter(photo => manual.value.selected.includes(photo.id))
  if (!chosen.length) {
    status.value = 'Chọn ít nhất một ảnh để tải ZIP mẫu.'
    return
  }
  downloadBusy.value = true
  try {
    const entries = await Promise.all(chosen.map(async photo => {
      const response = await fetch(photo.src)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return { name: demoZipEntryName(photo), bytes: new Uint8Array(await response.arrayBuffer()) }
    }))
    const url = URL.createObjectURL(new Blob([createStoredZipBytes(entries)], { type: 'application/zip' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'zeno-anh-mau.zip'
    document.body.append(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    status.value = `Đã tạo ZIP ${chosen.length} ảnh mẫu (.webp).`
  }
  catch {
    status.value = 'Chưa tải được ZIP ảnh mẫu. Hãy thử lại.'
  }
  finally {
    downloadBusy.value = false
  }
}

function onImageError(id: string) {
  failed[id] = true
}

// ---- Lifecycle: everything that touches window/document starts on the client and is cleaned up.
let intersection: IntersectionObserver | undefined
let resize: ResizeObserver | undefined
const measureScale = () => { if (viewport.value?.clientWidth) scale.value = viewport.value.clientWidth / SCREEN_WIDTH }
const onVisibility = () => { pageHidden.value = document.hidden }

function preloadImages(): Promise<void> {
  const loads = DEMO_PHOTOS.map(photo => new Promise<void>(resolve => {
    const image = new Image()
    image.onload = () => resolve()
    image.onerror = () => { onImageError(photo.id); resolve() }
    image.src = photo.src
  }))
  // Start even if a slow image is still on its way; the tile keeps its placeholder.
  return Promise.race([Promise.all(loads).then(() => undefined), new Promise<void>(resolve => setTimeout(resolve, 3000))])
}

onMounted(() => {
  hydrated.value = true
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    elapsed.value = STORYBOARD_REDUCED_MOTION_TIME
    userPaused.value = true
    reducedStart = true
  }
  measureScale()
  resize = new ResizeObserver(measureScale)
  if (viewport.value) resize.observe(viewport.value)
  pageHidden.value = document.hidden
  document.addEventListener('visibilitychange', onVisibility)
  if ('IntersectionObserver' in window && device.value) {
    intersection = new IntersectionObserver(([entry]) => { onScreen.value = !!entry && entry.intersectionRatio >= 0.65 }, { threshold: [0, 0.65, 1] })
    intersection.observe(device.value)
  }
  else {
    onScreen.value = true
  }
  void preloadImages().then(() => { ready.value = true })
})

onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf)
  raf = 0
  intersection?.disconnect()
  resize?.disconnect()
  document.removeEventListener('visibilitychange', onVisibility)
})

</script>

<template>
  <figure id="zeno-demo" class="mx-auto flex w-full max-w-[350px] flex-col items-center" :data-demo-mode="mode" :data-hydrated="hydrated || undefined" :data-demo-running="running" :data-demo-count="screenState.selected.length">
    <p class="mb-3 text-xs font-semibold uppercase tracking-[.14em] text-brand-soft">{{ mode === 'demo' ? 'Demo tự chạy · 24 ảnh mẫu' : 'Tự chọn ảnh · 24 ảnh mẫu' }}</p>
    <div ref="device" class="w-full rounded-[2.6rem] bg-brand-dark p-2 shadow-[0_35px_90px_-35px_rgba(39,55,35,.45)]">
      <div
        :id="SCREEN_ID"
        ref="viewport"
        class="relative aspect-[390/720] w-full overflow-hidden rounded-[2.1rem] bg-canvas"
        :role="mode === 'demo' ? 'img' : 'region'"
        :aria-label="mode === 'demo' ? SCREEN_DESCRIPTION : 'Album mẫu: tự chọn ảnh'"
      >
        <div class="absolute left-0 top-0 origin-top-left" :style="{ width: `${SCREEN_WIDTH}px`, height: `${SCREEN_HEIGHT}px`, transform: `scale(${scale})` }">
          <DemoPhoneScreen
            ref="screen"
            :photos="DEMO_PHOTOS"
            :state="screenState"
            :interactive="mode === 'manual'"
            :failed="failed"
            :scroll="mode === 'demo' ? frame.scroll : undefined"
            :tap="mode === 'demo' ? frame.tap : null"
            :fade="mode === 'demo' ? frame.fade : 0"
            :download-busy="downloadBusy"
            @action="onAction"
            @download="downloadZip"
            @error="onImageError"
          />
        </div>
      </div>
    </div>

    <figcaption class="mt-4 w-full">
      <div class="grid grid-cols-2 rounded-full border border-line bg-white p-0.5 text-sm font-semibold" role="group" aria-label="Chế độ trải nghiệm">
        <button
          v-for="option in ([{ value: 'demo', label: 'Xem demo' }, { value: 'manual', label: 'Tự chọn ảnh' }] as const)"
          :key="option.value"
          type="button"
          class="focus-ring min-h-11 rounded-full px-3 transition-colors"
          :class="mode === option.value ? 'bg-brand text-white' : 'text-muted hover:bg-tint'"
          :aria-pressed="mode === option.value"
          @click="setMode(option.value)"
        >
          {{ option.label }}
        </button>
      </div>

      <div v-if="mode === 'demo'" class="mt-3">
        <p class="min-h-10 text-center text-sm text-pretty text-muted" aria-hidden="true" data-demo-caption>{{ caption }}</p>
        <div class="mt-2 h-1 overflow-hidden rounded-full bg-line" aria-hidden="true">
          <span class="block h-full rounded-full bg-brand" :style="{ width: progress }" />
        </div>
        <div class="mt-3 flex items-center justify-between gap-3">
          <div class="flex gap-2">
            <button type="button" class="focus-ring inline-flex min-h-11 items-center rounded-full border border-line-strong bg-white px-4 text-sm font-semibold transition-colors hover:border-brand" :aria-controls="SCREEN_ID" @click="togglePlayback">{{ userPaused ? 'Phát demo' : 'Tạm dừng' }}</button>
            <button type="button" class="focus-ring inline-flex min-h-11 items-center rounded-full border border-line-strong bg-white px-4 text-sm font-semibold transition-colors hover:border-brand" :aria-controls="SCREEN_ID" @click="replay">Phát lại</button>
          </div>
          <span class="text-xs text-muted tabular-nums" aria-hidden="true">{{ clock }}</span>
        </div>
      </div>

      <div v-else class="mt-3 text-center">
        <p class="text-sm text-pretty text-muted">Chạm tim, cuộn album và thử bốn bố cục. Tải xuống nhận ZIP ảnh mẫu đã chọn.</p>
        <p class="mt-1 text-xs text-muted">Lựa chọn chỉ nằm trong bản demo này.</p>
        <button type="button" class="focus-ring mt-3 inline-flex min-h-11 items-center rounded-full border border-line-strong bg-white px-5 text-sm font-semibold transition-colors hover:border-brand" :aria-controls="SCREEN_ID" @click="resetManual">Làm lại</button>
      </div>

      <p role="status" aria-live="polite" class="mt-2 min-h-5 text-center text-xs text-muted" :class="mode === 'demo' && 'sr-only'" data-demo-status>{{ status }}</p>
    </figcaption>
  </figure>
</template>
