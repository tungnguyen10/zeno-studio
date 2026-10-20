import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

const albumId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const image = readFileSync(new URL('../../public/images/hero/couple.jpg', import.meta.url))
const photo = (index: number) => ({
  id: `bbbbbbbb-bbbb-4bbb-8bbb-${String(index).padStart(12, '0')}`,
  sourceFileId: `benchmark-${index}`, filename: `IMG_${index}.jpg`, width: 1200, height: 1800,
  status: 'READY', sortOrder: index, selected: false,
})

async function measure(page: import('@playwright/test').Page, firstRowCount: number) {
  const traffic = { direct: 0, proxy: 0, bytes: 0, sizes: {} as Record<string, number> }
  await page.addInitScript(() => localStorage.setItem('zeno-gallery-layout', 'grid'))
  await page.route('https://drive.google.com/thumbnail**', async route => {
    traffic.direct++
    const size = new URL(route.request().url()).searchParams.get('sz') ?? 'unknown'
    traffic.sizes[size] = (traffic.sizes[size] ?? 0) + 1
    traffic.bytes += image.length
    await new Promise(resolve => setTimeout(resolve, 120))
    return route.fulfill({ status: 200, contentType: 'image/jpeg', body: image })
  })
  await page.route(`**/api/album/${albumId}/**`, async route => {
    const path = new URL(route.request().url()).pathname
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    if (path.endsWith('/access')) {
      await new Promise(resolve => setTimeout(resolve, 80))
      return json({ album: { id: albumId, title: 'Album đo tốc độ', status: 'PUBLISHED', expiresAt: '2030-01-01', joined: true, canJoin: false, settings: { limitKind: 'unlimited', limitMin: null, limitMax: null } } })
    }
    if (path.endsWith('/photos')) {
      await new Promise(resolve => setTimeout(resolve, 250))
      return json({ items: Array.from({ length: 30 }, (_, index) => photo(index)), nextCursor: null, total: 30, selectedCount: 0 })
    }
    if (path.endsWith('/selection')) {
      await new Promise(resolve => setTimeout(resolve, 250))
      return json({ version: 0, selectedPhotoIds: [] })
    }
    if (path.includes('/notes/')) return json({ body: '', version: 0 })
    if (path.endsWith('/image')) { traffic.proxy++; return route.fulfill({ status: 200, contentType: 'image/jpeg', body: image }) }
    return route.continue()
  })

  await page.goto(`/album/${albumId}`, { waitUntil: 'domcontentloaded' })
  const tiles = page.getByRole('list', { name: 'Ảnh trong album' }).getByRole('listitem')
  await expect(tiles.first().locator('img')).toHaveClass(/opacity-100/)
  const firstThumbnailMs = await page.evaluate(() => Math.round(performance.now()))
  await expect.poll(async () => tiles.count()).toBeGreaterThanOrEqual(firstRowCount)
  for (let index = 0; index < firstRowCount; index++) await expect(tiles.nth(index).locator('img')).toHaveClass(/opacity-100/)
  const firstRowMs = await page.evaluate(() => Math.round(performance.now()))

  const focusStart = await page.evaluate(() => performance.now())
  await page.getByRole('button', { name: 'Mở ảnh IMG_0.jpg' }).click()
  await expect(page.getByRole('dialog', { name: 'IMG_0.jpg' }).locator('img[alt="IMG_0.jpg"]')).toHaveClass(/opacity-100/)
  const focusMs = Math.round((await page.evaluate(() => performance.now())) - focusStart)
  const nextStart = await page.evaluate(() => performance.now())
  await page.getByRole('button', { name: 'Ảnh tiếp theo' }).click()
  await expect(page.getByRole('dialog', { name: 'IMG_1.jpg' }).locator('img[alt="IMG_1.jpg"]')).toHaveClass(/opacity-100/)
  const nextMs = Math.round((await page.evaluate(() => performance.now())) - nextStart)
  return { firstThumbnailMs, firstRowMs, focusMs, nextMs, ...traffic }
}

for (const profile of [
  { name: 'mobile', viewport: { width: 390, height: 844 }, scale: 3, firstRow: 2 },
  { name: 'desktop', viewport: { width: 1440, height: 900 }, scale: 1, firstRow: 5 },
]) {
  test(`${profile.name} gallery timing with delayed API and real JPEG payloads`, async ({ browser }, testInfo) => {
    const samples = []
    for (let index = 0; index < 3; index++) {
      const context = await browser.newContext({ viewport: profile.viewport, deviceScaleFactor: profile.scale, serviceWorkers: 'block' })
      try {
        const page = await context.newPage()
        samples.push(await measure(page, profile.firstRow))
      } finally { await context.close() }
    }
    const sorted = (key: keyof typeof samples[number]) => samples.map(sample => sample[key]).sort((a, b) => a - b)
    const summary = { profile: profile.name, runs: samples.length,
      median: Object.fromEntries((['firstThumbnailMs', 'firstRowMs', 'focusMs', 'nextMs', 'direct', 'proxy', 'bytes'] as const).map(key => [key, sorted(key)[1]])),
      sizes: Object.fromEntries([...new Set(samples.flatMap(sample => Object.keys(sample.sizes)))].map(size => [size, samples.reduce((sum, sample) => sum + (sample.sizes[size] ?? 0), 0)])),
      samples,
    }
    await testInfo.attach('gallery-benchmark.json', { body: JSON.stringify(summary, null, 2), contentType: 'application/json' })
    console.log(`gallery benchmark ${JSON.stringify(summary.median)}`)
    expect(samples.every(sample => sample.firstThumbnailMs > 0 && sample.firstRowMs >= sample.firstThumbnailMs && sample.direct > 0)).toBe(true)
  })
}
