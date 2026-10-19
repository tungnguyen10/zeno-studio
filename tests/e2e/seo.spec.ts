import { expect, test } from '@playwright/test'

test('robots.txt blocks private routes and links the sitemap', async ({ request, baseURL }) => {
  const response = await request.get('/robots.txt')
  expect(response.ok()).toBe(true)
  const body = await response.text()
  expect(body).toContain('Disallow: /album/')
  expect(body).toContain('Disallow: /guest/')
  expect(body).toContain(`Sitemap: ${new URL(baseURL!).origin}/sitemap.xml`)
})

test('sitemap lists only public pages', async ({ request }) => {
  const body = await (await request.get('/sitemap.xml')).text()
  expect(body).toContain('/tools/file-filter</loc>')
  expect(body).not.toContain('/album/')
  expect(body).not.toContain('/guest/')
})

test('llms.txt summarises the product', async ({ request }) => {
  const response = await request.get('/llms.txt')
  expect(response.ok()).toBe(true)
  expect(await response.text()).toMatch(/^# Zeno Studio/)
})

test('home page exposes canonical, social and structured data', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/$/)
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /Zeno Studio/)
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /^https?:\/\/.+\/images\/hero\/couple\.jpg$/)
  const jsonLd = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent() ?? '{}')
  const types = jsonLd['@graph'].map((node: { '@type': string }) => node['@type'])
  expect(types).toEqual(expect.arrayContaining(['Organization', 'WebSite', 'WebApplication', 'FAQPage']))
})

test('capability-token routes are not indexable', async ({ request }) => {
  const response = await request.get('/guest/albums/00000000-0000-0000-0000-000000000000')
  expect(response.headers()['x-robots-tag']).toBe('noindex, nofollow')
})
