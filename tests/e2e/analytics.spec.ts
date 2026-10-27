import { expect, test, type Page } from '@playwright/test'
import { CONSENT_KEY } from '../../app/lib/analytics-consent'

async function commands(page: Page): Promise<unknown[][]> {
  return page.evaluate(() => (window as Window & { dataLayer?: unknown[][] }).dataLayer ?? [])
}

async function views(page: Page): Promise<unknown[][]> {
  return (await commands(page)).filter(call => call[0] === 'event' && call[1] === 'page_view')
}

async function interceptGoogle(page: Page, blocked = false) {
  const requests: string[] = []
  await page.route(/https:\/\/(?:[^/]+\.)?(?:googletagmanager\.com|google-analytics\.com|analytics\.google\.com)\//, route => {
    requests.push(route.request().url())
    return blocked ? route.abort() : route.fulfill({ status: 200, contentType: 'application/javascript', body: '' })
  })
  return requests
}

async function persistConsent(page: Page, choice: 'accepted' | 'rejected') {
  await page.addInitScript(({ key, choice }) => localStorage.setItem(key, choice), { key: CONSENT_KEY, choice })
}

test('loads only after consent and reports safe manual views', async ({ page, baseURL }) => {
  const requests = await interceptGoogle(page)
  await page.goto('/?token=secret#private-fragment')
  await expect(page.getByRole('button', { name: 'Đồng ý', exact: true })).toBeVisible()
  expect(requests).toEqual([])
  expect(await commands(page)).toEqual([])
  await page.getByRole('button', { name: 'Đồng ý', exact: true }).click()
  await expect.poll(() => requests.length).toBe(1)
  await expect.poll(async () => (await views(page)).length).toBe(1)
  const queued = await commands(page)
  expect(queued.slice(0, 2)).toEqual([
    ['consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied' }],
    ['consent', 'update', { analytics_storage: 'granted' }],
  ])
  expect(queued.find(call => call[0] === 'config')?.[2]).toEqual(expect.objectContaining({ send_page_view: false, page_location: `${baseURL}/`, page_title: 'Trang chủ' }))
  await page.getByRole('link', { name: /Tạo album nhanh/ }).first().click()
  await expect(page).toHaveURL(/\/create$/)
  await expect.poll(async () => (await views(page)).length).toBe(2)
  expect((await views(page))[1]?.[2]).toEqual({ page_location: `${baseURL}/create`, page_title: 'Tạo album', page_referrer: `${baseURL}/` })
  await page.evaluate(() => history.replaceState(history.state, '', '?token=query-secret#fragment-secret'))
  // Flush browser tasks so a history listener has an opportunity to run.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  expect(await views(page)).toHaveLength(2)
  expect(requests).toHaveLength(1)
  expect(JSON.stringify(await commands(page))).not.toMatch(/secret|private-fragment/)
})

test('persisted acceptance reports exactly one safe view in a new document', async ({ page, baseURL }) => {
  const requests = await interceptGoogle(page)
  await persistConsent(page, 'accepted')
  await page.goto('/create?token=secret')
  await expect.poll(async () => (await views(page)).length).toBe(1)
  expect(requests).toHaveLength(1)
  expect((await views(page))[0]?.[2]).toEqual({ page_location: `${baseURL}/create`, page_title: 'Tạo album' })
  expect(JSON.stringify(await commands(page))).not.toContain('secret')
})

test('rejection persists and sends no Google requests across reload', async ({ page }) => {
  const requests = await interceptGoogle(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Từ chối', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Cài đặt phân tích', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Đồng ý', exact: true })).toHaveCount(0)
  expect(await page.evaluate(key => localStorage.getItem(key), CONSENT_KEY)).toBe('rejected')
  expect(requests).toEqual([])
  expect(await commands(page)).toEqual([])
})

test('revoking active consent reloads and prevents further collection', async ({ page }) => {
  const requests = await interceptGoogle(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Đồng ý', exact: true }).click()
  await expect.poll(async () => (await views(page)).length).toBe(1)
  await page.getByRole('button', { name: 'Cài đặt phân tích', exact: true }).click()
  await Promise.all([
    page.waitForEvent('load'),
    page.getByRole('button', { name: 'Từ chối', exact: true }).click(),
  ])
  await expect(page.getByRole('button', { name: 'Cài đặt phân tích', exact: true })).toBeVisible()
  expect(await commands(page)).toEqual([])
  expect(await page.evaluate(key => localStorage.getItem(key), CONSENT_KEY)).toBe('rejected')
  await page.getByRole('link', { name: /Tạo album nhanh/ }).first().click()
  await expect(page).toHaveURL(/\/create$/)
  expect(await commands(page)).toEqual([])
  expect(requests).toHaveLength(1)
})

test('blocked tag does not prevent application navigation', async ({ page }) => {
  const requests = await interceptGoogle(page, true)
  await persistConsent(page, 'accepted')
  await page.goto('/')
  await expect.poll(() => requests.length).toBe(1)
  await page.getByRole('link', { name: /Tạo album nhanh/ }).first().click()
  await expect(page).toHaveURL(/\/create$/)
  await expect.poll(async () => (await views(page)).length).toBe(2)
  expect(JSON.stringify(await commands(page))).not.toContain('secret')
})
