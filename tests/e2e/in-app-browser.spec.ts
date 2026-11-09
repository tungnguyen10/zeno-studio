import { expect, test, type Page } from '@playwright/test'

const albumId = '44444444-4444-4444-8444-444444444444'
const zaloIos = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Zalo iOS/500'
const zaloAndroid = 'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36 Zalo android/12100'

async function setup(page: Page, userAgent: string) {
  const accessCalls: string[] = []
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(agent => {
    Object.defineProperty(navigator, 'userAgent', { configurable: true, get: () => agent })
  }, userAgent)
  await page.route(`**/api/album/${albumId}/**`, route => {
    const path = new URL(route.request().url()).pathname
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    if (path.endsWith('/access')) {
      accessCalls.push(route.request().method())
      return json({ album: { id: albumId, title: 'Album Zalo', status: 'FINALIZED', currentCycle: 1, expiresAt: '2030-01-01T00:00:00Z', joined: true, canJoin: false, settings: { limitKind: 'unlimited', limitMin: null, limitMax: null } } })
    }
    if (path.endsWith('/photos')) return json({ items: [], nextCursor: null, total: 0, selectedCount: 0 })
    return route.continue()
  })
  await page.goto(`/album/${albumId}?token=abc`)
  return accessCalls
}

test('iOS in-app browser asks to open Safari before redeeming the link', async ({ page }) => {
  const accessCalls = await setup(page, zaloIos)
  const notice = page.getByRole('region', { name: /Mở album bằng trình duyệt/ })
  await expect(notice).toBeVisible()
  await expect(notice.getByText('Mở bằng Safari')).toBeVisible()
  expect(accessCalls).toEqual([])
  await page.getByRole('button', { name: 'Tiếp tục ở đây' }).click()
  await expect(page.getByRole('heading', { name: 'Album Zalo' })).toBeVisible()
  expect(accessCalls.length).toBeGreaterThan(0)
})

test('Android in-app browser falls back to the notice when the intent does not leave', async ({ page }) => {
  const accessCalls = await setup(page, zaloAndroid)
  await expect(page.getByRole('button', { name: 'Thử mở lại trình duyệt' })).toBeVisible({ timeout: 5000 })
  expect(accessCalls).toEqual([])
})

test('regular browsers open the album directly', async ({ page }) => {
  await setup(page, 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')
  await expect(page.getByRole('heading', { name: 'Album Zalo' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Tiếp tục ở đây' })).toHaveCount(0)
})
