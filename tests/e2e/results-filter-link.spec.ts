import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const albumId = '11111111-1111-4111-8111-111111111111'
const studioId = '22222222-2222-4222-8222-222222222222'
const versionId = '33333333-3333-4333-8333-333333333333'

test('Results locks its version for search, export, and the album filter link', async ({ page }) => {
  const requests: string[] = []
  await page.route(`**/api/studio/${studioId}/albums/${albumId}/**`, route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/results/export')) {
      expect(url.searchParams.get('versionId')).toBe(versionId)
      return route.fulfill({ status: 200, headers: { 'content-type': 'text/csv', 'content-disposition': 'attachment; filename="selection.csv"' }, body: 'filename,notes\r\nA.JPG,Chỉnh sáng\r\nB.JPG,\r\n' })
    }
    if (url.pathname.endsWith('/results')) {
      requests.push(url.search)
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        selectionVersionId: versionId, versionNumber: 2, finalizedAt: '2026-10-17T00:00:00Z', total: 2, notesCount: 1,
        items: url.searchParams.get('notesFilter') === 'without' ? [] : [{ photoId: '44444444-4444-4444-8444-444444444444', filename: 'A.JPG', notes: [{ text: 'Chỉnh sáng' }] }], nextCursor: null,
      }) })
    }
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
  await page.getByRole('combobox', { name: 'Ghi chú' }).click()
  await page.getByRole('option', { name: 'Chưa có ghi chú' }).click()
  await expect(page.getByText('Không có ảnh phù hợp.')).toBeVisible()
  expect(requests.some(query => query.includes(`versionId=${versionId}`) && query.includes('notesFilter=without'))).toBe(true)
  const downloadEvent = page.waitForEvent('download')
  await page.getByText('Xuất danh sách / ghi chú').click()
  await page.getByRole('button', { name: 'Selection CSV' }).click()
  const download = await downloadEvent
  expect(await readFile(await download.path(), 'utf8')).toContain('B.JPG')
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

test('retired production, review, and delivery endpoints are unavailable', async ({ request }) => {
  const paths = [
    `/api/album/${albumId}/review`,
    `/api/guest/albums/${albumId}/production`,
    `/api/guest/albums/${albumId}/review`,
    `/api/guest/albums/${albumId}/delivery`,
    `/api/studio/${studioId}/albums/${albumId}/production`,
    `/api/studio/${studioId}/albums/${albumId}/review`,
    `/api/studio/${studioId}/albums/${albumId}/delivery`,
  ]
  for (const path of paths) {
    expect((await request.get(path)).status(), path).toBe(404)
    expect((await request.post(path, { data: {} })).status(), path).toBe(404)
  }
  for (const path of [
    `/api/guest/albums/${albumId}/production/${versionId}`,
    `/api/studio/${studioId}/albums/${albumId}/production/${versionId}`,
  ]) expect((await request.patch(path, { data: {} })).status(), path).toBe(404)
})

test('guest filter manifest requires the admin cookie', async ({ request }) => {
  const response = await request.get(`/api/guest/albums/${albumId}/selections/${versionId}/filter-manifest`)
  expect(response.status()).toBe(403)
})
