import { gridColumns, gridRows, justifiedRows, listRows, masonryItemHeight, type Dimensions, type GalleryLayout, type LayoutRow } from '../gallery-layout'

// Mirrors PhotoGallery's sizing rules so the demo matches the album page, but returns
// absolute boxes for a small, fixed set of photos instead of a window virtualizer.
export const DEMO_GRID_CAPTION_HEIGHT = 56
export const DEMO_LIST_ROW_HEIGHT = 96

export interface DemoBox { id: string; index: number; left: number; top: number; width: number; height: number }
export interface DemoLayoutResult { boxes: DemoBox[]; height: number; gap: number }

export function demoGalleryGap(width: number): number {
  return width < 640 ? 8 : 12
}

export function demoLayout<T extends Dimensions & { id: string }>(items: readonly T[], layout: GalleryLayout, width: number): DemoLayoutResult {
  const gap = demoGalleryGap(width)
  if (width <= 0 || items.length === 0) return { boxes: [], height: 0, gap }

  if (layout === 'masonry') {
    const columns = gridColumns(width, width < 640 ? 150 : 220, gap)
    const columnWidth = (width - gap * (columns - 1)) / columns
    const ends = Array.from({ length: columns }, () => 0)
    const boxes = items.map((item, index) => {
      // Same rule as the virtualizer's lanes: the shortest column wins, ties go left.
      const lane = ends.indexOf(Math.min(...ends))
      const height = masonryItemHeight(item, columnWidth)
      const box = { id: item.id, index, left: lane * (columnWidth + gap), top: ends[lane]!, width: columnWidth, height }
      ends[lane]! += height + gap
      return box
    })
    return { boxes, height: Math.max(...ends) - gap, gap }
  }

  const columns = gridColumns(width, width < 640 ? 150 : width < 1024 ? 190 : 210, gap)
  let rows: LayoutRow[]
  if (layout === 'grid') rows = gridRows(items.length, width, columns, gap, 0.8, DEMO_GRID_CAPTION_HEIGHT)
  else if (layout === 'justified') rows = justifiedRows(items as readonly Dimensions[] as Dimensions[], width, width < 640 ? 140 : width < 1024 ? 180 : 220, gap)
  else rows = listRows(items.length, width, DEMO_LIST_ROW_HEIGHT)

  const boxes: DemoBox[] = []
  let top = 0
  for (const row of rows) {
    for (const placed of row.items) {
      boxes.push({ id: items[placed.index]!.id, index: placed.index, left: placed.left, top, width: placed.width, height: placed.height })
    }
    top += row.height + gap
  }
  return { boxes, height: Math.max(0, top - gap), gap }
}
