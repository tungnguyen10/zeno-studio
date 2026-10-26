import { expect, test } from '@playwright/test'

const albumId = '11111111-1111-4111-8111-111111111111'
const photoId = '22222222-2222-4222-8222-222222222222'
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" />'

for (const status of ['PUBLISHED', 'FINALIZED'] as const) {
  test(`Focus offers original download in ${status}`, async ({ page }) => {
    await page.route('https://drive.google.com/thumbnail**', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg }))
    await page.route(`**/api/album/${albumId}/**`, route => {
      const path = new URL(route.request().url()).pathname
      const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
      if (path.endsWith('/access')) return json({ album: {
        id: albumId, title: 'Album tải', status, currentCycle: 1, expiresAt: '2030-01-01T00:00:00Z',
        joined: true, canJoin: false, settings: { limitKind: 'unlimited', limitMin: null, limitMax: null },
        download: { canSingle: true, canSelected: false, canAll: false, reason: null, selectedSource: status === 'PUBLISHED' ? 'live' : 'snapshot', selectedCount: 0 },
      } })
      if (path.endsWith('/photos')) return json({ items: [{ id: photoId, sourceFileId: 'drive-download', filename: 'A.jpg', width: 800, height: 1000, status: 'READY', sortOrder: 0, selected: false }], nextCursor: null, total: 1, selectedCount: 0 })
      if (path.endsWith('/selection')) return json({ version: 0, selectedPhotoIds: [] })
      return route.continue()
    })
    await page.goto(`/album/${albumId}`)
    await page.getByRole('button', { name: 'Mở ảnh A.jpg' }).click()
    await expect(page.getByRole('link', { name: 'Tải ảnh gốc A.jpg' })).toHaveAttribute('href', `/api/album/${albumId}/photos/${photoId}/download`)
  })
}
