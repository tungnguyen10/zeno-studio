import { expect, test } from '@playwright/test'

const albumId = '11111111-1111-4111-8111-111111111111'
const studioId = '22222222-2222-4222-8222-222222222222'
const versionId = '33333333-3333-4333-8333-333333333333'

test('Results locks its version for search, export, and the album filter link', async ({ page }) => {
  const requests: string[] = []
  await page.route(`**/api/studio/${studioId}/albums/${albumId}/**`, route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/results')) {
      requests.push(url.search)
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        selectionVersionId: versionId, versionNumber: 2, finalizedAt: '2026-10-17T00:00:00Z', total: 2, notesCount: 1,
        items: url.searchParams.get('notesFilter') === 'without' ? [] : [{ photoId: '44444444-4444-4444-8444-444444444444', filename: 'A.JPG', notes: [{ text: 'Chỉnh sáng' }] }], nextCursor: null,
      }) })
    }
    if (url.pathname.endsWith('/production')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ canDeliver: false, items: [] }) })
    if (url.pathname.endsWith('/image')) return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg"/>' })
    if (url.pathname.endsWith('/filter-manifest')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ albumId, selectionVersionId: versionId, versionNumber: 2, finalizedAt: '2026-10-17T00:00:00Z', items: [] }) })
    return route.continue()
  })
  await page.goto(`/studio/albums/${albumId}/results?studio=${studioId}`)
  await expect(page.getByText('Phiên bản 2', { exact: true })).toBeVisible()
  await expect(page.getByText('2 ảnh', { exact: true })).toBeVisible()
  await expect(page.getByText('1 ảnh có ghi chú', { exact: true })).toBeVisible()
  const filterLink = page.getByRole('link', { name: 'Lọc ảnh gốc' })
  await expect(filterLink).toHaveAttribute('href', `/studio/albums/${albumId}/filter?studio=${studioId}&version=${versionId}`)
  await page.getByLabel('Ghi chú').selectOption('without')
  await expect(page.getByText('Không có ảnh phù hợp.')).toBeVisible()
  expect(requests.some(query => query.includes(`versionId=${versionId}`) && query.includes('notesFilter=without'))).toBe(true)
})

test('Results separates selection, production, and review steps with a clear review gate', async ({ page }) => {
  await page.route(`**/api/studio/${studioId}/albums/${albumId}/**`, route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/results')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      selectionVersionId: versionId, versionNumber: 2, finalizedAt: '2026-10-17T00:00:00Z', total: 1, notesCount: 0,
      items: [{ photoId: '44444444-4444-4444-8444-444444444444', filename: 'A.JPG', notes: [] }], nextCursor: null,
    }) })
    if (url.pathname.endsWith('/production')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      canDeliver: false, review: null, items: [{ id: 'task-1', filename: 'A.JPG', status: 'PENDING' }],
    }) })
    if (url.pathname.endsWith('/image')) return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg"/>' })
    return route.continue()
  })

  await page.goto(`/studio/albums/${albumId}/results?studio=${studioId}`)
  const steps = page.getByRole('navigation', { name: 'Các bước xử lý' })
  await expect(page.getByRole('region', { name: 'Danh sách ảnh đã chốt' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Bắt đầu chỉnh' })).toBeHidden()

  await steps.getByRole('link', { name: 'Hậu kỳ' }).click()
  await expect(page).toHaveURL(new RegExp('view=production'))
  await expect(page.getByRole('heading', { name: 'Tiến độ hậu kỳ' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Bắt đầu chỉnh' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Danh sách ảnh đã chốt' })).toBeHidden()

  await steps.getByRole('link', { name: 'Duyệt & bàn giao' }).click()
  await expect(page).toHaveURL(new RegExp('view=delivery'))
  await page.reload()
  await expect(page.getByText('Cần đánh dấu 1/1 ảnh đã chỉnh trước khi mở vòng duyệt.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Mở vòng duyệt' })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Đánh dấu hoàn tất' })).toBeHidden()
})

test('Results explains when approved work is waiting for someone with delivery permission', async ({ page }) => {
  await page.route(`**/api/studio/${studioId}/albums/${albumId}/**`, route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/results')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      selectionVersionId: versionId, versionNumber: 2, finalizedAt: '2026-10-17T00:00:00Z', total: 1, notesCount: 0,
      items: [{ photoId: '44444444-4444-4444-8444-444444444444', filename: 'A.JPG', notes: [] }], nextCursor: null,
    }) })
    if (url.pathname.endsWith('/production')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      canDeliver: false, review: { roundNumber: 1, status: 'APPROVED' }, items: [{ id: 'task-1', filename: 'A.JPG', status: 'APPROVED' }],
    }) })
    return route.continue()
  })

  await page.goto(`/studio/albums/${albumId}/results?studio=${studioId}&view=delivery`)
  await expect(page.getByText('Chờ bàn giao', { exact: true })).toBeVisible()
  await expect(page.getByText('Khách đã duyệt; tài khoản này chưa có quyền bàn giao.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Đánh dấu hoàn tất' })).toBeHidden()
})

test('Results keeps a large selection scrollable without rendering every photo row', async ({ page }) => {
  const items = Array.from({ length: 100 }, (_, index) => ({
    photoId: `photo-${index}`, filename: `IMG_${String(index).padStart(4, '0')}.jpg`, notes: [],
  }))
  await page.route(`**/api/studio/${studioId}/albums/${albumId}/**`, route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/results')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      selectionVersionId: versionId, versionNumber: 2, finalizedAt: '2026-10-17T00:00:00Z', total: 100, notesCount: 0, items, nextCursor: null,
    }) })
    if (url.pathname.endsWith('/production')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ canDeliver: false, review: null, items: [] }) })
    if (url.pathname.endsWith('/image')) return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg"/>' })
    return route.continue()
  })

  await page.goto(`/studio/albums/${albumId}/results?studio=${studioId}`)
  const region = page.getByRole('region', { name: 'Danh sách ảnh đã chốt' })
  await expect(region).toBeVisible()
  expect(await region.getByRole('listitem').count()).toBeLessThan(100)
  await region.evaluate(element => { element.scrollTop = element.scrollHeight })
  await expect(region.getByRole('heading', { name: 'IMG_0099.jpg' })).toBeVisible()
})
