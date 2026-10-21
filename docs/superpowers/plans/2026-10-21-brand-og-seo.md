# Branded OG Image and Public SEO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish one polished Zeno Studio/Zeno Corp OG image and verify public SEO metadata without changing private workflows.

**Architecture:** A development-only Playwright script renders a checked-in HTML/SVG template, using the existing logo and bride photo, into a static PNG in `public/`. The shared site constant and root Nuxt app expose its absolute URL to all four public pages. Browser tests inspect the server-rendered head and the static asset.

**Tech Stack:** Nuxt 4.6.1, Vue 3, TypeScript, Playwright 1.64, Node 24, npm.

## Global Constraints

- Use the exact `public/images/logo.svg`; show Zeno Studio as the product and Zeno Corp in that logo.
- One 1200 × 630 PNG under 1 MB at `public/images/og/zeno-studio.png` serves `/`, `/create`, `/studio`, and `/tools/file-filter`.
- Retain unique page titles/descriptions, path-only canonical and `og:url`, and private route indexing protection.
- Add no runtime dependency or request-time image generation. Do not modify the existing user changes in `app/components/album/AlbumLocalFilter.vue` or `app/pages/tools/file-filter.vue`.
- Keep generated `.superpowers/` preview files out of Git.

---

### Task 1: Generate and validate the branded static image

**Files:**
- Create: `scripts/og-image.html`
- Create: `scripts/generate-og-image.mjs`
- Create: `public/images/og/zeno-studio.png` (generated)
- Modify: `.gitignore`
- Modify: `tests/e2e/seo.spec.ts`

**Interfaces:**
- Consumes: `public/images/logo.svg`, `public/images/hero/bride.jpg`.
- Produces: `public/images/og/zeno-studio.png`, a publicly served 1200 × 630 PNG.

- [ ] **Step 1: Add an image response test to `tests/e2e/seo.spec.ts`.**

```ts
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
```

- [ ] **Step 2: Confirm the test fails for the absent image.** Run `npm run test:e2e -- tests/e2e/seo.spec.ts --project=chromium -g 'branded OG image'`. Expect a 404 assertion failure.

- [ ] **Step 3: Add `scripts/og-image.html`.** This is the source artboard; placeholders are filled by the generator. Match the approved preview, including the centered vector heart.

```html
<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><style>html,body{margin:0;width:1200px;height:630px;overflow:hidden}</style></head><body>
<svg id="og-art" xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="Zeno Studio của Zeno Corp">
  <defs>
    <clipPath id="photoClip"><rect x="752" y="40" width="408" height="550" rx="26"/></clipPath>
    <filter id="cardShadow" x="-30%" y="-60%" width="160%" height="220%"><feDropShadow dx="0" dy="12" stdDeviation="15" flood-color="#263825" flood-opacity=".2"/></filter>
  </defs>
  <rect width="1200" height="630" fill="#f8f7f3"/>
  <rect width="18" height="630" fill="#344732"/>
  <circle cx="652" cy="84" r="137" fill="#f1f5ed"/>
  <circle cx="624" cy="594" r="190" fill="#f1f5ed"/>
  <image href="__PHOTO_DATA_URL__" x="752" y="40" width="408" height="550" preserveAspectRatio="xMidYMid slice" clip-path="url(#photoClip)"/>
  <rect x="752" y="40" width="408" height="550" rx="26" fill="none" stroke="#dce4d6" stroke-width="2"/>
  <image href="__LOGO_DATA_URL__" x="74" y="58" width="184" height="52"/>
  <rect x="74" y="192" width="30" height="5" rx="2.5" fill="#e9be44"/>
  <text x="117" y="199" fill="#60765a" font-size="20" font-weight="700" letter-spacing="3" font-family="Inter,Arial,sans-serif">DÀNH CHO STUDIO ẢNH</text>
  <text x="70" y="304" fill="#263825" font-size="82" font-weight="750" letter-spacing="-5" font-family="Inter,Arial,sans-serif">Zeno Studio</text>
  <text x="74" y="362" fill="#344732" font-size="30" font-weight="600" letter-spacing="-1" font-family="Inter,Arial,sans-serif">Tạo album. Chọn ảnh. Lọc file.</text>
  <text x="74" y="413" fill="#687264" font-size="23" font-family="Inter,Arial,sans-serif">Quy trình ảnh gọn gàng cho studio và khách hàng.</text>
  <rect x="710" y="455" width="330" height="96" rx="19" fill="#fff" filter="url(#cardShadow)"/>
  <circle cx="751" cy="503" r="22" fill="#fff0f2"/>
  <path d="M 0 12 C -13 3 -12 -6 -5 -8 C -2 -9 0 -7 0 -4 C 0 -7 2 -9 5 -8 C 12 -6 13 3 0 12 Z" transform="translate(751 501)" fill="#b55364"/>
  <text x="789" y="500" fill="#263825" font-size="24" font-weight="700" font-family="Inter,Arial,sans-serif">18 ảnh đã chọn</text>
  <text x="789" y="525" fill="#687264" font-size="16" font-family="Inter,Arial,sans-serif">Sẵn sàng chốt bộ ảnh</text>
  <rect x="74" y="566" width="150" height="5" rx="2.5" fill="#344732"/>
</svg></body></html>
```

- [ ] **Step 4: Add `scripts/generate-og-image.mjs` and run it.** It reads the source assets as data URLs, writes the checked-in PNG, and fails if it exceeds the size budget.

```js
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
if (html.includes('__LOGO_DATA_URL__') || html.includes('__PHOTO_DATA_URL__')) throw new Error('OG template placeholders unresolved')
await mkdir(dirname(output), { recursive: true })
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
  await page.setContent(html, { waitUntil: 'load' })
  await page.locator('#og-art').screenshot({ path: output })
} finally {
  await browser.close()
}
if ((await stat(output)).size > 1_000_000) throw new Error('OG image exceeds 1 MB')
```

Run `node scripts/generate-og-image.mjs`. Inspect the output at original size and as a thumbnail, checking the actual logo, Vietnamese text, photo crop and heart alignment. Add `.superpowers/` to `.gitignore`.

- [ ] **Step 5: Rerun the focused test.** Run `npm run test:e2e -- tests/e2e/seo.spec.ts --project=chromium -g 'branded OG image'`. Expect PASS.
- [ ] **Step 6: Commit only Task 1 files.** Run `git add scripts/og-image.html scripts/generate-og-image.mjs public/images/og/zeno-studio.png .gitignore tests/e2e/seo.spec.ts` and `git commit -m "feat: create branded OG image"`.

### Task 2: Connect image metadata and verify public SEO

**Files:**
- Modify: `shared/site.ts`
- Modify: `app/app.vue`
- Modify: `tests/e2e/seo.spec.ts`

**Interfaces:**
- Consumes: static PNG from Task 1, `useSiteUrl()`, `PUBLIC_PAGES`.
- Produces: absolute Open Graph/Twitter image tags and existing per-page SEO metadata in SSR HTML.

- [ ] **Step 1: Expand `tests/e2e/seo.spec.ts` with SSR metadata assertions.** Use the existing `test`/`expect` imports; inspect the response body so client hydration cannot mask missing server tags.

```ts
import { PUBLIC_PAGES } from '../../shared/site'

function tag(html: string, name: string, value: string): string | undefined {
  return html.match(/<(?:meta|link)\b[^>]*>/g)?.find(item => item.includes(`${name}="${value}"`))
}

function attr(element: string | undefined, name: string): string | undefined {
  return element?.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1]
}

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
```

- [ ] **Step 2: Confirm new assertions fail against the old image.** Run `npm run test:e2e -- tests/e2e/seo.spec.ts --project=chromium -g 'SSR SEO metadata|canonical and social URL'`. Expect a failure showing `/images/hero/couple.jpg`.

- [ ] **Step 3: Update the single source and root metadata.** Replace `SITE_OG_IMAGE` in `shared/site.ts` and add the missing properties in `app/app.vue`.

```ts
export const SITE_OG_IMAGE = {
  path: '/images/og/zeno-studio.png',
  width: 1200,
  height: 630,
  type: 'image/png',
  alt: 'Zeno Studio của Zeno Corp: tạo album, chọn ảnh và lọc file cho studio ảnh',
}
```

```ts
const socialImageUrl = `${siteUrl}${SITE_OG_IMAGE.path}`
useSeoMeta({
  ogSiteName: SITE_NAME,
  ogLocale: 'vi_VN',
  ogType: 'website',
  ogUrl: pageUrl,
  ogImage: socialImageUrl,
  ogImageType: SITE_OG_IMAGE.type,
  ogImageWidth: SITE_OG_IMAGE.width,
  ogImageHeight: SITE_OG_IMAGE.height,
  ogImageAlt: SITE_OG_IMAGE.alt,
  twitterCard: 'summary_large_image',
  twitterImage: socialImageUrl,
  twitterImageAlt: SITE_OG_IMAGE.alt,
})
```

Keep the existing `useHead` canonical and route-specific `useSeoMeta` calls. No new Vue component or composable is needed: `app/app.vue` has only shared head orchestration.

- [ ] **Step 4: Rerun SEO E2E and fix only real gaps.** Run `npm run test:e2e -- tests/e2e/seo.spec.ts --project=chromium`. Expect all SEO tests PASS. If Nuxt's installed typed metadata API rejects a property, inspect its types and use an explicit `useHead` meta entry for that property, then rerun typecheck and E2E.
- [ ] **Step 5: Final verification.** Run `npm test`, `npm run typecheck`, and `npm run build`. Expect exit code 0. Inspect `git diff --check`, the generated PNG, and `git status --short`; ensure the two pre-existing user edits remain unstaged.
- [ ] **Step 6: Commit only Task 2 files.** Run `git add shared/site.ts app/app.vue tests/e2e/seo.spec.ts` and `git commit -m "feat: serve branded social metadata"`.

## Self-review

- Task 1 covers the approved visual, source reproducibility, image dimensions, size and browser access.
- Task 2 covers shared image metadata, unique public copy, canonical URLs and private-route assertions already in the SEO suite.
- Existing sitemap, robots and JSON-LD stay intact unless focused verification exposes a defect.
