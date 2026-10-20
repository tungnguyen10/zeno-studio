import { chromium, devices } from '@playwright/test'

const albumUrl = process.env.ZENO_PERF_ALBUM_URL
const runs = Number(process.env.ZENO_PERF_RUNS ?? 5)
if (!albumUrl || !/^https?:\/\//.test(albumUrl) || !Number.isInteger(runs) || runs < 1 || runs > 20) {
  process.stderr.write('Cần ZENO_PERF_ALBUM_URL là link khách đầy đủ và ZENO_PERF_RUNS từ 1 đến 20.\n')
  process.exit(1)
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b)
  return Math.round(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? 0)
}

async function readyImage(page, selector) {
  await page.waitForFunction(selector => {
    const image = document.querySelector(selector)
    return image instanceof HTMLImageElement && image.naturalWidth > 0 && getComputedStyle(image).opacity === '1'
  }, selector, { timeout: 60_000 })
  return page.evaluate(() => Math.round(performance.now()))
}

async function sample(page, url, warm) {
  const traffic = { direct: 0, proxy: 0, failed: 0, bytes: 0, sizes: {} }
  const pendingBodies = []
  page.on('requestfinished', async request => {
    const address = new URL(request.url())
    const direct = address.hostname === 'drive.google.com' && address.pathname === '/thumbnail'
    const googleImage = direct || address.hostname === 'googleusercontent.com' || address.hostname.endsWith('.googleusercontent.com')
    const proxy = /\/api\/(album|studio)\/.*\/photos\/.*\/image$/.test(address.pathname)
    if (!googleImage && !proxy) return
    if (direct) {
      traffic.direct++
      const size = address.searchParams.get('sz') ?? 'unknown'
      traffic.sizes[size] = (traffic.sizes[size] ?? 0) + 1
    }
    if (proxy) traffic.proxy++
    pendingBodies.push((async () => {
      try {
        const response = await request.response()
        if (response) {
          if (response.status() >= 400) traffic.failed++
          traffic.bytes += (await response.body()).length
        }
      } catch { /* Aborted requests have no body. */ }
    })())
  })
  page.on('requestfailed', request => {
    const address = new URL(request.url())
    if ((address.hostname === 'drive.google.com' && address.pathname === '/thumbnail') || address.hostname.endsWith('.googleusercontent.com')) traffic.failed++
  })

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  const first = await readyImage(page, 'ul[aria-label="Ảnh trong album"] li img')
  const firstRow = await page.evaluate(async () => {
    const images = [...document.querySelectorAll('ul[aria-label="Ảnh trong album"] li img')]
    const firstTop = images[0]?.closest('li')?.getBoundingClientRect().top
    const row = images.filter(image => image.closest('li')?.getBoundingClientRect().top === firstTop)
    await Promise.all(row.map(image => image.decode().catch(() => {})))
    return Math.round(performance.now())
  })

  const firstTile = page.locator('ul[aria-label="Ảnh trong album"] li button[aria-label^="Mở ảnh"]').first()
  const firstName = await firstTile.getAttribute('aria-label')
  const focusStart = await page.evaluate(() => performance.now())
  await firstTile.click()
  const focusImage = page.locator('[role="dialog"] img[alt]:not([alt=""])')
  await focusImage.waitFor({ state: 'visible', timeout: 60_000 })
  await page.waitForFunction(() => {
    const image = document.querySelector('[role="dialog"] img[alt]:not([alt=""])')
    return image instanceof HTMLImageElement && image.naturalWidth > 0 && getComputedStyle(image).opacity === '1'
  }, undefined, { timeout: 60_000 })
  const focus = Math.round((await page.evaluate(() => performance.now())) - focusStart)

  let next = null
  const nextButton = page.getByRole('button', { name: 'Ảnh tiếp theo' })
  if (await nextButton.isVisible()) {
    const nextStart = await page.evaluate(() => performance.now())
    await nextButton.click()
    await page.waitForFunction(previous => {
      const dialog = document.querySelector('[role="dialog"]')
      const image = dialog?.querySelector('img[alt]:not([alt=""])')
      return dialog?.getAttribute('aria-label') !== previous && image instanceof HTMLImageElement && image.naturalWidth > 0 && getComputedStyle(image).opacity === '1'
    }, firstName?.replace(/^Mở ảnh /, ''), { timeout: 60_000 })
    next = Math.round((await page.evaluate(() => performance.now())) - nextStart)
  }

  await Promise.allSettled(pendingBodies)
  return { warm, firstThumbnailMs: first, firstRowMs: firstRow, focusMs: focus, nextMs: next, ...traffic }
}

async function runSample(context, url, warm, profile) {
  const page = await context.newPage()
  try {
    if (profile === 'mobile') {
      const session = await context.newCDPSession(page)
      await session.send('Network.enable')
      await session.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1_600_000 / 8, uploadThroughput: 750_000 / 8 })
    }
    return await sample(page, url, warm)
  } finally { await page.close() }
}

async function main() {
  const browser = await chromium.launch()
  const report = []
  try {
    for (const profile of ['mobile', 'desktop']) {
      for (let index = 0; index < runs; index++) {
        const context = await browser.newContext(profile === 'mobile'
          ? { ...devices['Pixel 7'], serviceWorkers: 'block' }
          : { viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' })
        try {
          report.push({ profile, ...(await runSample(context, albumUrl, false, profile)) })
          report.push({ profile, ...(await runSample(context, albumUrl, true, profile)) })
        } finally { await context.close() }
      }
    }
  } finally { await browser.close() }

  const summary = Object.fromEntries(['mobile', 'desktop'].flatMap(profile => [false, true].map(warm => {
    const samples = report.filter(entry => entry.profile === profile && entry.warm === warm)
    const metric = key => ({ median: percentile(samples.map(item => item[key]).filter(value => value !== null), .5), p75: percentile(samples.map(item => item[key]).filter(value => value !== null), .75) })
    const direct = samples.reduce((sum, item) => sum + item.direct, 0)
    const proxy = samples.reduce((sum, item) => sum + item.proxy, 0)
    return [`${profile}-${warm ? 'warm' : 'cold'}`, {
      runs: samples.length, firstThumbnailMs: metric('firstThumbnailMs'), firstRowMs: metric('firstRowMs'),
      focusMs: metric('focusMs'), nextMs: metric('nextMs'),
      requests: { direct, proxy, failed: samples.reduce((sum, item) => sum + item.failed, 0), proxyRate: Math.round(100 * proxy / Math.max(1, direct + proxy)) / 100 },
      sizes: Object.fromEntries([...new Set(samples.flatMap(item => Object.keys(item.sizes)))].map(size => [size, samples.reduce((sum, item) => sum + (item.sizes[size] ?? 0), 0)])),
      bytes: samples.reduce((sum, item) => sum + item.bytes, 0),
    }]
  })))
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
}

main().catch(() => {
  process.stderr.write('Không đo được gallery. Kiểm tra link khách, quyền album và Chromium; link không được ghi vào log.\n')
  process.exitCode = 1
})
