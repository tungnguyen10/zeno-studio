export const GRID_WIDTHS = [320, 480, 640, 960]
export const GRID_SIZES = '(min-width: 1024px) 256px, (min-width: 640px) 33vw, 50vw'
export const LIST_SIZES = '192px'

export const FOCUS_WIDTHS = [640, 960, 1280, 1600, 2048, 2560]
export const FOCUS_SIZES = '(min-width: 1088px) 704px, (min-width: 640px) calc(100vw - 368px), 100vw'
const CONSTRAINED_FOCUS_WIDTH = 1280

const GRID_CELL_RATIO = 0.8
const MAX_THUMBNAIL_WIDTH = 2560

export function driveThumbnailUrl(fileId: string, dimension: 'w' | 'h', pixels: number): string {
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=${dimension}${pixels}`
}

// object-cover in a portrait cell crops landscape photos, so they need more pixels per cell width.
function cropScale(width: number | null, height: number | null): number {
  if (!width || !height) return 1
  return Math.max(1, width / height / GRID_CELL_RATIO)
}

function scaledWidth(width: number, scale: number): number {
  return Math.min(MAX_THUMBNAIL_WIDTH, Math.round(width * scale))
}

export function driveGridSrc(fileId: string, width: number | null, height: number | null): string {
  return driveThumbnailUrl(fileId, 'w', scaledWidth(480, cropScale(width, height)))
}

// Descriptors stay in cell-width terms so the browser's density pick accounts for the crop.
export function driveGridSrcset(fileId: string, width: number | null, height: number | null): string {
  const scale = cropScale(width, height)
  return GRID_WIDTHS.map(candidate => `${driveThumbnailUrl(fileId, 'w', scaledWidth(candidate, scale))} ${candidate}w`).join(', ')
}

interface NetworkInformation { saveData?: boolean; effectiveType?: string }

export function focusWidthCap(): number {
  const connection = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { connection?: NetworkInformation }).connection
  const constrained = connection?.saveData || ['slow-2g', '2g', '3g'].includes(connection?.effectiveType ?? '')
  return constrained ? CONSTRAINED_FOCUS_WIDTH : MAX_THUMBNAIL_WIDTH
}

export function driveFocusSrc(fileId: string, cap: number): string {
  return driveThumbnailUrl(fileId, 'w', Math.min(1280, cap))
}

export function driveFocusSrcset(fileId: string, cap: number): string {
  return FOCUS_WIDTHS.filter(candidate => candidate <= cap).map(candidate => `${driveThumbnailUrl(fileId, 'w', candidate)} ${candidate}w`).join(', ')
}

// A changed query forces a fresh request after a transient Drive failure.
export function withRetryParam(url: string): string {
  return `${url}&retry=1`
}

export function retryDelayMs(): number {
  return 600 + Math.round(Math.random() * 600)
}
