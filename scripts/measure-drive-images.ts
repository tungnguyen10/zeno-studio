import { chromium, devices } from '@playwright/test'
import { driveFocusSrc, driveFocusSrcset, driveGridSrc, driveGridSrcset } from '../app/lib/drive-image'
import { GoogleDriveAdapter, parseGoogleDriveFolderLink } from '../server/photo-sources/google-drive'

const apiKey = process.env.NUXT_GOOGLE_API_KEY
const folderUrl = process.env.NUXT_DRIVE_SAMPLE_FOLDER_URL
const runs = Number(process.env.ZENO_PERF_RUNS ?? 5)
const preconnect = process.env.ZENO_PERF_PRECONNECT === '1'
let phase = 'khởi tạo'
if (!apiKey || !folderUrl || !Number.isInteger(runs) || runs < 1 || runs > 20) {
  throw new Error('Cần API key, folder Drive mẫu và ZENO_PERF_RUNS từ 1 đến 20')
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return Math.round(sorted[Math.floor(sorted.length / 2)] ?? 0)
}

async function main(): Promise<void> {
  phase = 'liệt kê Drive'
  const adapter = new GoogleDriveAdapter(apiKey!)
  const folder = parseGoogleDriveFolderLink(folderUrl!)
  const photos = (await adapter.listPhotos(folder)).items.slice(0, 5)
  if (photos.length < 5) throw new Error('Folder mẫu cần ít nhất 5 ảnh')
  const browser = await chromium.launch()
  const report: Array<{ profile: string; firstMs: number; rowMs: number; focusMs: number; imageRequests: number; failed: number; bytes: number; sizes: Record<string, number> }> = []
  try {
    for (const profile of ['mobile', 'desktop']) {
      for (let run = 0; run < runs; run++) {
        const context = await browser.newContext(profile === 'mobile'
          ? { ...devices['Pixel 7'], serviceWorkers: 'block' }
          : { viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' })
        const page = await context.newPage()
        const traffic = { imageRequests: 0, failed: 0, bytes: 0, sizes: {} as Record<string, number> }
        const bodies: Promise<void>[] = []
        try {
          phase = `mở Chromium ${profile} lượt ${run + 1}`
          if (profile === 'mobile') {
            const session = await context.newCDPSession(page)
            await session.send('Network.enable')
            await session.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1_600_000 / 8, uploadThroughput: 750_000 / 8 })
          }
          page.on('request', request => {
            const url = new URL(request.url())
            if (url.hostname !== 'drive.google.com' || url.pathname !== '/thumbnail') return
            const size = url.searchParams.get('sz') ?? 'unknown'
            traffic.sizes[size] = (traffic.sizes[size] ?? 0) + 1
          })
          page.on('requestfinished', request => {
            if (request.resourceType() !== 'image') return
            bodies.push((async () => {
              try {
                const response = await request.response()
                if (!response) return
                if (response.status() >= 400) traffic.failed++
                if (response.headers()['content-type']?.startsWith('image/')) {
                  traffic.imageRequests++
                  traffic.bytes += (await response.body()).length
                }
              } catch { /* Aborted or redirected requests have no readable body. */ }
            })())
          })
          page.on('requestfailed', request => {
            if (request.resourceType() === 'image') traffic.failed++
          })
          await page.goto('about:blank')
          await page.evaluate(async enabled => {
            if (enabled) {
              const link = document.createElement('link')
              link.rel = 'preconnect'
              link.href = 'https://drive.google.com'
              document.head.append(link)
            }
            // Approximate the API work that happens before the gallery assigns image URLs.
            await new Promise(resolve => setTimeout(resolve, 350))
          }, preconnect)
          const grid = photos.map(photo => ({
            src: driveGridSrc(photo.id, photo.width ?? null, photo.height ?? null),
            srcset: driveGridSrcset(photo.id, photo.width ?? null, photo.height ?? null),
          }))
          phase = `thumbnail ${profile} lượt ${run + 1}`
          const gridTimes = await page.evaluate(async images => {
            const start = performance.now()
            const timings = await Promise.all(images.map(async data => {
              const image = new Image()
              image.referrerPolicy = 'no-referrer'
              image.sizes = '200px'
              image.srcset = data.srcset
              image.src = data.src
              document.body.append(image)
              try { await image.decode() }
              catch { return null }
              return performance.now() - start
            }))
            return timings
          }, grid)
          if (gridTimes.some(time => time === null)) throw new Error('Thumbnail Drive không tải được trong Chromium')
          const focus = photos[0]!
          phase = `Focus ${profile} lượt ${run + 1}`
          const focusMs = await page.evaluate(async data => {
            const image = new Image()
            image.referrerPolicy = 'no-referrer'
            image.sizes = data.sizes
            image.srcset = data.srcset
            image.src = data.src
            const start = performance.now()
            document.body.append(image)
            await image.decode()
            return performance.now() - start
          }, {
            src: driveFocusSrc(focus.id, 2560),
            srcset: driveFocusSrcset(focus.id, 2560),
            sizes: profile === 'mobile' ? '390px' : '704px',
          })
          await Promise.allSettled(bodies)
          const loaded = gridTimes as number[]
          report.push({ profile, firstMs: Math.round(Math.min(...loaded)), rowMs: Math.round(Math.max(...loaded)), focusMs: Math.round(focusMs), ...traffic })
        } finally { await context.close() }
      }
    }
  } finally { await browser.close() }
  const summary = Object.fromEntries(['mobile', 'desktop'].map(profile => {
    const samples = report.filter(item => item.profile === profile)
    return [profile, {
      runs: samples.length,
      preconnect,
      firstMs: median(samples.map(item => item.firstMs)),
      rowMs: median(samples.map(item => item.rowMs)),
      focusMs: median(samples.map(item => item.focusMs)),
      imageRequests: samples.reduce((total, item) => total + item.imageRequests, 0),
      failed: samples.reduce((total, item) => total + item.failed, 0),
      bytes: samples.reduce((total, item) => total + item.bytes, 0),
      sizes: Object.fromEntries([...new Set(samples.flatMap(item => Object.keys(item.sizes)))].map(size => [size, samples.reduce((total, item) => total + (item.sizes[size] ?? 0), 0)])),
    }]
  }))
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
}

main().catch(error => {
  process.stderr.write(`Không đo được ảnh Drive ở bước ${phase} (${error instanceof Error ? error.name : 'UnknownError'}). Kiểm tra folder công khai, API key và Chromium.\n`)
  process.exitCode = 1
})
