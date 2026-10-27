import { expect, test, type Page, type Route } from '@playwright/test'

const studioId = '11111111-1111-4111-8111-111111111111'
const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

async function signIn(page: Page, role: 'owner' | 'manager') {
  await page.route('**/api/auth/get-session', route => json(route, {
    user: { id: 'u', name: 'Studio', email: 'studio@example.test', emailVerified: true }, session: { id: 's' },
  }))
  await page.route('**/api/studio', route => json(route, { studios: [{ id: studioId, name: 'Studio mẫu', role }] }))
  await page.route('**/api/admin/access', route => json(route, { isAdmin: false }))
}

test('owner sees workflow and consented gallery metrics across date ranges', async ({ page }) => {
  await signIn(page, 'owner')
  const ranges: number[] = []
  await page.route(`**/api/studio/${studioId}/analytics?*`, route => {
    const days = Number(new URL(route.request().url()).searchParams.get('days'))
    ranges.push(days)
    return json(route, { report: {
      days, asOf: '2026-10-27T00:00:00.000Z', timezone: 'Asia/Ho_Chi_Minh',
      albumsCreated: 3, albumsPublished: 2, selectionFinalized: 1, albumsFinalized: 1,
      galleryOpens: 8, fileMatchRuns: 2, matchedCount: 30, missingCount: 1, ambiguousCount: 1,
      trend: [{ date: '2026-10-27', albumsCreated: 3, albumsPublished: 2, selectionFinalized: 1, galleryOpens: 8, fileMatchRuns: 2 }],
      albums: [{ id: 'a', title: 'Ảnh cưới Hà Nội', status: 'FINALIZED', photoCount: 40, selectedCount: 30, noteCount: 4, galleryOpens: 8, latestVersion: 1 }],
    } })
  })
  await page.setViewportSize({ width: 320, height: 780 })
  await page.goto(`/studio/analytics?studio=${studioId}`)
  await expect(page.getByRole('heading', { name: 'Thống kê studio' })).toBeVisible()
  await expect(page.getByText('Tạm tắt ghi nhận lượt mở; số cũ vẫn hiển thị')).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: 'Ảnh cưới Hà Nội' })).toContainText('30')
  await page.getByRole('button', { name: '7 ngày' }).click()
  await expect.poll(() => ranges.at(-1)).toBe(7)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
})

test('manager cannot see the studio report or analytics navigation', async ({ page }) => {
  await signIn(page, 'manager')
  let queried = false
  await page.route(`**/api/studio/${studioId}/analytics?*`, route => { queried = true; return json(route, {}, 403) })
  await page.goto(`/studio/analytics?studio=${studioId}`)
  await expect(page.getByRole('alert')).toContainText('Chỉ chủ studio')
  expect(queried).toBe(false)
  await expect(page.getByRole('link', { name: 'Thống kê', exact: true })).toHaveCount(0)
})
