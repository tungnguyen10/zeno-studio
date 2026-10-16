import { describe, expect, it } from 'vitest'
import { aspectRatio, gridColumns, gridRows, justifiedRows, listRows, masonryItemHeight } from '../../app/lib/gallery-layout'

describe('gallery layout', () => {
  it('clamps ratios and falls back for unknown dimensions', () => {
    expect(aspectRatio({ width: null, height: null })).toBe(0.8)
    expect(aspectRatio({ width: 10000, height: 10 })).toBe(4)
    expect(aspectRatio({ width: 10, height: 10000 })).toBe(0.25)
  })

  it('computes grid columns and uniform rows', () => {
    expect(gridColumns(390, 160, 12)).toBe(2)
    expect(gridColumns(1200, 200, 16)).toBe(5)
    const rows = gridRows(5, 412, 2, 12, 0.8, 40)
    expect(rows).toHaveLength(3)
    expect(rows[0]!.items[1]).toMatchObject({ index: 1, left: 212, width: 200, height: 290 })
    expect(rows[2]!.items).toHaveLength(1)
  })

  it('packs justified rows that fill the width exactly, except the last row', () => {
    const items = Array.from({ length: 7 }, (_, index) => ({ width: index % 2 ? 1500 : 1000, height: 1000 }))
    const rows = justifiedRows(items, 1000, 200, 8)
    for (const row of rows.slice(0, -1)) {
      const last = row.items.at(-1)!
      expect(last.left + last.width).toBeCloseTo(1000, 5)
    }
    expect(rows.at(-1)!.height).toBeLessThanOrEqual(200)
    expect(rows.flatMap(row => row.items.map(item => item.index))).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('keeps one very wide panorama on its own full-width row', () => {
    const rows = justifiedRows([{ width: 8000, height: 1000 }, { width: 800, height: 1000 }], 600, 200, 8)
    expect(rows[0]!.items).toHaveLength(1)
    expect(rows[0]!.items[0]!.width).toBeCloseTo(600, 5)
  })

  it('handles 10,000 items quickly', () => {
    const items = Array.from({ length: 10000 }, (_, index) => ({ width: 800 + (index % 7) * 100, height: 1000 }))
    const started = performance.now()
    const rows = justifiedRows(items, 1200, 220, 8)
    expect(performance.now() - started).toBeLessThan(200)
    expect(rows.reduce((sum, row) => sum + row.items.length, 0)).toBe(10000)
  })

  it('builds list rows and masonry heights', () => {
    expect(listRows(3, 500, 96)).toHaveLength(3)
    expect(listRows(3, 0, 96)).toEqual([])
    expect(masonryItemHeight({ width: 800, height: 1000 }, 200)).toBe(250)
  })
})
