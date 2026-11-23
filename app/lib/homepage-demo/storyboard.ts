import { applyDemoAction, initialDemoState, type DemoAction, type DemoSelectionState } from './selection'

// V4 storyboard: an 18 s loop that only schedules actions and scroll positions. Selection
// itself always goes through applyDemoAction, the same reducer the hands-on mode uses.
export const STORYBOARD_DURATION = 18_000
export const STORYBOARD_TAP_MS = 620
export const STORYBOARD_SELECT_DELAY = 250
export const STORYBOARD_REDUCED_MOTION_TIME = 15_900
export const STORYBOARD_SELECTION = ['0001', '0004', '0009', '0015', '0020'] as const

const FILTER_TAP_AT = 11_900
const RESULT_SCROLL = { start: 14_300, end: 15_200 }
const FADE = { start: 17_000, end: 18_000 }
const RESTART_AT = 17_500

export type TapTarget = { kind: 'heart'; id: string } | { kind: 'filter' }
export type StoryboardPhase = 'open' | 'select' | 'browse' | 'return' | 'review'

export const STORYBOARD_TAPS: ReadonlyArray<{ at: number; target: TapTarget }> = [
  { at: 1_200, target: { kind: 'heart', id: '0001' } },
  { at: 2_500, target: { kind: 'heart', id: '0004' } },
  { at: 4_600, target: { kind: 'heart', id: '0009' } },
  { at: 6_850, target: { kind: 'heart', id: '0015' } },
  { at: 9_150, target: { kind: 'heart', id: '0020' } },
  { at: FILTER_TAP_AT, target: { kind: 'filter' } },
]

// `to: null` scrolls back to the top of the album.
const SCROLLS: ReadonlyArray<{ start: number; end: number; to: string | null }> = [
  { start: 3_450, end: 4_350, to: '0009' },
  { start: 5_700, end: 6_600, to: '0015' },
  { start: 8_000, end: 8_900, to: '0020' },
  { start: 10_400, end: 11_500, to: null },
]

export const STORYBOARD_CAPTIONS: Record<StoryboardPhase, string> = {
  open: '24 ảnh mẫu trong giao diện Zeno hiện tại.',
  select: 'Chạm tim để chọn ảnh yêu thích.',
  browse: 'Vuốt tiếp album, chọn thêm ảnh.',
  return: 'Quay về đầu album.',
  review: 'Lọc lại đúng 5 ảnh vừa chọn.',
}

export interface StoryboardGeometry {
  /** Scroll offset that brings a photo's heart into view, measured from the real cards. */
  scrollTo: (id: string) => number
  /** Scroll offset that reveals the last filtered photo above the selection island. */
  resultScroll: number
}

export interface StoryboardFrame {
  state: DemoSelectionState
  scroll: number
  phase: StoryboardPhase
  tap: { target: TapTarget; progress: number } | null
  /** 0..1 opacity of the canvas-coloured veil used to hide the loop restart. */
  fade: number
}

export const smoothstep = (value: number) => {
  const t = Math.min(1, Math.max(0, value))
  return t * t * (3 - 2 * t)
}

function tapAction(target: TapTarget): DemoAction {
  return target.kind === 'heart' ? { type: 'toggle', id: target.id } : { type: 'toggleFilter' }
}

export function storyboardFrame(time: number, geometry: StoryboardGeometry): StoryboardFrame {
  const clock = ((time % STORYBOARD_DURATION) + STORYBOARD_DURATION) % STORYBOARD_DURATION
  const t = clock >= RESTART_AT ? 0 : clock

  let state = initialDemoState()
  for (const tap of STORYBOARD_TAPS) {
    if (t >= tap.at + STORYBOARD_SELECT_DELAY) state = applyDemoAction(state, tapAction(tap.target))
  }

  let scroll = 0
  let from = 0
  for (const segment of SCROLLS) {
    const to = segment.to ? geometry.scrollTo(segment.to) : 0
    if (t >= segment.start) scroll = from + (to - from) * smoothstep((t - segment.start) / (segment.end - segment.start))
    from = to
  }
  if (state.filter) scroll = geometry.resultScroll * smoothstep((t - RESULT_SCROLL.start) / (RESULT_SCROLL.end - RESULT_SCROLL.start))

  const activeTap = STORYBOARD_TAPS.find(tap => t >= tap.at && t <= tap.at + STORYBOARD_TAP_MS)
  const phase: StoryboardPhase = state.filter ? 'review' : t < 1_200 ? 'open' : t >= 10_400 ? 'return' : t < 3_450 ? 'select' : 'browse'
  const fade = clock >= FADE.start ? Math.sin(((clock - FADE.start) / (FADE.end - FADE.start)) * Math.PI) : 0

  return {
    state,
    scroll,
    phase,
    tap: activeTap ? { target: activeTap.target, progress: (t - activeTap.at) / STORYBOARD_TAP_MS } : null,
    fade: Math.max(0, fade),
  }
}

/** Keeps a photo's heart a little above the middle of the phone screen (340 of 720 units). */
export function heartScrollTarget(input: { galleryTop: number; cardTop: number; viewportHeight: number; maxScroll: number }): number {
  const anchor = input.viewportHeight * (340 / 720)
  return Math.max(0, Math.min(input.maxScroll, input.galleryTop + input.cardTop + 28 - anchor))
}

export function formatStoryboardClock(time: number): string {
  const seconds = Math.floor(Math.min(STORYBOARD_DURATION - 1, Math.max(0, time)) / 1000)
  return `00:${String(seconds).padStart(2, '0')} / 00:${STORYBOARD_DURATION / 1000}`
}
