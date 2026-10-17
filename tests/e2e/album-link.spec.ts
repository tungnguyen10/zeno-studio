import { expect, test, type Page } from '@playwright/test'

const albumId = '11111111-1111-4111-8111-111111111111'
const token = 'a'.repeat(43)

const album = {
  id: albumId, title: 'Album mẫu', status: 'PUBLISHED', currentCycle: 1, expiresAt: '2030-01-01T00:00:00Z',
  joined: true, canJoin: false, settings: { limitKind: 'unlimited', limitMin: null, limitMax: null },
}

async function mockAlbum(page: Page, hasCookie: () => boolean, onRedeem: () => void, redeemOk = true) {
  await page.route(`**/api/album/${albumId}/**`, route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const json = (status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (path.endsWith('/access') && request.method() === 'POST') {
      onRedeem()
      return redeemOk ? json(200, { scope: 'customer', participantId: null }) : json(403, { statusMessage: 'denied' })
    }
    if (path.endsWith('/access')) return hasCookie() ? json(200, { album }) : json(403, { statusMessage: 'denied' })
    if (path.endsWith('/photos')) return json(200, { items: [], nextCursor: null, total: 0, selectedCount: 0 })
    if (path.endsWith('/selection')) return json(200, { version: 0, selectedPhotoIds: [] })
    return route.continue()
  })
}

test('keeps the token in the URL and redeems it once when no cookie exists', async ({ page }) => {
  let cookie = false
  let redeemed = 0
  await mockAlbum(page, () => cookie, () => { redeemed++; cookie = true })

  await page.goto(`/album/${albumId}?token=${token}`)
  await expect(page.getByRole('heading', { name: 'Album mẫu' })).toBeVisible()
  await expect(page).toHaveURL(`/album/${albumId}?token=${token}`)

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Album mẫu' })).toBeVisible()
  expect(redeemed).toBe(1)
})

test('explains a link that has lost its token', async ({ page }) => {
  await mockAlbum(page, () => false, () => {})
  await page.goto(`/album/${albumId}`)
  await expect(page.getByText('Link thiếu mã truy cập')).toBeVisible()
})

test('rejects a token that cannot be redeemed', async ({ page }) => {
  await mockAlbum(page, () => false, () => {}, false)
  await page.goto(`/album/${albumId}?token=${token}`)
  await expect(page.getByText('Link album không hợp lệ hoặc đã hết hạn')).toBeVisible()
})
