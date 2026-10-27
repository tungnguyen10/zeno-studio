# GA4 Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add consent-first GA4 page views and ten confirmed workflow events across Zeno Studio without sending private URLs or user content.

**Architecture:** A pure analytics model allowlists route metadata and event fields. A Nuxt client plugin loads `gtag.js` only after consent and controls manual page views; a tiny event facade lets existing UI owners report confirmed actions. The app-wide consent UI persists the visitor's choice, while a separate E2E server configuration tests enabled analytics without contacting Google.

**Tech Stack:** Nuxt 4.6.1, Vue 3.5, TypeScript, Vitest 5, Playwright, official `gtag.js`; no new runtime dependency.

## Global Constraints

- Measurement ID: `G-2GD5P03B7S`; enable only for Production using public Nuxt runtime configuration. Local and Preview remain off by default.
- Load no Google script before explicit consent; unknown and rejected choices send no analytics.
- Never send raw query strings, fragments, dynamic route IDs, names, email, filenames, notes, Drive URLs, capability tokens, or GA `user_id`.
- Disable GA4 Enhanced Measurement's **Page changes based on browser history events** and optional automatic collection that can capture sensitive URLs/forms before enabling Production.
- `send_page_view: false` is required in `gtag('config', ...)`; manually send one view per successful screen navigation, ignoring query-only changes.
- Keep T48–T49 internal studio analytics and daily aggregation outside this implementation.
- Do not add `@nuxt/ui`, VueUse, a GA module, GTM, or a new component-test dependency.
- Use the existing `app/pages/`, `app/components/`, `app/composables/`, and `app/lib/` patterns. Do not refactor unrelated screens.

## File map

| File | Responsibility |
| --- | --- |
| `app/lib/analytics-model.ts` | Pure allowlist for safe page metadata, referrer, and ten event payloads. |
| `app/lib/analytics-events.ts` | SSR-safe registration and no-op facade for UI event calls. |
| `app/lib/analytics-consent.ts` | Storage key, parsing, and persistence rules. |
| `app/composables/useAnalyticsConsent.ts` | Shared Nuxt consent state and settings visibility. |
| `app/components/AnalyticsConsent.vue` | Global banner and private-route settings control. |
| `app/components/SiteFooter.vue` | Settings control on pages that already render a footer. |
| `app/plugins/analytics.client.ts` | Script loading, consent reaction, manual route page views, event sender. |
| `nuxt.config.ts`, `.env.example`, `docs/vercel-deployment.md` | Public runtime ID/enable flag and Production configuration notes. |
| Existing UI owners listed in Tasks 4–5 | Fire events only at the confirmed success point. |
| `tests/domain/analytics-model.test.ts`, `tests/domain/analytics-consent.test.ts` | Pure privacy and state tests. |
| `tests/e2e/analytics.spec.ts`, `playwright.analytics.config.ts` | Browser behavior with a fake Google script and no live collection. |

---

### Task 1: Safe page and event model

**Files:**
- Create: `app/lib/analytics-model.ts`
- Create: `app/lib/analytics-events.ts`
- Test: `tests/domain/analytics-model.test.ts`

**Interfaces:**
- Produces: `safePage(path: string, origin: string): SafePage`, `safeReferrer(raw: string, origin: string): string | undefined`, and `buildAnalyticsEvent(event: AnalyticsEvent): { name: string; params: Record<string, string | number> }`.
- Produces: `registerAnalyticsSender(sender: ((event: AnalyticsEvent) => void) | null): void` and `trackAnalyticsEvent(event: AnalyticsEvent): void`. The facade must remain safe to import during SSR.

- [ ] **Step 1: Write failing privacy and event tests.** In `tests/domain/analytics-model.test.ts`, cover at least these exact assertions:

```ts
import { describe, expect, it } from 'vitest'
import { buildAnalyticsEvent, safePage, safeReferrer } from '../../app/lib/analytics-model'

const origin = 'https://studio.example'

describe('safe GA4 metadata', () => {
  it('templates private routes and excludes capabilities', () => {
    expect(safePage('/album/a-private-id', origin)).toEqual({
      path: '/album/:albumId', title: 'Album khách', location: `${origin}/album/:albumId`,
    })
    expect(safePage('/guest/albums/a-private-id/results', origin).location).toBe(`${origin}/guest/albums/:albumId/results`)
    expect(safePage('/unrecognized/a-private-id', origin).location).toBe(`${origin}/other`)
    expect(safeReferrer(`${origin}/album/a-private-id?token=secret`, origin)).toBe(`${origin}/album/:albumId`)
    expect(safeReferrer('https://referrer.example/path?email=secret', origin)).toBe('https://referrer.example/')
  })

  it('allowlists event properties and discards injected fields', () => {
    const event = { name: 'album_created', creation_flow: 'guest', albumId: 'secret' } as const
    expect(buildAnalyticsEvent(event).params).toEqual({ creation_flow: 'guest' })
    expect(buildAnalyticsEvent({ name: 'photo_selected', selected_count: -1 }).params).toEqual({})
  })
})
```

- [ ] **Step 2: Verify red.** Run `npx vitest run tests/domain/analytics-model.test.ts`; expect module/import failures.

- [ ] **Step 3: Add the pure model.** In `app/lib/analytics-model.ts`, define `SafePage`, the discriminated `AnalyticsEvent` union for the ten names in the spec, `safePage`, `safeReferrer`, and `buildAnalyticsEvent`. Use anchored route patterns for every current page; match `/results` and `/filter` children before their album parent, and map anything unknown to `/other`. Strip query/fragment before matching and require the origin to be a valid HTTP(S) origin. Use a closed `switch` for event fields, copying only `creation_flow`, `layout`, `surface`, and finite nonnegative integer counts relevant to the event; never spread caller objects. Return a generic title from the route map. Add `safeReferrer` that returns a templated same-origin URL, external origin plus `/`, or `undefined` for malformed/non-HTTP(S) input.

```ts
export type SafePage = { path: string; title: string; location: string }
export type AnalyticsEvent =
  | { name: 'album_created' | 'album_published'; creation_flow: 'guest' | 'studio' }
  | { name: 'album_opened' | 'photo_note_saved' }
  | { name: 'gallery_view_changed'; layout: 'justified' | 'grid' | 'masonry' | 'list'; surface: 'customer' | 'studio' }
  | { name: 'photo_selected' | 'photo_unselected'; selected_count?: number }
  | { name: 'selection_finalized' | 'selection_reopened'; surface: 'studio' | 'guest_admin' }
  | { name: 'file_match_completed'; matched_count: number; missing_count: number; ambiguous_count: number }

const pages: Array<{ pattern: RegExp; path: string; title: string }> = [
  { pattern: /^\/$/, path: '/', title: 'Trang chủ' },
  { pattern: /^\/create$/, path: '/create', title: 'Tạo album' },
  { pattern: /^\/tools\/file-filter$/, path: '/tools/file-filter', title: 'Lọc file' },
  { pattern: /^\/studio$/, path: '/studio', title: 'Studio' },
  { pattern: /^\/studio\/members$/, path: '/studio/members', title: 'Thành viên' },
  { pattern: /^\/studio\/invite$/, path: '/studio/invite', title: 'Lời mời' },
  { pattern: /^\/studio\/reset-password$/, path: '/studio/reset-password', title: 'Đặt lại mật khẩu' },
  { pattern: /^\/studio\/albums\/[^/]+\/results$/, path: '/studio/albums/:albumId/results', title: 'Kết quả album' },
  { pattern: /^\/studio\/albums\/[^/]+\/filter$/, path: '/studio/albums/:albumId/filter', title: 'Lọc ảnh album' },
  { pattern: /^\/studio\/albums\/[^/]+$/, path: '/studio/albums/:albumId', title: 'Album studio' },
  { pattern: /^\/guest\/albums\/[^/]+\/results$/, path: '/guest/albums/:albumId/results', title: 'Kết quả album' },
  { pattern: /^\/guest\/albums\/[^/]+\/filter$/, path: '/guest/albums/:albumId/filter', title: 'Lọc ảnh album' },
  { pattern: /^\/guest\/albums\/[^/]+$/, path: '/guest/albums/:albumId', title: 'Quản trị album' },
  { pattern: /^\/album\/[^/]+$/, path: '/album/:albumId', title: 'Album khách' },
]

export function safePage(rawPath: string, rawOrigin: string): SafePage {
  const base = new URL(rawOrigin)
  if (base.protocol !== 'http:' && base.protocol !== 'https:') throw new Error('Analytics origin must be HTTP(S)')
  const origin = base.origin
  const pathname = new URL(rawPath, origin).pathname.replace(/\/+$/, '') || '/'
  const found = pages.find(page => page.pattern.test(pathname))
  const path = found?.path ?? '/other'
  return { path, title: found?.title ?? 'Trang khác', location: `${origin}${path}` }
}

export function safeReferrer(raw: string, rawOrigin: string): string | undefined {
  if (!raw) return undefined
  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
    return url.origin === new URL(rawOrigin).origin ? safePage(url.pathname, rawOrigin).location : `${url.origin}/`
  } catch { return undefined }
}

function count(value: number | undefined): number | undefined {
  return value !== undefined && Number.isSafeInteger(value) && value >= 0 ? value : undefined
}

export function buildAnalyticsEvent(event: AnalyticsEvent): { name: string; params: Record<string, string | number> } {
  switch (event.name) {
    case 'album_created': case 'album_published':
      return { name: event.name, params: { creation_flow: event.creation_flow } }
    case 'gallery_view_changed':
      return { name: event.name, params: { layout: event.layout, surface: event.surface } }
    case 'photo_selected': case 'photo_unselected': {
      const selected = count(event.selected_count)
      return { name: event.name, params: selected === undefined ? {} : { selected_count: selected } }
    }
    case 'selection_finalized': case 'selection_reopened':
      return { name: event.name, params: { surface: event.surface } }
    case 'file_match_completed': {
      const matched = count(event.matched_count)
      const missing = count(event.missing_count)
      const ambiguous = count(event.ambiguous_count)
      return { name: event.name, params: {
        ...(matched === undefined ? {} : { matched_count: matched }),
        ...(missing === undefined ? {} : { missing_count: missing }),
        ...(ambiguous === undefined ? {} : { ambiguous_count: ambiguous }),
      } }
    }
    case 'album_opened': case 'photo_note_saved':
      return { name: event.name, params: {} }
  }
}
```

- [ ] **Step 4: Add the SSR-safe event facade.** Keep the sender in module scope; registration with `null` disables later calls. The model in Step 3 must still be the only place that turns typed events into GA payloads.

```ts
import type { AnalyticsEvent } from './analytics-model'

let sender: ((event: AnalyticsEvent) => void) | null = null
export function registerAnalyticsSender(next: typeof sender): void { sender = next }
export function trackAnalyticsEvent(event: AnalyticsEvent): void { sender?.(event) }
```

- [ ] **Step 5: Verify green and commit.** Run `npx vitest run tests/domain/analytics-model.test.ts` (PASS), `npm run typecheck` (PASS), then commit these three files with `git commit -m "feat: define privacy-safe GA4 event model"`.

### Task 2: Consent state and accessible controls

**Files:**
- Create: `app/lib/analytics-consent.ts`
- Create: `app/composables/useAnalyticsConsent.ts`
- Create: `app/components/AnalyticsConsent.vue`
- Modify: `app/app.vue`
- Modify: `app/components/SiteFooter.vue`
- Test: `tests/domain/analytics-consent.test.ts`

**Interfaces:**
- Produces: `useAnalyticsConsent()` returning `{ choice, ready, settingsOpen, initialize, decide, openSettings }`, where `choice` is `unknown | accepted | rejected`, `decide(value)` persists the choice when possible, and `openSettings()` exposes the banner without silently changing an accepted decision.
- Consumes: Production flag from `useRuntimeConfig().public.ga4Enabled` (added in Task 3). Until Task 3, a missing flag hides the UI.

- [ ] **Step 1: Write failing persistence tests.** Include accepted/rejected round trips, unrecognized stored values falling back to unknown, and storage exceptions leaving the in-memory choice usable.

```ts
import { expect, it } from 'vitest'
import { CONSENT_KEY, readConsent, writeConsent } from '../../app/lib/analytics-consent'

it('persists only explicit choices', () => {
  const data = new Map<string, string>()
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) } }
  expect(readConsent(storage)).toBe('unknown')
  writeConsent(storage, 'accepted')
  expect(data.get(CONSENT_KEY)).toBe('accepted')
  expect(readConsent(storage)).toBe('accepted')
  data.set(CONSENT_KEY, 'garbage')
  expect(readConsent(storage)).toBe('unknown')
})
```

- [ ] **Step 2: Verify red.** Run `npx vitest run tests/domain/analytics-consent.test.ts`; expect import failure.

- [ ] **Step 3: Implement storage rules and shared state.** `CONSENT_KEY` is `zeno-analytics-consent-v1`. `readConsent` catches storage errors and returns `unknown`; `writeConsent` catches errors and returns `false` while `decide` still updates memory. Initialize on client mount, not during SSR render, to avoid hydration mismatch. `settingsOpen` is separate from the stored choice. Include a `closeSettings` path for visitors who reopen then dismiss without changing their existing decision.

```ts
export type AnalyticsConsentChoice = 'unknown' | 'accepted' | 'rejected'
export const CONSENT_KEY = 'zeno-analytics-consent-v1'
export type ConsentStorage = Pick<Storage, 'getItem' | 'setItem'>
export function readConsent(storage: ConsentStorage | null): AnalyticsConsentChoice {
  try { const value = storage?.getItem(CONSENT_KEY); return value === 'accepted' || value === 'rejected' ? value : 'unknown' }
  catch { return 'unknown' }
}
export function writeConsent(storage: ConsentStorage | null, choice: Exclude<AnalyticsConsentChoice, 'unknown'>): boolean {
  try { storage?.setItem(CONSENT_KEY, choice); return !!storage }
  catch { return false }
}
```

`app/composables/useAnalyticsConsent.ts` uses the same contract:

```ts
import { readConsent, writeConsent, type AnalyticsConsentChoice } from '~/lib/analytics-consent'

export function useAnalyticsConsent() {
  const choice = useState<AnalyticsConsentChoice>('analytics:choice', () => 'unknown')
  const ready = useState('analytics:ready', () => false)
  const settingsOpen = useState('analytics:settings-open', () => false)

  function initialize(): void {
    if (!import.meta.client || ready.value) return
    let storage: Storage | null = null
    try { storage = window.localStorage } catch { /* Storage is unavailable. */ }
    choice.value = readConsent(storage)
    ready.value = true
  }

  function decide(next: Exclude<AnalyticsConsentChoice, 'unknown'>): void {
    choice.value = next
    settingsOpen.value = false
    let storage: Storage | null = null
    try { storage = window.localStorage } catch { /* Keep the in-memory choice. */ }
    writeConsent(storage, next)
  }

  function openSettings(): void { settingsOpen.value = true }
  function closeSettings(): void { settingsOpen.value = false }
  return { choice, ready, settingsOpen, initialize, decide, openSettings, closeSettings }
}
```

- [ ] **Step 4: Add the UI and app placement.** Render `<AnalyticsConsent />` in `app/app.vue` after `<NuxtPage />`. When enabled and `ready`, show the banner for `unknown` or `settingsOpen`; use native buttons for `Đồng ý` and `Từ chối`, a privacy link, `role="region"`, an accessible label, and visible focus styles. Add a conditionally rendered `Cài đặt phân tích` button to `SiteFooter.vue` only when the strict Production flag/ID check passes. Because album, guest-admin, and studio-detail routes do not render `SiteFooter`, the global component also shows a small settings button on routes without that footer. Do not cover the gallery's Selection Island or other primary controls at 320 px; use a nonmodal, compact layout and safe-area spacing.

```vue
<button type="button" class="focus-ring min-h-11 rounded px-2" @click="consent.openSettings()">Cài đặt phân tích</button>
```

Use this behavior in `AnalyticsConsent.vue`: `onMounted(consent.initialize)`, `v-if="enabled && consent.ready.value && (consent.choice.value === 'unknown' || consent.settingsOpen.value)"`, buttons calling `consent.decide('accepted')` and `consent.decide('rejected')`, and a close button only when a previous choice exists. Nuxt templates unwrap refs on the component instance; if using the `consent` object directly, check the compiled template/typecheck and destructure refs if needed. `enabled` uses the same strict flag/ID check as Task 3. Show the global settings button only when `!['/', '/create', '/tools/file-filter', '/studio'].includes(route.path)` and a choice already exists; those four routes use the footer button. The banner is global even when the page has no footer.

- [ ] **Step 5: Verify green and commit.** Run `npx vitest run tests/domain/analytics-consent.test.ts`, `npm run typecheck`, and inspect the disabled-by-default app at 320 px and desktop; expect no banner until Task 3 enables the flag. Commit the five app files and test with `git commit -m "feat: add analytics consent controls"`.

### Task 3: Consent-gated tag and manual page views

**Files:**
- Create: `app/plugins/analytics.client.ts`
- Modify: `nuxt.config.ts`
- Modify: `.env.example`
- Modify: `docs/vercel-deployment.md`
- Create: `playwright.analytics.config.ts`
- Create: `tests/e2e/analytics.spec.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 1's `safePage`, `safeReferrer`, `buildAnalyticsEvent`, and `registerAnalyticsSender`; Task 2's `useAnalyticsConsent` state.
- Produces: public runtime strings `ga4Enabled` and `ga4MeasurementId`. `NUXT_PUBLIC_GA4_ENABLED=true` and `NUXT_PUBLIC_GA4_MEASUREMENT_ID=G-2GD5P03B7S` must be scoped to Vercel Production; empty/default means disabled. The test config overrides them only in its isolated local server and intercepts the remote script.

- [ ] **Step 1: Write a failing browser test for consent and safe page views.** In `tests/e2e/analytics.spec.ts`, stub `gtag/js` before navigation and inspect `window.dataLayer`. The test must expect zero Google requests before consent, one script request after acceptance, one initial `page_view`, one more after a NuxtLink navigation to `/create`, and no raw token in any queued command. Add a rejection test and a revocation/reload test. Use this helper:

```ts
import { expect, test, type Page } from '@playwright/test'

async function commands(page: Page): Promise<unknown[][]> {
  return page.evaluate(() => ((window as Window & { dataLayer?: unknown[][] }).dataLayer ?? []))
}

test('loads only after consent and reports safe manual views', async ({ page }) => {
  let tagRequests = 0
  await page.route('https://www.googletagmanager.com/gtag/js?**', route => {
    tagRequests++
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' })
  })
  await page.goto('/?token=secret')
  expect(tagRequests).toBe(0)
  await page.getByRole('button', { name: 'Đồng ý' }).click()
  await expect.poll(() => tagRequests).toBe(1)
  await expect.poll(async () => (await commands(page)).filter(call => call[0] === 'event' && call[1] === 'page_view').length).toBe(1)
  await page.getByRole('link', { name: /Tạo album nhanh/ }).first().click()
  await expect.poll(async () => (await commands(page)).filter(call => call[0] === 'event' && call[1] === 'page_view').length).toBe(2)
  expect(JSON.stringify(await commands(page))).not.toContain('secret')
})
```

Add a separate test that opens `/create?token=secret` with persisted accepted consent and expects exactly one safe page view in that new document. For query-only changes in one document, assert no new view after `history.replaceState` or a Nuxt navigation that changes only the query.

- [ ] **Step 2: Verify red.** Run `npm run test:e2e:analytics`; expect failure because the test config, script, and controls are not yet complete.

- [ ] **Step 3: Add runtime config and isolated test command.** Under `runtimeConfig.public` in `nuxt.config.ts`, add `ga4Enabled: ''` and `ga4MeasurementId: ''`. Add the two `NUXT_PUBLIC_GA4_*` keys to `.env.example` as empty/off values and document that Vercel Production alone receives `true` and the given ID. Add `"test:e2e:analytics": "playwright test --config playwright.analytics.config.ts --project=chromium"` to `package.json` (no lockfile change is needed for a script only). Make `playwright.analytics.config.ts` use the existing port/configuration and only `analytics.spec.ts`, with `webServer.env` setting the two variables and `reuseExistingServer: false` so an unrelated dev server cannot invalidate the test.

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'analytics.spec.ts',
  use: { baseURL: 'http://127.0.0.1:43627' },
  projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 43627',
    env: { NUXT_PUBLIC_GA4_ENABLED: 'true', NUXT_PUBLIC_GA4_MEASUREMENT_ID: 'G-2GD5P03B7S' },
    url: 'http://127.0.0.1:43627', reuseExistingServer: false, timeout: 120_000,
  },
})
```

- [ ] **Step 4: Implement the client plugin.** Check both runtime strings before doing anything. Wait for app mount and initialized consent. On acceptance, create `window.dataLayer`/`gtag` once, queue consent default denied then update granted, `js`, and `config` with `send_page_view: false` plus safe page metadata, then inject the async script. Queue the initial manual view. On router `afterEach`, skip failures and query-only changes (`to.path === lastPath`), update safe config with `{ update: true }`, then send one `page_view` with safe `page_location`, generic title, and safe previous referrer. Use `buildAnalyticsEvent` in the registered sender and append only safe current page metadata. On rejection, unregister the sender; if active, update consent denied and reload. Do not read `location.href` or `document.title` for event fields.

```ts
import { watch } from 'vue'
import { buildAnalyticsEvent, safePage, safeReferrer } from '~/lib/analytics-model'
import { registerAnalyticsSender } from '~/lib/analytics-events'
import { useAnalyticsConsent } from '~/composables/useAnalyticsConsent'

type AnalyticsWindow = Window & { dataLayer?: unknown[][]; gtag?: (...args: unknown[]) => void }

export default defineNuxtPlugin(nuxtApp => {
  const config = useRuntimeConfig().public
  if (config.ga4Enabled !== 'true' || !/^G-[A-Z0-9]+$/.test(config.ga4MeasurementId)) return

  const consent = useAnalyticsConsent()
  const router = useRouter()
  const gaWindow = window as AnalyticsWindow
  let lastPath: string | null = null
  let previousSafeLocation: string | undefined
  let active = false

  function pageView(path: string): void {
    if (!active || path === lastPath) return
    const page = safePage(path, location.origin)
    const referrer = previousSafeLocation ?? safeReferrer(document.referrer, location.origin)
    gaWindow.gtag?.('config', config.ga4MeasurementId, {
      update: true, send_page_view: false, page_location: page.location,
      page_title: page.title, page_referrer: referrer,
    })
    gaWindow.gtag?.('event', 'page_view', {
      page_location: page.location, page_title: page.title, page_referrer: referrer,
    })
    lastPath = path
    previousSafeLocation = page.location
  }

  function start(): void {
    if (active) return
    active = true
    gaWindow.dataLayer ??= []
    gaWindow.gtag = (...args: unknown[]) => { gaWindow.dataLayer!.push(args) }
    gaWindow.gtag('consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied' })
    gaWindow.gtag('consent', 'update', { analytics_storage: 'granted' })
    gaWindow.gtag('js', new Date())
    const page = safePage(router.currentRoute.value.path, location.origin)
    gaWindow.gtag('config', config.ga4MeasurementId, {
      send_page_view: false, page_location: page.location, page_title: page.title,
      page_referrer: safeReferrer(document.referrer, location.origin),
    })
    const script = document.createElement('script')
    script.async = true
    script.src = `https://www.googletagmanager.com/gtag/js?id=${config.ga4MeasurementId}`
    document.head.append(script)
    registerAnalyticsSender(event => {
      if (!active || consent.choice.value !== 'accepted') return
      const safe = safePage(router.currentRoute.value.path, location.origin)
      const built = buildAnalyticsEvent(event)
      gaWindow.gtag?.('event', built.name, { ...built.params, page_location: safe.location, page_title: safe.title })
    })
    pageView(router.currentRoute.value.path)
  }

  router.afterEach((to, _from, failure) => { if (!failure) pageView(to.path) })
  nuxtApp.hook('app:mounted', () => {
    watch([consent.ready, consent.choice], ([ready, choice]) => {
      if (!ready) return
      if (choice === 'accepted') start()
      else if (active) {
        active = false
        registerAnalyticsSender(null)
        gaWindow.gtag?.('consent', 'update', { analytics_storage: 'denied' })
        location.reload()
      }
    }, { immediate: true })
  })
})
```

The plugin is client-only by filename. Keep `gtag('config', ..., { send_page_view: false })` before the script element is appended so the queued initialization uses safe metadata. Test the tag-blocked path; the app must still work when the script request fails.

- [ ] **Step 5: Verify behavior and commit.** Run `npm run test:e2e:analytics`, `npm run typecheck`, `npm run build`, and `npm run test:e2e -- --project=chromium tests/e2e/seo.spec.ts`. Expect no tag in default SSR HTML, no tag before consent in the enabled test server, sanitized views after consent, and no duplicate views on History changes. Commit the seven files with `git commit -m "feat: load GA4 after consent and track safe page views"`.

### Task 4: Album creation, publication, gallery, and selection events

**Files:**
- Modify: `app/pages/create.vue`
- Modify: `app/components/studio/CreateAlbumDialog.vue`
- Modify: `app/components/studio/AlbumShareActions.vue`
- Modify: `app/pages/album/[albumId].vue`
- Modify: `app/components/album/GalleryLayoutSwitch.vue`
- Modify: `app/components/album/AlbumWorkspace.vue`
- Test: `tests/e2e/analytics.spec.ts`

**Interfaces:**
- Consumes: `trackAnalyticsEvent(event: AnalyticsEvent)` from Task 1. Do not pass response objects or IDs to it.
- Gallery switch emits `changed(layout: GalleryLayout)` only for a new choice; each owner supplies its coarse surface. `studio` denotes the management workspace, including the guest-admin variant.

- [ ] **Step 1: Add failing event assertions to `analytics.spec.ts`.** Reuse the guest-create mock pattern in `tests/e2e/guest-album.spec.ts`: successful `POST /api/guest/albums` must add exactly one `album_created` and one `album_published`, both with `{ creation_flow: 'guest' }`; a mocked 500 response must add neither. Add a customer gallery fixture with a token-bearing URL and verify `album_opened` only after the access/photos mocks succeed. Inspect `dataLayer` by filtering commands with `call[0] === 'event'` and the expected name. A failed selection PUT must add no `photo_selected`/`photo_unselected`; a saved result adds one of the matching event.

```ts
const eventCalls = (await commands(page)).filter(call => call[0] === 'event')
expect(eventCalls.filter(call => call[1] === 'album_created')).toHaveLength(1)
expect(eventCalls.filter(call => call[1] === 'album_published')).toHaveLength(1)
expect(JSON.stringify(eventCalls)).not.toContain('token=')
```

- [ ] **Step 2: Verify red.** Run `npm run test:e2e:analytics`; expect missing workflow events.

- [ ] **Step 3: Instrument confirmed create/publish.** In `app/pages/create.vue`, immediately after the successful `$fetch`, call `trackAnalyticsEvent({ name: 'album_created', creation_flow: 'guest' })` and the corresponding `album_published`. In `CreateAlbumDialog.vue`, send `{ name: 'album_created', creation_flow: 'studio' }` after its successful `$fetch`. In `AlbumShareActions.vue`, send `album_published` only after `pending` resolves for `action === 'publish'`, before unrelated clipboard/local-storage outcomes; avoid sending for `share`.

```ts
trackAnalyticsEvent({ name: 'album_created', creation_flow: 'guest' })
trackAnalyticsEvent({ name: 'album_published', creation_flow: 'guest' })
// Studio create: trackAnalyticsEvent({ name: 'album_created', creation_flow: 'studio' })
// Publish request success: trackAnalyticsEvent({ name: 'album_published', creation_flow: 'studio' })
```

- [ ] **Step 4: Instrument the customer gallery and shared layout switch.** In `app/pages/album/[albumId].vue`, call `album_opened` once after authorized overview plus first photo load succeed (`!paged.error.value && !error.value`), never in polling. In `saveSelection`, call `photo_selected` or `photo_unselected` only in the `result.status === 'saved'` branch, using `result.count`; call `photo_note_saved` immediately after `note.status === 'saved'`, before the existing early return when focus has changed. Add a `changed` emit to `GalleryLayoutSwitch.vue` and call it only when the chosen layout differs from current. The customer parent reports `{ name: 'gallery_view_changed', layout: next, surface: 'customer' }`; `AlbumWorkspace.vue` reports the same with `surface: 'studio'`. Do not track the layout restored from local storage.

```ts
if (result.status === 'saved') {
  trackAnalyticsEvent({ name: wanted ? 'photo_selected' : 'photo_unselected', selected_count: result.count })
}
function chooseLayout(next: GalleryLayout) {
  if (next === layout.value) return
  layout.value = next
  emit('changed', next)
}
```

- [ ] **Step 5: Verify and commit.** Run `npm run test:e2e:analytics`, `npm run typecheck`, `npm run test:e2e -- --project=chromium tests/e2e/guest-album.spec.ts tests/e2e/gallery.spec.ts tests/e2e/studio-album-share.spec.ts`. Expect event counts only for confirmed actions and no existing workflow regression. Commit the six app files and E2E file with `git commit -m "feat: report album and gallery workflow events"`.

### Task 5: Finalize, reopen, and file-match events

**Files:**
- Modify: `app/components/album/AlbumWorkspace.vue`
- Modify: `app/composables/useLocalPhotoFilter.ts`
- Modify: `app/pages/tools/file-filter.vue`
- Test: `tests/e2e/analytics.spec.ts`

**Interfaces:**
- Consumes: Task 1's `trackAnalyticsEvent`. The two local filter entry points report the same `file_match_completed` contract with numeric counts only.

- [ ] **Step 1: Add failing assertions.** In `analytics.spec.ts`, use existing mocks from `tests/e2e/album-workspace.spec.ts` and `tests/e2e/file-filter.spec.ts`: a successful finalize and reopen each add one event with `surface: 'studio'` or `guest_admin`; a failed API adds none; a successful local preview adds `file_match_completed` with `matched_count`, `missing_count`, and `ambiguous_count`; an aborted/failed scan adds none. Check no filename enters `dataLayer`.

```ts
expect((await commands(page)).filter(call => call[0] === 'event' && call[1] === 'file_match_completed')).toEqual([
  ['event', 'file_match_completed', expect.objectContaining({ matched_count: 1, missing_count: 0, ambiguous_count: 0, page_location: expect.any(String) })],
])
```

- [ ] **Step 2: Verify red.** Run `npm run test:e2e:analytics`; expect missing finalize/reopen/match events.

- [ ] **Step 3: Instrument confirmed management actions.** In `AlbumWorkspace.vue`, report `selection_finalized` immediately after `POST .../finalize` resolves and `selection_reopened` immediately after `POST .../reopen` resolves. Derive `surface` from `props.apiRoot.startsWith('/api/guest/') ? 'guest_admin' : 'studio'`. This is before the subsequent reload, which could fail after the server already committed.

```ts
const surface = props.apiRoot.startsWith('/api/guest/') ? 'guest_admin' : 'studio'
trackAnalyticsEvent({ name: 'selection_finalized', surface })
trackAnalyticsEvent({ name: 'selection_reopened', surface })
```

- [ ] **Step 4: Instrument both successful matching previews.** In `useLocalPhotoFilter.ts`, after `phase.value = 'preview'` in the successful `scan()` path, report counts from `preview.value`, guarded by the existing `current.signal.aborted` check. In `app/pages/tools/file-filter.vue`, report counts after `preview.value = matchLocalFiles(...)` succeeds in `runPreview()`. Do not pass filename arrays or path strings. Re-running a real preview is a separate user action and may emit a new match event; copy retries do not.

```ts
const result = preview.value
trackAnalyticsEvent({
  name: 'file_match_completed',
  matched_count: result.matched.length,
  missing_count: result.missing.length,
  ambiguous_count: result.ambiguous.length,
})
```

- [ ] **Step 5: Verify and commit.** Run `npm run test:e2e:analytics`, `npm run typecheck`, and `npm run test:e2e -- --project=chromium tests/e2e/album-workspace.spec.ts tests/e2e/file-filter.spec.ts tests/e2e/album-local-filter.spec.ts`. Commit the three app files and E2E file with `git commit -m "feat: report completed selection and file-match events"`.

### Task 6: Release gates and complete verification

**Files:**
- Modify: `docs/vercel-deployment.md`
- Modify: `README.md`
- Modify: `docs/implementation-progress.md`
- Test: `tests/e2e/analytics.spec.ts`

**Interfaces:**
- No new runtime interface. This task closes the release checklist and verifies the implementation against the approved design.

- [ ] **Step 1: Extend browser checks for rejection, revocation, and both widths.** In `analytics.spec.ts`, reject on `/` and assert no tag request through navigation; reopen settings and accept; revoke, wait for reload, assert local storage value `rejected` and no second script request; repeat the consent control visibility at 320 px and 1280 px. Also assert the default E2E server, without GA4 variables, emits no tag in HTML or requests.

```ts
await page.setViewportSize({ width: 320, height: 700 })
await page.goto('/')
await page.getByRole('button', { name: 'Từ chối' }).click()
expect(await page.evaluate(() => localStorage.getItem('zeno-analytics-consent-v1'))).toBe('rejected')
await page.getByRole('button', { name: 'Cài đặt phân tích' }).click()
await expect(page.getByRole('button', { name: 'Đồng ý' })).toBeVisible()
```

- [ ] **Step 2: Document the Production gate.** In `docs/vercel-deployment.md`, list the two Production-only env vars, GA4 stream settings, and QA order: publish privacy-policy disclosure, disable enhanced History page views and optional automatic events, configure query-parameter redaction as secondary protection, deploy, then check a consented visit in browser Network and GA4 DebugView. In `README.md`, summarize the consent behavior and point to the deployment checklist. In `docs/implementation-progress.md`, mark only the GA4 integration as implemented after checks pass; keep T48–T49 marked unimplemented.

- [ ] **Step 3: Run the complete local gate.** Run `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e -- --project=chromium`, and `npm run test:e2e:analytics`. Expected: all pass. Check `git diff --check` and manually inspect an enabled E2E `dataLayer` for the ten allowed event names and absence of token, note, filename, or email. Stop if any failure has a product cause; fix it and rerun the smallest failing check before repeating the full gate.

- [ ] **Step 4: Production release checklist and commit.** Commit docs/tests with `git commit -m "docs: add GA4 release and privacy verification"`. Do not enable the Production flag until the external privacy page and GA4 property settings are confirmed. After deployment, use a consented test visit to verify one page view per screen in GA4 DebugView and sanitized `page_location`/`page_referrer` in Network. This manual account-side check cannot be proven by repository tests and remains an explicit release gate.

## Spec coverage check

| Approved requirement | Task |
| --- | --- |
| Production-only flag and fixed stream ID | 3, 6 |
| Consent, persistence, rejection, revocation, accessible controls | 2, 3, 6 |
| Safe URL/title/referrer and no identifying event payloads | 1, 3, 6 |
| Single manual page view after consent and route navigation | 3, 6 |
| Ten confirmed workflow events | 4, 5 |
| Blocked script does not break workflows | 3, 6 |
| GA4 property and privacy-policy gate | 3, 6 |
| Pure, browser, type, build, and existing workflow verification | 1–6 |
