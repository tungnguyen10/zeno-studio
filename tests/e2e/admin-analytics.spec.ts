import { expect, test, type Route } from '@playwright/test'

const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

test('shows a private site report and switches date ranges', async ({ page }) => {
  const requests: string[] = []
  await page.route('**/api/auth/get-session', route => json(route, { user: { id: 'admin', email: 'admin@example.test', emailVerified: true }, session: { id: 's' } }))
  await page.route('**/api/admin/access', route => json(route, { isAdmin: true }))
  await page.route('**/api/admin/analytics?*', route => {
    const days = Number(new URL(route.request().url()).searchParams.get('days'))
    requests.push(String(days))
    return json(route, { report: {
      days, asOf: '2026-10-27T00:00:00.000Z', timezone: 'Asia/Ho_Chi_Minh',
      activeUsers: 12, pageViews: 34,
      trend: [{ date: '2026-10-27', activeUsers: 4, pageViews: 11 }],
      pages: [{ path: '/studio', views: 18 }],
      events: [{ name: 'album_created', count: 3 }],
    } })
  })
  await page.goto('/admin/analytics')
  await expect(page.getByRole('heading', { name: 'Thống kê toàn Zeno Studio' })).toBeVisible()
  await expect(page.locator('main').getByText('12', { exact: true })).toBeVisible()
  await expect(page.locator('main').getByText('34', { exact: true })).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: '/studio' })).toContainText('18')
  await page.getByRole('button', { name: '7 ngày' }).click()
  await expect(page.getByRole('button', { name: '7 ngày' })).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => requests.at(-1)).toBe('7')
})

test('shows an explicit GA4 error and stays usable at 320 px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 780 })
  await page.route('**/api/auth/get-session', route => json(route, { user: { id: 'admin', email: 'admin@example.test', emailVerified: true }, session: { id: 's' } }))
  await page.route('**/api/admin/access', route => json(route, { isAdmin: true }))
  await page.route('**/api/admin/analytics?*', route => json(route, { statusMessage: 'Không tải được báo cáo GA4' }, 502))
  await page.goto('/admin/analytics')
  await expect(page.getByRole('alert')).toContainText('Không tải được báo cáo GA4')
  await expect(page.getByRole('button', { name: 'Thử lại' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
})
