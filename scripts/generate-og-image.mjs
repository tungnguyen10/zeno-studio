import { readFile, mkdir, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(root, 'public/images/og/zeno-studio.png')
const template = await readFile(resolve(root, 'scripts/og-image.html'), 'utf8')
const logo = await readFile(resolve(root, 'public/images/logo.svg'))
const photo = await readFile(resolve(root, 'public/images/hero/bride.jpg'))
const html = template
  .replace('__LOGO_DATA_URL__', `data:image/svg+xml;base64,${logo.toString('base64')}`)
  .replace('__PHOTO_DATA_URL__', `data:image/jpeg;base64,${photo.toString('base64')}`)

if (html.includes('__LOGO_DATA_URL__') || html.includes('__PHOTO_DATA_URL__')) {
  throw new Error('OG template placeholders unresolved')
}

await mkdir(dirname(output), { recursive: true })
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
  await page.setContent(html, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  await page.locator('#og-art').screenshot({ path: output })
} finally {
  await browser.close()
}

if ((await stat(output)).size > 1_000_000) {
  throw new Error('OG image exceeds 1 MB')
}
