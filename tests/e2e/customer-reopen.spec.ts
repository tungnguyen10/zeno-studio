import { expect, test } from '@playwright/test'

const albumId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const photoId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

test('an open customer tab sees the retained set when the studio reopens selection', async ({ page }) => {
  let status = 'FINALIZED'
  let cycle = 1
  await page.route('https://drive.google.com/thumbnail**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" />' }))
  await page.route(`**/api/album/${albumId}/**`, route => {
    const path = new URL(route.request().url()).pathname
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    if (path.endsWith('/access')) return json({ album: {
      id: albumId, title: 'Album khách', status, currentCycle: cycle, expiresAt: '2030-01-01T00:00:00Z', joined: true, canJoin: false,
      settings: { limitKind: 'unlimited', limitMin: null, limitMax: null },
    } })
    if (path.endsWith('/photos')) return json({ items: [{ id: photoId, sourceFileId: 'drive-a', filename: 'A.jpg', width: 800, height: 1000, status: 'READY', sortOrder: 0, selected: status === 'PUBLISHED' }], nextCursor: null, total: 1, selectedCount: status === 'PUBLISHED' ? 1 : 0 })
    if (path.endsWith('/selection')) return json({ version: 2, selectedPhotoIds: [photoId] })
    if (path.endsWith('/review')) return json({ review: null })
    return route.continue()
  })
  await page.goto(`/album/${albumId}`)
  await expect(page.getByText('Bộ ảnh đã chốt', { exact: false })).toBeVisible()
  status = 'PUBLISHED'
  cycle = 2
  await expect(page.getByRole('button', { name: 'Bỏ chọn A.jpg' })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('1 ảnh đã chọn', { exact: false })).toBeVisible()
})
