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
  await expect(page.getByText('Phiên bản 2 · 2 ảnh · 1 ảnh có ghi chú')).toBeVisible()
  const filterLink = page.getByRole('link', { name: 'Lọc ảnh gốc' })
  await expect(filterLink).toHaveAttribute('href', `/studio/albums/${albumId}/filter?studio=${studioId}&version=${versionId}`)
  await page.getByLabel('Ghi chú').selectOption('without')
  await expect(page.getByText('Không có ảnh phù hợp.')).toBeVisible()
  expect(requests.some(query => query.includes(`versionId=${versionId}`) && query.includes('notesFilter=without'))).toBe(true)
})
