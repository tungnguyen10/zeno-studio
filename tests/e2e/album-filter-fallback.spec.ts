import { expect, test } from '@playwright/test'

const albumId = '11111111-1111-4111-8111-111111111111'
const studioId = '22222222-2222-4222-8222-222222222222'
const versionId = '33333333-3333-4333-8333-333333333333'

test('shows snapshot exports when the browser cannot choose a folder', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'showDirectoryPicker', { configurable: true, value: undefined }))
  await page.route(`**/api/studio/${studioId}/albums/${albumId}/selections/${versionId}/filter-manifest`, route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({
      albumId, selectionVersionId: versionId, versionNumber: 2, finalizedAt: '2026-10-17T00:00:00Z',
      items: [{ photoId: 'a', originalFilename: 'A.JPG', notes: [{ text: 'Chỉnh sáng' }] }],
    }),
  }))
  await page.goto(`/studio/albums/${albumId}/filter?studio=${studioId}&version=${versionId}`)
  await expect(page.getByText('Trình duyệt này không hỗ trợ chọn và copy thư mục.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Tải tên file TXT' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Tải ghi chú CSV' }).first()).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Chọn RAW', exact: true })).toBeDisabled()
})
