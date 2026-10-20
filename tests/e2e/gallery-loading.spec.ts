import { expect, test } from '@playwright/test'

const albumId = '88888888-8888-4888-8888-888888888888'
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="#ddd"/></svg>'
const photo = (index: number) => ({
  id: `99999999-9999-4999-8999-${String(index).padStart(12, '0')}`,
  sourceFileId: `drive-${index}`, filename: `IMG_${index}.jpg`, width: 800, height: 1000,
  status: 'READY', sortOrder: index, selected: false,
})

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('zeno-gallery-layout', 'grid'))
  await page.route('https://drive.google.com/thumbnail**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg }))
})

test('starts photos and selection together, showing photos while selection sync is pending', async ({ page }) => {
  let releasePhotos = () => {}
  let releaseSelection = () => {}
  const photosGate = new Promise<void>(resolve => { releasePhotos = resolve })
  const selectionGate = new Promise<void>(resolve => { releaseSelection = resolve })
  const requested: string[] = []
  await page.route(`**/api/album/${albumId}/**`, async route => {
    const path = new URL(route.request().url()).pathname
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    if (path.endsWith('/access')) return json({ album: { id: albumId, title: 'Album nhanh', status: 'PUBLISHED', expiresAt: '2030-01-01', joined: true, canJoin: false, settings: { limitKind: 'unlimited', limitMin: null, limitMax: null } } })
    if (path.endsWith('/photos')) { requested.push('photos'); await photosGate; return json({ items: [photo(0)], nextCursor: null, total: 1, selectedCount: 0 }) }
    if (path.endsWith('/selection')) { requested.push('selection'); await selectionGate; return json({ version: 0, selectedPhotoIds: [] }) }
    return route.continue()
  })

  try {
    await page.goto(`/album/${albumId}`)
    await expect.poll(() => requested, { timeout: 1500 }).toContain('selection')
    releasePhotos()
    await expect(page.getByRole('button', { name: 'Mở ảnh IMG_0.jpg' })).toBeVisible()
    await expect(page.getByText('Đang đồng bộ lựa chọn…')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Chọn IMG_0.jpg' })).toBeDisabled()
    releaseSelection()
    await expect(page.getByText('Đang đồng bộ lựa chọn…')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Chọn IMG_0.jpg' })).toBeEnabled()
  } finally { releasePhotos(); releaseSelection() }
})

test('limits high priority thumbnails to the leading images', async ({ page }) => {
  await page.route(`**/api/album/${albumId}/**`, route => {
    const path = new URL(route.request().url()).pathname
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    if (path.endsWith('/access')) return json({ album: { id: albumId, title: 'Album nhiều ảnh', status: 'PUBLISHED', expiresAt: '2030-01-01', joined: true, canJoin: false, settings: { limitKind: 'unlimited', limitMin: null, limitMax: null } } })
    if (path.endsWith('/photos')) return json({ items: Array.from({ length: 30 }, (_, index) => photo(index)), nextCursor: null, total: 30, selectedCount: 0 })
    if (path.endsWith('/selection')) return json({ version: 0, selectedPhotoIds: [] })
    return route.continue()
  })
  await page.goto(`/album/${albumId}`)
  await expect(page.getByRole('list', { name: 'Ảnh trong album' }).getByRole('listitem').first()).toBeVisible()
  expect(await page.locator('img[fetchpriority="high"]').count()).toBeLessThanOrEqual(2)
})

test('prefetches only the next sharp Focus image', async ({ page }) => {
  const focusRequests: string[] = []
  await page.route('https://drive.google.com/thumbnail**', route => {
    const url = new URL(route.request().url())
    if (Number(url.searchParams.get('sz')?.slice(1)) >= 640) focusRequests.push(url.searchParams.get('id') ?? '')
    return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg })
  })
  await page.route(`**/api/album/${albumId}/**`, route => {
    const path = new URL(route.request().url()).pathname
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    if (path.endsWith('/access')) return json({ album: { id: albumId, title: 'Album duyệt', status: 'PUBLISHED', expiresAt: '2030-01-01', joined: true, canJoin: false, settings: { limitKind: 'unlimited', limitMin: null, limitMax: null } } })
    if (path.endsWith('/photos')) return json({ items: Array.from({ length: 4 }, (_, index) => photo(index)), nextCursor: null, total: 4, selectedCount: 0 })
    if (path.endsWith('/selection')) return json({ version: 0, selectedPhotoIds: [] })
    if (path.includes('/notes/')) return json({ body: '', version: 0 })
    return route.continue()
  })
  await page.goto(`/album/${albumId}`)
  await page.getByRole('button', { name: 'Mở ảnh IMG_1.jpg' }).click()
  await expect.poll(() => focusRequests).toContain('drive-2')
  expect(focusRequests).not.toContain('drive-0')
})

test('keeps the Focus skeleton until the sharp image is ready', async ({ page }) => {
  let releaseFocus = () => {}
  const gate = new Promise<void>(resolve => { releaseFocus = resolve })
  await page.route('https://drive.google.com/thumbnail**', async route => {
    const size = Number(new URL(route.request().url()).searchParams.get('sz')?.slice(1))
    if (size >= 640) await gate
    return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg })
  })
  await page.route(`**/api/album/${albumId}/**`, route => {
    const path = new URL(route.request().url()).pathname
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    if (path.endsWith('/access')) return json({ album: { id: albumId, title: 'Album nét', status: 'PUBLISHED', expiresAt: '2030-01-01', joined: true, canJoin: false, settings: { limitKind: 'unlimited', limitMin: null, limitMax: null } } })
    if (path.endsWith('/photos')) return json({ items: [photo(0)], nextCursor: null, total: 1, selectedCount: 0 })
    if (path.endsWith('/selection')) return json({ version: 0, selectedPhotoIds: [] })
    if (path.includes('/notes/')) return json({ body: '', version: 0 })
    return route.continue()
  })
  try {
    await page.goto(`/album/${albumId}`)
    await page.getByRole('button', { name: 'Mở ảnh IMG_0.jpg' }).click()
    const dialog = page.getByRole('dialog', { name: 'IMG_0.jpg' })
    await expect(dialog.locator('.photo-placeholder[data-loading]')).toBeVisible()
    await expect(dialog.locator('img[alt=""]')).toHaveCount(0)
    releaseFocus()
    await expect(dialog.locator('img[alt="IMG_0.jpg"]')).toHaveClass(/opacity-100/)
  } finally { releaseFocus() }
})

test('starts next-image prefetch while the current sharp image finishes decoding', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLImageElement.prototype.decode
    HTMLImageElement.prototype.decode = function () {
      if (this.alt === 'IMG_1.jpg') return new Promise<void>(resolve => { (window as Window & { releaseFocusDecode?: () => void }).releaseFocusDecode = resolve })
      return original.call(this)
    }
  })
  const focusRequests: string[] = []
  await page.route('https://drive.google.com/thumbnail**', route => {
    const url = new URL(route.request().url())
    if (Number(url.searchParams.get('sz')?.slice(1)) >= 640) focusRequests.push(url.searchParams.get('id') ?? '')
    return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg })
  })
  await page.route(`**/api/album/${albumId}/**`, route => {
    const path = new URL(route.request().url()).pathname
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    if (path.endsWith('/access')) return json({ album: { id: albumId, title: 'Album giải mã', status: 'PUBLISHED', expiresAt: '2030-01-01', joined: true, canJoin: false, settings: { limitKind: 'unlimited', limitMin: null, limitMax: null } } })
    if (path.endsWith('/photos')) return json({ items: Array.from({ length: 3 }, (_, index) => photo(index)), nextCursor: null, total: 3, selectedCount: 0 })
    if (path.endsWith('/selection')) return json({ version: 0, selectedPhotoIds: [] })
    if (path.includes('/notes/')) return json({ body: '', version: 0 })
    return route.continue()
  })
  try {
    await page.goto(`/album/${albumId}`)
    await page.getByRole('button', { name: 'Mở ảnh IMG_1.jpg' }).click()
    await expect.poll(() => focusRequests).toContain('drive-2')
    await expect(page.getByRole('dialog', { name: 'IMG_1.jpg' }).locator('.photo-placeholder[data-loading]')).toBeVisible()
  } finally { await page.evaluate(() => (window as Window & { releaseFocusDecode?: () => void }).releaseFocusDecode?.()).catch(() => {}) }
})
