import { expect, test } from '@playwright/test'
import { PUBLIC_PAGES } from '../../shared/site'

function tag(html: string, name: string, value: string): string | undefined {
  return html.match(/<(?:meta|link)\b[^>]*>/g)?.find(item => item.includes(`${name}="${value}"`))
}

function attr(element: string | undefined, name: string): string | undefined {
  return element?.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1]
}

test('branded OG image is public and has the intended dimensions', async ({ request }) => {
  const response = await request.get('/images/og/zeno-studio.png')
  expect(response.ok()).toBe(true)
  expect(response.headers()['content-type']).toContain('image/png')
  const image = await response.body()
  expect(image.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  expect(image.readUInt32BE(16)).toBe(1200)
  expect(image.readUInt32BE(20)).toBe(630)
  expect(image.length).toBeLessThanOrEqual(1_000_000)
})

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
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /^https?:\/\/.+\/images\/og\/zeno-studio\.png$/)
  const jsonLd = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent() ?? '{}')
  const types = jsonLd['@graph'].map((node: { '@type': string }) => node['@type'])
  expect(types).toEqual(expect.arrayContaining(['Organization', 'WebSite', 'WebApplication', 'FAQPage']))
})

for (const publicRoute of PUBLIC_PAGES) {
  test(`SSR SEO metadata for ${publicRoute.path}`, async ({ request, baseURL }) => {
    const origin = new URL(baseURL!).origin
    const url = `${origin}${publicRoute.path}`
    const html = await (await request.get(publicRoute.path)).text()
    const image = `${origin}/images/og/zeno-studio.png`
    expect(attr(tag(html, 'rel', 'canonical'), 'href')).toBe(url)
    expect(attr(tag(html, 'property', 'og:url'), 'content')).toBe(url)
    expect(attr(tag(html, 'name', 'description'), 'content')).toBe(publicRoute.description)
    expect(attr(tag(html, 'property', 'og:title'), 'content')).toBe(publicRoute.title)
    expect(attr(tag(html, 'property', 'og:description'), 'content')).toBe(publicRoute.description)
    expect(attr(tag(html, 'property', 'og:image'), 'content')).toBe(image)
    expect(attr(tag(html, 'name', 'twitter:image'), 'content')).toBe(image)
    expect(attr(tag(html, 'property', 'og:image:type'), 'content')).toBe('image/png')
    expect(attr(tag(html, 'property', 'og:image:width'), 'content')).toBe('1200')
    expect(attr(tag(html, 'property', 'og:image:height'), 'content')).toBe('630')
    expect(attr(tag(html, 'property', 'og:image:alt'), 'content')).toContain('Zeno Studio')
    expect(attr(tag(html, 'name', 'twitter:image:alt'), 'content')).toContain('Zeno Studio')
  })
}

test('canonical and social URL omit public query strings', async ({ request, baseURL }) => {
  const html = await (await request.get('/create?token=secret')).text()
  const canonical = `${new URL(baseURL!).origin}/create`
  expect(attr(tag(html, 'rel', 'canonical'), 'href')).toBe(canonical)
  expect(attr(tag(html, 'property', 'og:url'), 'content')).toBe(canonical)
})

test('capability-token routes are not indexable', async ({ request }) => {
  const response = await request.get('/guest/albums/00000000-0000-0000-0000-000000000000')
  expect(response.headers()['x-robots-tag']).toBe('noindex, nofollow')
})
