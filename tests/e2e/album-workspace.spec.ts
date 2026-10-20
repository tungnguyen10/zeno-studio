import { expect, test } from '@playwright/test'

const studioId = '33333333-3333-4333-8333-333333333333'
const albumId = '44444444-4444-4444-8444-444444444444'
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="#cfd8c8"/></svg>'
const photos = Array.from({ length: 12 }, (_, index) => ({
  id: `55555555-5555-4555-8555-${String(index).padStart(12, '0')}`,
  sourceFileId: `drive-${index}`,
  filename: index === 1 ? 'Untitled Session0001 rất dài để kiểm tra cắt tên file trên mobile.jpg' : `DSC0${4300 + index}.jpg`,
  width: index % 4 === 0 ? 1500 : 800, height: 1000, sortOrder: index, selected: index % 3 === 0,
}))

const viewports = [
  { name: 'mobile', viewport: { width: 390, height: 844 } },
  { name: 'tablet', viewport: { width: 820, height: 1180 } },
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
]

test('studio thumbnails fall back to the existing authenticated image route', async ({ page }) => {
  const proxied: string[] = []
  await page.route('https://drive.google.com/thumbnail**', route => route.fulfill({ status: 429, body: 'Rate limited' }))
  await page.route(`**/api/studio/${studioId}/albums/${albumId}/photos/${photos[0]!.id}/image`, route => {
    proxied.push(route.request().url())
    return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg })
  })
  await page.route(`**/api/studio/${studioId}/albums/${albumId}`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    id: albumId, title: 'Album ảnh', status: 'FINALIZED', expiresAt: '2030-01-01T00:00:00Z', canFinalize: true,
    hasResults: true, previousCount: 0, settings: { limitKind: 'unlimited', limitMin: null, limitMax: null }, photoCount: 1, selectedCount: 0,
  }) }))
  await page.route(`**/api/studio/${studioId}/albums/${albumId}/photos?*`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    items: [{ ...photos[0], previouslyFinalized: false }], nextCursor: null, total: 1, selectedCount: 0,
  }) }))
  await page.goto(`/studio/albums/${albumId}?studio=${studioId}`)
  await expect.poll(() => proxied.length).toBe(1)
  await expect(page.getByText('Không tải được ảnh', { exact: true })).toHaveCount(0)
})

for (const { name, viewport } of viewports) {
  test.describe(`studio album workspace on ${name}`, () => {
    test.use({ viewport })

    test('shows the previous final set and lets the studio keep or replace it after reopening', async ({ page }) => {
      let albumStatus = 'FINALIZED'
      let finalizeBody: unknown
      const prior = photos[0]!
      const replacement = photos[1]!
      await page.route('https://drive.google.com/thumbnail**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg }))
      await page.route(`**/api/studio/${studioId}/albums/${albumId}`, route => route.fulfill({
        status: 200, contentType: 'application/json', body: JSON.stringify({
          id: albumId, title: 'Mochi', status: albumStatus, expiresAt: '2030-01-01T00:00:00Z', canFinalize: true,
          hasResults: true, previousCount: 1,
          settings: { limitKind: 'maximum', limitMin: null, limitMax: 20 }, photoCount: photos.length, selectedCount: albumStatus === 'PUBLISHED' ? 1 : 4,
        }),
      }))
      await page.route(`**/api/studio/${studioId}/albums/${albumId}/photos?*`, route => {
        const filter = new URL(route.request().url()).searchParams.get('filter')
        const all = photos.map(photo => ({ ...photo, selected: albumStatus === 'PUBLISHED' ? photo.id === prior.id : photo.selected, previouslyFinalized: photo.id === prior.id }))
        const items = filter === 'previous' ? all.filter(photo => photo.previouslyFinalized) : filter === 'selected' ? all.filter(photo => photo.selected) : all
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items, nextCursor: null, total: photos.length, selectedCount: albumStatus === 'PUBLISHED' ? 1 : 4 }) })
      })
      await page.route(`**/api/studio/${studioId}/albums/${albumId}/reopen`, route => {
        albumStatus = 'PUBLISHED'
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ cycle: 2 }) })
      })
      await page.route(`**/api/studio/${studioId}/albums/${albumId}/finalize`, route => {
        finalizeBody = route.request().postDataJSON()
        albumStatus = 'FINALIZED'
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ versionNumber: 2, count: 1 }) })
      })
      await page.goto(`/studio/albums/${albumId}?studio=${studioId}`)
      await page.getByRole('button', { name: 'Bộ đã chốt (1)' }).click()
      await expect(page.getByRole('list', { name: 'Ảnh trong album' }).getByRole('listitem')).toHaveCount(1)
      await expect(page.getByText('Đã chốt trước', { exact: true })).toBeVisible()
      await expect(page.getByRole('link', { name: /Xem kết quả/ })).toBeVisible()
      await expect(page.getByRole('button', { name: prior.filename })).toHaveCount(0)
      if (viewport.width < 1024) await page.getByRole('button', { name: 'Thêm' }).click()
      await page.getByRole('button', { name: 'Mở vòng chọn mới' }).click()
      await expect(page.getByRole('button', { name: 'Chốt 1 ảnh' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Bộ chốt trước (1)' })).toBeVisible()
      await page.getByRole('button', { name: `Chốt ${prior.filename}` }).click()
      await page.getByRole('button', { name: /Tất cả/ }).click()
      await page.getByRole('button', { name: `Chốt ${replacement.filename}` }).click()
      await page.getByRole('button', { name: 'Chốt 1 ảnh' }).click()
      await expect.poll(() => finalizeBody).toEqual({ include: [replacement.id], exclude: [prior.id] })
    })

    test('shows a skeleton, then the photo gallery with filters, layouts and finalize adjustments', async ({ page }) => {
      let release: () => void = () => {}
      const gate = new Promise<void>(resolve => { release = resolve })
      let finalizeBody: unknown
      await page.route('https://drive.google.com/thumbnail**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg }))
      await page.route(`**/api/studio/${studioId}/albums/${albumId}`, async route => {
        await gate
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          id: albumId, title: 'Mochi', status: 'PUBLISHED', expiresAt: '2030-01-01T00:00:00Z', canFinalize: true, hasResults: false,
          settings: { limitKind: 'maximum', limitMin: null, limitMax: 20 }, photoCount: photos.length, selectedCount: 4,
        }) })
      })
      await page.route(`**/api/studio/${studioId}/albums/${albumId}/photos?*`, route => {
        const onlySelected = new URL(route.request().url()).searchParams.get('filter') === 'selected'
        const items = onlySelected ? photos.filter(photo => photo.selected) : photos
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items, nextCursor: null, total: photos.length, selectedCount: 4 }) })
      })
      await page.route(`**/api/studio/${studioId}/albums/${albumId}/finalize`, route => {
        finalizeBody = route.request().postDataJSON()
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ versionNumber: 1, count: 4 }) })
      })
      await page.goto(`/studio/albums/${albumId}?studio=${studioId}`)
      await expect(page.getByRole('status', { name: 'Đang tải album' })).toBeVisible()
      await page.screenshot({ path: `test-results/workspace-${name}-loading.png` })
      release()
      await expect(page.getByRole('heading', { name: 'Mochi' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Chốt 4 ảnh' })).toBeVisible()
      await page.getByRole('button', { name: 'Chốt DSC04302.jpg' }).click()
      await expect(page.getByRole('button', { name: 'Chốt DSC04302.jpg' })).toHaveAttribute('aria-pressed', 'true')
      await page.getByRole('button', { name: 'Chốt DSC04300.jpg' }).click()
      await expect(page.getByRole('button', { name: 'Chốt 4 ảnh' })).toBeVisible()
      await page.screenshot({ path: `test-results/workspace-${name}.png` })
      for (const layout of ['Lưới', 'So le', 'Danh sách']) {
        await page.getByRole('button', { name: layout, exact: true }).click()
        await page.screenshot({ path: `test-results/workspace-${name}-${layout === 'Lưới' ? 'grid' : layout === 'So le' ? 'masonry' : 'list'}.png` })
      }
      await page.getByRole('button', { name: 'Khách đã chọn (4)' }).click()
      await expect(page.getByRole('list', { name: 'Ảnh trong album' }).getByRole('listitem')).toHaveCount(4)
      await page.getByRole('button', { name: 'Chốt 4 ảnh' }).click()
      await expect.poll(() => finalizeBody).toEqual({ include: [photos[2]!.id], exclude: [photos[0]!.id] })
    })
  })
}

for (const width of [320, 1244]) {
  test(`finalized workspace stays usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.route('https://drive.google.com/thumbnail**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg }))
    await page.route(`**/api/studio/${studioId}/albums/${albumId}`, route => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({
        id: albumId, title: 'Album chụp ảnh rất dài để kiểm tra giao diện trên màn hình hẹp', status: 'FINALIZED',
        expiresAt: '2030-01-01T00:00:00Z', canFinalize: true, hasResults: true, previousCount: 4,
        settings: { limitKind: 'maximum', limitMin: null, limitMax: 20 }, photoCount: photos.length, selectedCount: 4,
      }),
    }))
    await page.route(`**/api/studio/${studioId}/albums/${albumId}/photos?*`, route => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ items: photos.map(photo => ({ ...photo, previouslyFinalized: photo.selected })), nextCursor: null, total: photos.length, selectedCount: 4 }),
    }))
    await page.goto(`/studio/albums/${albumId}?studio=${studioId}`)
    await expect(page.getByRole('heading', { name: /Album chụp ảnh rất dài/ })).toBeVisible()
    await expect(page.getByText('Khách đã chọn 4')).toBeVisible()
    await expect(page.getByRole('link', { name: /Xem kết quả/ })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    if (width < 1024) {
      await expect(page.getByRole('button', { name: 'Thêm' })).toBeVisible()
      await page.getByRole('button', { name: 'Thêm' }).click()
      await expect(page.getByRole('button', { name: 'Mở vòng chọn mới' })).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.getByRole('button', { name: 'Thêm' })).toBeFocused()
      await expect(page.getByRole('button', { name: 'Mở vòng chọn mới' })).toBeHidden()
      await page.getByRole('button', { name: 'Thêm' }).click()
      await page.mouse.click(2, 100)
      await expect(page.getByRole('button', { name: 'Thêm' })).toBeFocused()
    } else {
      await expect(page.getByRole('button', { name: 'Mở vòng chọn mới' })).toBeVisible()
    }
    await page.screenshot({ path: `test-results/workspace-finalized-${width}.png` })
  })
}

test('mobile finalized actions keep sharing feedback in the More panel', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const customerToken = 'a'.repeat(43)
  let shareRequests = 0
  await page.route('**/api/studio', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ studios: [{ id: studioId, name: 'Studio Mẫu', role: 'owner' }] }),
  }))
  await page.route(`**/api/studio/${studioId}/albums/${albumId}/share`, route => {
    shareRequests++
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ customerToken }) })
  })
  await page.route(`**/api/studio/${studioId}/albums/${albumId}`, route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({
      id: albumId, title: 'Album đã chốt', status: 'FINALIZED', expiresAt: '2030-01-01T00:00:00Z', canFinalize: true,
      hasResults: true, previousCount: 4, settings: { limitKind: 'maximum', limitMin: null, limitMax: 20 }, photoCount: 12, selectedCount: 4,
    }),
  }))
  await page.route(`**/api/studio/${studioId}/albums/${albumId}/photos?*`, route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], nextCursor: null, total: 12, selectedCount: 4 }),
  }))
  await page.goto(`/studio/albums/${albumId}?studio=${studioId}`)
  await page.getByRole('button', { name: 'Thêm' }).click()
  await expect(page.getByRole('button', { name: 'Sao chép link khách' })).toBeVisible()
  await page.getByRole('button', { name: 'Sao chép link khách' }).click()
  await expect(page.getByRole('button', { name: 'Thêm' })).toHaveAttribute('aria-expanded', 'true')
  await page.getByRole('button', { name: 'Link và mã QR' }).click()
  const dialog = page.getByRole('dialog', { name: 'Chia sẻ Album đã chốt' })
  await expect(dialog.getByRole('link', { name: /album\/.*token=/ })).toHaveAttribute('href', `http://127.0.0.1:43627/album/${albumId}?token=${customerToken}`)
  expect(shareRequests).toBe(1)
  await dialog.getByRole('button', { name: 'Đóng' }).click()
  await page.setViewportSize({ width: 1244, height: 844 })
  await expect(page.getByRole('button', { name: 'Link và mã QR' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1244)
})

for (const scenario of [
  { name: 'read-only', status: 'FINALIZED', expiresAt: '2030-01-01T00:00:00Z', role: 'retoucher' },
  { name: 'expired', status: 'FINALIZED', expiresAt: '2020-01-01T00:00:00Z', role: 'owner' },
  { name: 'historical', status: 'DELIVERED', expiresAt: '2030-01-01T00:00:00Z', role: 'retoucher' },
]) {
  test(`${scenario.name} album still opens results without unavailable actions`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.route('**/api/studio', route => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ studios: [{ id: studioId, name: 'Studio Mẫu', role: scenario.role }] }),
    }))
    await page.route(`**/api/studio/${studioId}/albums/${albumId}`, route => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({
        id: albumId, title: 'Album lịch sử', status: scenario.status, expiresAt: scenario.expiresAt,
        canFinalize: false, hasResults: true, previousCount: 4,
        settings: { limitKind: 'maximum', limitMin: null, limitMax: 20 }, photoCount: 12, selectedCount: 4,
      }),
    }))
    await page.route(`**/api/studio/${studioId}/albums/${albumId}/photos?*`, route => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], nextCursor: null, total: 12, selectedCount: 4 }),
    }))
    await page.goto(`/studio/albums/${albumId}?studio=${studioId}`)
    await expect(page.getByRole('link', { name: 'Xem kết quả' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Thêm' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Mở vòng chọn mới' })).toHaveCount(0)
  })
}
