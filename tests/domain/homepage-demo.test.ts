import { readFileSync, statSync } from 'node:fs'
import { crc32 as nodeCrc32 } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { GALLERY_LAYOUTS } from '../../app/lib/gallery-layout'
import { demoLayout } from '../../app/lib/homepage-demo/layout'
import { DEMO_PHOTOS, demoSubtitle, demoZipEntryName } from '../../app/lib/homepage-demo/photos'
import { applyDemoAction, initialDemoState, visibleDemoPhotos, type DemoAction } from '../../app/lib/homepage-demo/selection'
import { createStoredZipBytes, crc32 } from '../../app/lib/homepage-demo/stored-zip'
import {
  STORYBOARD_REDUCED_MOTION_TIME,
  STORYBOARD_SELECTION,
  STORYBOARD_TAPS,
  formatStoryboardClock,
  heartScrollTarget,
  smoothstep,
  storyboardFrame,
  type StoryboardGeometry,
} from '../../app/lib/homepage-demo/storyboard'

const publicFile = (src: string) => new URL(`../../public${src}`, import.meta.url)
const geometry: StoryboardGeometry = { scrollTo: id => Number(id) * 10, resultScroll: 120 }
const run = (actions: DemoAction[]) => actions.reduce(applyDemoAction, initialDemoState())

describe('homepage demo dataset', () => {
  it('ships 24 distinct sample photos with stable ids, filenames and WebP assets', () => {
    expect(DEMO_PHOTOS).toHaveLength(24)
    expect(DEMO_PHOTOS.map(photo => photo.id)).toEqual(Array.from({ length: 24 }, (_, index) => String(index + 1).padStart(4, '0')))
    expect(DEMO_PHOTOS[0]).toMatchObject({ filename: 'ZENO_0001.jpg', src: '/images/demo/zeno-0001.webp' })
    expect(DEMO_PHOTOS[23]!.filename).toBe('ZENO_0024.jpg')
    let total = 0
    for (const photo of DEMO_PHOTOS) {
      const bytes = readFileSync(publicFile(photo.src))
      expect(bytes.subarray(0, 4).toString('latin1')).toBe('RIFF')
      expect(bytes.subarray(8, 12).toString('latin1')).toBe('WEBP')
      total += statSync(publicFile(photo.src)).size
    }
    expect(total).toBe(171_534)
    expect(new Set(DEMO_PHOTOS.map(photo => readFileSync(publicFile(photo.src)).toString('base64'))).size).toBe(24)
  })

  it('keeps dimensions in sync with the provenance manifest', () => {
    const manifest = JSON.parse(readFileSync(publicFile('/images/demo/provenance.json'), 'utf8')) as { photos: Array<{ filename: string; width: number; height: number; asset: string }> }
    expect(manifest.photos.map(photo => [photo.filename, photo.width, photo.height, photo.asset]))
      .toEqual(DEMO_PHOTOS.map(photo => [photo.filename, photo.width, photo.height, photo.src]))
  })

  it('formats the subtitle and names ZIP entries after the real WebP format', () => {
    expect(demoSubtitle(24)).toBe('24 ảnh · Hạn 30/11/2026')
    expect(demoZipEntryName(DEMO_PHOTOS[3]!)).toBe('ZENO_0004.webp')
  })
})

describe('homepage demo selection state', () => {
  it('toggles hearts, filters to the chosen ids in album order and keeps them across layouts', () => {
    const state = run([
      { type: 'toggle', id: '0010' }, { type: 'toggle', id: '0001' }, { type: 'toggle', id: '0004' },
      { type: 'setLayout', layout: 'grid' }, { type: 'toggleFilter' },
    ])
    expect(state.selected).toEqual(['0010', '0001', '0004'])
    expect(state.layout).toBe('grid')
    expect(visibleDemoPhotos(DEMO_PHOTOS, state).map(photo => photo.id)).toEqual(['0001', '0004', '0010'])
  })

  it('unselecting the last filtered photo leaves an empty result until the filter is cleared', () => {
    const filtered = run([{ type: 'toggle', id: '0004' }, { type: 'toggleFilter' }, { type: 'toggle', id: '0004' }])
    expect(filtered.filter).toBe(true)
    expect(visibleDemoPhotos(DEMO_PHOTOS, filtered)).toEqual([])
    expect(visibleDemoPhotos(DEMO_PHOTOS, applyDemoAction(filtered, { type: 'setFilter', value: false }))).toHaveLength(24)
  })

  it('reset clears the selection, the filter and returns to masonry', () => {
    const state = run([{ type: 'toggle', id: '0002' }, { type: 'toggleFilter' }, { type: 'setLayout', layout: 'list' }, { type: 'reset' }])
    expect(state).toEqual({ selected: [], filter: false, layout: 'masonry' })
  })
})

describe('homepage demo layouts', () => {
  it('matches the spec geometry on a 390px phone: two 175px masonry columns with an 8px gap', () => {
    const { boxes, gap } = demoLayout(DEMO_PHOTOS, 'masonry', 390 - 32)
    expect(gap).toBe(8)
    expect(new Set(boxes.map(box => box.width))).toEqual(new Set([175]))
    expect(new Set(boxes.map(box => box.left))).toEqual(new Set([0, 183]))
    expect(boxes[0]!.height).toBeCloseTo(175 / 0.8)
  })

  for (const { value: layout } of GALLERY_LAYOUTS) {
    it(`${layout} places all 24 ids inside the bounds without overlapping`, () => {
      for (const width of [240, 298, 358]) {
        const { boxes, height } = demoLayout(DEMO_PHOTOS, layout, width)
        expect(boxes.map(box => box.id).sort()).toEqual(DEMO_PHOTOS.map(photo => photo.id))
        for (const box of boxes) {
          expect(box.left).toBeGreaterThanOrEqual(-0.001)
          expect(box.left + box.width).toBeLessThanOrEqual(width + 0.001)
          expect(box.top + box.height).toBeLessThanOrEqual(height + 0.001)
        }
        for (const [index, a] of boxes.entries()) {
          for (const b of boxes.slice(index + 1)) {
            const overlap = a.left < b.left + b.width - 0.001 && b.left < a.left + a.width - 0.001 && a.top < b.top + b.height - 0.001 && b.top < a.top + a.height - 0.001
            expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false)
          }
        }
      }
    })
  }

  it('reserves the 56px grid caption under a 0.8 ratio image', () => {
    const { boxes } = demoLayout(DEMO_PHOTOS, 'grid', 358)
    expect(boxes[0]!.height).toBeCloseTo(175 / 0.8 + 56)
  })
})

describe('homepage demo storyboard', () => {
  const selectedAt = (time: number) => storyboardFrame(time, geometry).state.selected

  it('selects 0001/0004/0009/0015/0020 250ms after each tap, counting 0→5', () => {
    expect(selectedAt(0)).toEqual([])
    expect(selectedAt(1_449)).toEqual([])
    expect(selectedAt(1_450)).toEqual(['0001'])
    expect(selectedAt(2_750)).toEqual(['0001', '0004'])
    expect(selectedAt(4_850)).toHaveLength(3)
    expect(selectedAt(7_100)).toHaveLength(4)
    expect(selectedAt(9_400)).toEqual([...STORYBOARD_SELECTION])
  })

  it('filters to exactly the five chosen photos and restarts cleanly', () => {
    expect(storyboardFrame(12_149, geometry).state.filter).toBe(false)
    const review = storyboardFrame(12_150, geometry)
    expect(review.state.filter).toBe(true)
    expect(review.phase).toBe('review')
    expect(visibleDemoPhotos(DEMO_PHOTOS, review.state).map(photo => photo.id)).toEqual([...STORYBOARD_SELECTION])
    expect(storyboardFrame(17_500, geometry).state).toEqual(initialDemoState())
    expect(storyboardFrame(18_000 + 1_450, geometry).state.selected).toEqual(['0001'])
  })

  it('walks through the caption phases', () => {
    expect([0, 1_300, 4_000, 10_500, 12_200].map(time => storyboardFrame(time, geometry).phase))
      .toEqual(['open', 'select', 'browse', 'return', 'review'])
  })

  it('scrolls with smoothstep easing to the measured targets and back to the top', () => {
    expect(storyboardFrame(3_000, geometry).scroll).toBe(0)
    expect(storyboardFrame(4_350, geometry).scroll).toBe(geometry.scrollTo('0009'))
    expect(storyboardFrame(6_600, geometry).scroll).toBe(geometry.scrollTo('0015'))
    expect(storyboardFrame(8_900, geometry).scroll).toBe(geometry.scrollTo('0020'))
    const midway = storyboardFrame(3_900, geometry).scroll
    expect(midway).toBeCloseTo(geometry.scrollTo('0009') * smoothstep(0.5))
    expect(storyboardFrame(11_500, geometry).scroll).toBe(0)
    expect(storyboardFrame(14_000, geometry).scroll).toBe(0)
    expect(storyboardFrame(15_200, geometry).scroll).toBe(geometry.resultScroll)
  })

  it('shows a 620ms tap ring on each heart and on the filter', () => {
    for (const tap of STORYBOARD_TAPS) {
      expect(storyboardFrame(tap.at + 310, geometry).tap).toEqual({ target: tap.target, progress: 0.5 })
      expect(storyboardFrame(tap.at + 621, geometry).tap).toBeNull()
    }
  })

  it('uses the 15.9s still for reduced motion and fades only around the loop restart', () => {
    const still = storyboardFrame(STORYBOARD_REDUCED_MOTION_TIME, geometry)
    expect(still.state.filter).toBe(true)
    expect(still.state.selected).toHaveLength(5)
    expect(still.fade).toBe(0)
    expect(storyboardFrame(17_500, geometry).fade).toBeCloseTo(1)
  })

  it('keeps the heart above the middle of the screen and clamps to the scroll range', () => {
    expect(heartScrollTarget({ galleryTop: 200, cardTop: 600, viewportHeight: 720, maxScroll: 2_000 })).toBe(488)
    expect(heartScrollTarget({ galleryTop: 200, cardTop: 0, viewportHeight: 720, maxScroll: 2_000 })).toBe(0)
    expect(heartScrollTarget({ galleryTop: 200, cardTop: 5_000, viewportHeight: 720, maxScroll: 2_000 })).toBe(2_000)
    expect(formatStoryboardClock(7_400)).toBe('00:07 / 00:18')
  })
})

describe('homepage demo ZIP', () => {
  it('stores the chosen WebP bytes with valid headers, names and CRCs', () => {
    const chosen = DEMO_PHOTOS.filter(photo => ['0001', '0004', '0010'].includes(photo.id))
    const entries = chosen.map(photo => ({ name: demoZipEntryName(photo), bytes: new Uint8Array(readFileSync(publicFile(photo.src))) }))
    const zip = createStoredZipBytes(entries)
    const view = new DataView(zip.buffer)
    const decoder = new TextDecoder()

    const endOffset = zip.length - 22
    expect(view.getUint32(endOffset, true)).toBe(0x06054b50)
    expect(view.getUint16(endOffset + 10, true)).toBe(3)
    let central = view.getUint32(endOffset + 16, true)
    const found: string[] = []
    for (const entry of entries) {
      expect(view.getUint32(central, true)).toBe(0x02014b50)
      const nameLength = view.getUint16(central + 28, true)
      const name = decoder.decode(zip.subarray(central + 46, central + 46 + nameLength))
      const local = view.getUint32(central + 42, true)
      expect(view.getUint32(local, true)).toBe(0x04034b50)
      const size = view.getUint32(local + 18, true)
      const data = zip.subarray(local + 30 + nameLength, local + 30 + nameLength + size)
      expect(name).toBe(entry.name)
      expect(data).toEqual(entry.bytes)
      expect(view.getUint32(local + 14, true)).toBe(nodeCrc32(data))
      expect(decoder.decode(data.subarray(8, 12))).toBe('WEBP')
      found.push(name)
      central += 46 + nameLength
    }
    expect(found).toEqual(['ZENO_0001.webp', 'ZENO_0004.webp', 'ZENO_0010.webp'])
  })

  it('computes standard CRC-32 and refuses an empty archive', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
    expect(() => createStoredZipBytes([])).toThrow()
  })
})
