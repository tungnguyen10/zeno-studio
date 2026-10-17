import { expect, test, type Page } from '@playwright/test'

const albumId = '66666666-6666-4666-8666-666666666666'
const TOTAL = 10000
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#cfd8c8"/></svg>'

function photo(index: number) {
  return {
    id: `77777777-7777-4777-8777-${String(index).padStart(12, '0')}`,
    sourceFileId: `drive-${index}`,
    filename: `IMG_${String(index).padStart(5, '0')}.jpg`,
    width: index % 3 === 0 ? 1500 : 1000, height: 1000, status: 'READY', sortOrder: index, selected: index % 50 === 0,
  }
}

async function mockLargeAlbum(page: Page, requestedPages: string[]) {
  await page.route('https://drive.google.com/thumbnail**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg }))
  await page.route(`**/api/album/${albumId}/**`, route => {
    const url = new URL(route.request().url())
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    if (url.pathname.endsWith('/access')) return json({ album: {
      id: albumId, title: 'Album 10.000 ảnh', status: 'PUBLISHED', expiresAt: '2030-01-01T00:00:00Z', joined: true, canJoin: false,
      settings: { limitKind: 'unlimited', limitMin: null, limitMax: null },
    } })
    if (url.pathname.endsWith('/selection')) return json({ version: 1, selectedPhotoIds: Array.from({ length: TOTAL / 50 }, (_, i) => photo(i * 50).id) })
    if (url.pathname.endsWith('/photos')) {
      const limit = Number(url.searchParams.get('limit'))
      const onlySelected = url.searchParams.get('filter') === 'selected'
      const start = Number(url.searchParams.get('cursor') ?? 0)
      requestedPages.push(`${onlySelected ? 'selected' : 'all'}:${start}`)
      const pool = onlySelected ? TOTAL / 50 : TOTAL
      const end = Math.min(pool, start + limit)
      const items = Array.from({ length: end - start }, (_, i) => photo(onlySelected ? (start + i) * 50 : start + i))
      return json({ items, nextCursor: end < pool ? String(end) : null, total: TOTAL, selectedCount: TOTAL / 50 })
    }
    return route.continue()
  })
}

test('keeps a 10,000-photo album responsive: few DOM tiles, paged loading, layouts and server filter', async ({ page }) => {
  const requested: string[] = []
  await mockLargeAlbum(page, requested)
  await page.goto(`/album/${albumId}`)
  const gallery = page.getByRole('list', { name: 'Ảnh trong album' })
  await expect(gallery.getByRole('listitem').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'So le' })).toHaveAttribute('aria-pressed', 'true')

  for (let step = 0; step < 15; step++) await page.mouse.wheel(0, 4000)
  await expect.poll(() => requested.filter(entry => entry.startsWith('all:')).length).toBeGreaterThan(2)
  expect(await gallery.getByRole('listitem').count()).toBeLessThan(250)

  for (const layout of ['Lưới', 'Hàng đều', 'Danh sách', 'So le']) {
    await page.getByRole('button', { name: layout, exact: true }).click()
    await expect(gallery.getByRole('listitem').first()).toBeVisible()
    expect(await gallery.getByRole('listitem').count()).toBeLessThan(250)
  }

  await page.evaluate(() => window.scrollTo(0, 0))
  await page.getByRole('button', { name: 'Xem ảnh đã chọn' }).click()
  await expect(page.getByRole('button', { name: 'Mở ảnh IMG_00050.jpg' })).toBeVisible()
  expect(requested).toContain('selected:0')
})
