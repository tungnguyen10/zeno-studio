// Sample album for the homepage selection demo. Filenames are simulated metadata;
// the bundled assets are small WebP files (see public/images/demo/provenance.json).
export interface DemoPhoto {
  id: string
  filename: string
  width: number
  height: number
  src: string
}

const DIMENSIONS: Array<[number, number]> = [
  [240, 300], [300, 200], [240, 300], [240, 300], [240, 300], [240, 300],
  [240, 300], [300, 169], [300, 169], [300, 194], [300, 200], [200, 300],
  [300, 200], [300, 201], [300, 200], [300, 200], [200, 300], [200, 300],
  [200, 300], [300, 200], [240, 300], [240, 300], [240, 300], [200, 300],
]

export const DEMO_PHOTOS: readonly DemoPhoto[] = DIMENSIONS.map(([width, height], index) => {
  const id = String(index + 1).padStart(4, '0')
  return { id, filename: `ZENO_${id}.jpg`, width, height, src: `/images/demo/zeno-${id}.webp` }
})

export const DEMO_ALBUM = {
  title: 'Bộ ảnh mẫu',
  expiresLabel: '30/11/2026',
} as const

export function demoSubtitle(total: number): string {
  return `${total} ảnh · Hạn ${DEMO_ALBUM.expiresLabel}`
}

/** Name of a photo inside the sample ZIP: the bundled bytes are WebP, so the extension says so. */
export function demoZipEntryName(photo: DemoPhoto): string {
  return photo.filename.replace(/\.[^.]+$/, '.webp')
}
