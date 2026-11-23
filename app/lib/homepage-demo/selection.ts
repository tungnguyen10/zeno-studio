import type { GalleryLayout } from '../gallery-layout'

// One state model shared by the autoplay storyboard and the hands-on mode, so the heart,
// the counter and the "selected" filter can never disagree.
export interface DemoSelectionState {
  selected: readonly string[]
  filter: boolean
  layout: GalleryLayout
}

export type DemoAction =
  | { type: 'toggle'; id: string }
  | { type: 'select'; id: string }
  | { type: 'toggleFilter' }
  | { type: 'setFilter'; value: boolean }
  | { type: 'setLayout'; layout: GalleryLayout }
  | { type: 'reset' }

export const DEMO_DEFAULT_LAYOUT: GalleryLayout = 'masonry'

export function initialDemoState(): DemoSelectionState {
  return { selected: [], filter: false, layout: DEMO_DEFAULT_LAYOUT }
}

export function applyDemoAction(state: DemoSelectionState, action: DemoAction): DemoSelectionState {
  switch (action.type) {
    case 'toggle':
      return {
        ...state,
        selected: state.selected.includes(action.id)
          ? state.selected.filter(id => id !== action.id)
          : [...state.selected, action.id],
      }
    case 'select':
      return state.selected.includes(action.id) ? state : { ...state, selected: [...state.selected, action.id] }
    case 'toggleFilter':
      return { ...state, filter: !state.filter }
    case 'setFilter':
      return state.filter === action.value ? state : { ...state, filter: action.value }
    case 'setLayout':
      return state.layout === action.layout ? state : { ...state, layout: action.layout }
    case 'reset':
      return initialDemoState()
  }
}

/** Photos the gallery shows: everything, or only the selected ones in album order. */
export function visibleDemoPhotos<T extends { id: string }>(photos: readonly T[], state: DemoSelectionState): T[] {
  if (!state.filter) return [...photos]
  const chosen = new Set(state.selected)
  return photos.filter(photo => chosen.has(photo.id))
}
