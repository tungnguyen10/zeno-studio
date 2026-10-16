export type GalleryLayout = 'justified' | 'grid' | 'masonry' | 'list'

export const GALLERY_LAYOUTS: { value: GalleryLayout; label: string }[] = [
  { value: 'justified', label: 'Hàng đều' },
  { value: 'grid', label: 'Lưới' },
  { value: 'masonry', label: 'So le' },
  { value: 'list', label: 'Danh sách' },
]

export interface Dimensions { width: number | null; height: number | null }
export interface PlacedItem { index: number; left: number; width: number; height: number }
export interface LayoutRow { height: number; items: PlacedItem[] }

const FALLBACK_RATIO = 0.8
const MIN_RATIO = 0.25
const MAX_RATIO = 4

export function aspectRatio(item: Dimensions): number {
  if (!item.width || !item.height) return FALLBACK_RATIO
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, item.width / item.height))
}

export function isGalleryLayout(value: unknown): value is GalleryLayout {
  return value === 'justified' || value === 'grid' || value === 'masonry' || value === 'list'
}

export function gridColumns(containerWidth: number, minCellWidth: number, gap: number, minColumns = 2): number {
  return Math.max(minColumns, Math.floor((containerWidth + gap) / (minCellWidth + gap)))
}

// Uniform cells; `extraHeight` reserves the caption under each image.
export function gridRows(count: number, containerWidth: number, columns: number, gap: number, cellRatio: number, extraHeight: number): LayoutRow[] {
  if (count === 0 || containerWidth <= 0) return []
  const width = (containerWidth - gap * (columns - 1)) / columns
  const height = width / cellRatio + extraHeight
  const rows: LayoutRow[] = []
  for (let start = 0; start < count; start += columns) {
    const items: PlacedItem[] = []
    for (let index = start; index < Math.min(count, start + columns); index++) {
      items.push({ index, left: (index - start) * (width + gap), width, height })
    }
    rows.push({ height, items })
  }
  return rows
}

// Packs items into rows whose height makes them exactly fill the width; the trailing row keeps the target height.
export function justifiedRows(items: Dimensions[], containerWidth: number, targetHeight: number, gap: number): LayoutRow[] {
  if (items.length === 0 || containerWidth <= 0) return []
  const rows: LayoutRow[] = []
  let start = 0
  let ratioSum = 0
  const closeRow = (end: number, fill: boolean) => {
    const gaps = gap * (end - start - 1)
    const height = fill ? (containerWidth - gaps) / ratioSum : Math.min(targetHeight, (containerWidth - gaps) / ratioSum)
    const placed: PlacedItem[] = []
    let left = 0
    for (let index = start; index < end; index++) {
      const width = aspectRatio(items[index]!) * height
      placed.push({ index, left, width, height })
      left += width + gap
    }
    rows.push({ height, items: placed })
  }
  for (let index = 0; index < items.length; index++) {
    ratioSum += aspectRatio(items[index]!)
    const gaps = gap * (index - start)
    if (ratioSum * targetHeight + gaps >= containerWidth) {
      closeRow(index + 1, true)
      start = index + 1
      ratioSum = 0
    }
  }
  if (start < items.length) closeRow(items.length, false)
  return rows
}

export function listRows(count: number, containerWidth: number, rowHeight: number): LayoutRow[] {
  if (containerWidth <= 0) return []
  return Array.from({ length: count }, (_, index) => ({ height: rowHeight, items: [{ index, left: 0, width: containerWidth, height: rowHeight }] }))
}

export function masonryItemHeight(item: Dimensions, columnWidth: number): number {
  return columnWidth / aspectRatio(item)
}
