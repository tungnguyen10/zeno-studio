# GA4 Site Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give database-authorized platform administrators a private Zeno Studio page with 7/30/90-day GA4 site reports.

**Architecture:** A new `platform_admins` table grants access by Better Auth user ID. A Nitro endpoint checks that grant, obtains a server-side service-account token, calls GA4 Data API with fixed reports, normalizes the response and caches it for 15 minutes. The Nuxt page receives only aggregate data. This plan is independently usable; the companion studio plan is `2026-10-27-studio-analytics-dashboard.md` and can follow in the same release.

**Tech Stack:** Nuxt 4.6.1, Vue 3.5.44, Nitro, PostgreSQL/Neon RLS, Better Auth, GA4 Data API REST, Node.js 24 built-in `node:crypto`, Vitest 5.0.4, Playwright, npm. No new runtime or UI dependency.

## Global Constraints

- Measurement ID `G-2GD5P03B7S` is for sending events; server reports require the separate numeric GA4 property ID.
- Only verified users listed in `platform_admins` may read site reports. No client-side Google credential and no self-grant API.
- The page reports only consented GA4 traffic; do not compare its counts as a conversion denominator for complete Neon workflow data.
- Fixed ranges are 7, 30, 90 days including today. Cache each report for 15 minutes; errors must remain explicit, never become zero data.
- Keep GA4 page paths sanitized and show data freshness/property timezone. Never log credentials, access tokens, raw URLs or response payloads.
- Follow `AGENTS.md`: parameterized SQL, `withDatabaseContext`, RLS, accessible mobile-first UI, no new runtime dependency without approval.

---

## File map

| File | Responsibility |
| --- | --- |
| `db/migrations/024_platform_admins.sql` | Read-only runtime grant and RLS for platform admin membership |
| `server/analytics/platform-admin.ts` | Look up current user's grant |
| `server/analytics/google-token.ts` | Validate service-account env, sign JWT, exchange/cache OAuth token |
| `server/analytics/ga4-report.ts` | Fixed Data API requests and safe response normalization |
| `server/analytics/site-report.ts` | 15-minute cache, typed page DTO and GA error mapping |
| `server/api/admin/access.get.ts` | Authenticated role probe for navigation |
| `server/api/admin/analytics.get.ts` | Authorized site report endpoint |
| `app/pages/admin/analytics.vue` | Site report UI |
| `app/components/studio/StudioHeader.vue` | Admin navigation only after role probe |
| `app/lib/analytics-model.ts` | Safe path name for new admin route |
| `scripts/grant-platform-admin.ts` | One-time direct-role grant/revoke command |
| `tests/db/platform-admin.test.ts`, `tests/domain/ga4-report.test.ts`, `tests/e2e/admin-analytics.spec.ts` | Permissions, report behavior and browser states |

## Task 1: Platform administrator grant and server authorization

**Files:** Create `db/migrations/024_platform_admins.sql`, `server/analytics/platform-admin.ts`, `scripts/grant-platform-admin.ts`, `tests/db/platform-admin.test.ts`; update migration enumeration in `tests/db/migrations.test.ts`.

**Interfaces:** Produce `isPlatformAdmin(pool: ConnectionPool, userId: string): Promise<boolean>` and `requirePlatformAdmin(event: H3Event): Promise<{ id: string }>`; later API tasks call the latter. `requirePlatformAdmin` must call existing `requireStudioUser` first.

- [ ] **Step 1: Write failing PGlite assertions.** Apply migrations 000–024 to a fresh PGlite database, create two verified users, insert only user A into `platform_admins` as owner, then `SET ROLE app_runtime`; with `app.user_id=user-a`, `SELECT user_id FROM platform_admins` yields only A; with B yields none; `INSERT`, `UPDATE` and `DELETE` as runtime all fail. Add the new migration to `tests/db/migrations.test.ts` and require `platform_admins` to have RLS.
- [ ] **Step 2: Run red.** `npm test -- tests/db/platform-admin.test.ts tests/db/migrations.test.ts`; expect missing table/migration failure.
- [ ] **Step 3: Add migration and helper.** Migration body:

```sql
CREATE TABLE platform_admins (
  user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;
CREATE POLICY platform_admins_self_read ON platform_admins FOR SELECT TO app_runtime
  USING (user_id = app_private.user_id());
GRANT SELECT ON platform_admins TO app_runtime;
```

`isPlatformAdmin` uses the following query inside `withDatabaseContext`; `requirePlatformAdmin` throws HTTP 403 if false and keeps 401/verification behavior from `requireStudioUser`:

```ts
export async function isPlatformAdmin(pool: ConnectionPool, userId: string): Promise<boolean> {
  const result = await withDatabaseContext(pool, { userId, scope: 'platform_admin_check' },
    client => client.query('SELECT 1 FROM platform_admins WHERE user_id = $1', [userId]))
  return result.rows.length === 1
}
```

The direct-role script takes `grant|revoke` and an email argument, uses `NUXT_DATABASE_DIRECT_URL`, verifies `"emailVerified"`, parameterizes the email, upserts or deletes by selected `user.id`, and prints only the action and ID. Reject zero or multiple matches; no browser API grants roles. Invoke as `node --env-file-if-exists=.env --import tsx scripts/grant-platform-admin.ts grant <verified-account-email>`.

- [ ] **Step 4: Run green.** `npm test -- tests/db/platform-admin.test.ts tests/db/migrations.test.ts` and `npm run typecheck`; expect all new assertions pass and zero TS errors.
- [ ] **Step 5: Commit.** `git add db/migrations/024_platform_admins.sql server/analytics/platform-admin.ts scripts/grant-platform-admin.ts tests/db/platform-admin.test.ts tests/db/migrations.test.ts && git commit -m "feat: add platform administrator grant"`.

## Task 2: Server-only GA4 transport and fixed report parser

**Files:** Create `server/analytics/google-token.ts`, `server/analytics/ga4-report.ts`, `tests/domain/ga4-report.test.ts`; modify `nuxt.config.ts`, `.env.example`.

**Interfaces:** Produce `getGoogleAccessToken(fetcher = fetch): Promise<string>` and `fetchGa4SiteReport(propertyId: string, propertyTimezone: string, days: 7 | 30 | 90, token: string, fetcher = fetch): Promise<SiteReport>`. `SiteReport` is `{ days, asOf, timezone, activeUsers, pageViews, trend: {date, activeUsers, pageViews}[], pages: {path, views}[], events: {name, count}[] }`.

- [ ] **Step 1: Write failing transport/parser tests.** Inject a fake `fetcher`; assert JWT request uses `https://oauth2.googleapis.com/token`, `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer`, scope `https://www.googleapis.com/auth/analytics.readonly`, a signed RS256 assertion with one-hour expiry, and no credential in report output. Fake four `runReport` responses: overall totals, day series, page paths and event names. Check the parser returns 10 known events with missing events set to 0 only on a successful Google response, excludes unknown/raw page paths, and throws on Google 401/403/429/5xx or malformed rows.
- [ ] **Step 2: Run red.** `npm test -- tests/domain/ga4-report.test.ts`; expect missing-module failure.
- [ ] **Step 3: Implement Google transport with built-in crypto.** Add `ga4PropertyId`, `ga4PropertyTimezone`, `ga4ServiceAccountJson` to private `runtimeConfig` and blank entries `NUXT_GA4_PROPERTY_ID`, `NUXT_GA4_PROPERTY_TIMEZONE`, `NUXT_GA4_SERVICE_ACCOUNT_JSON` to `.env.example`. Parse the JSON into `{client_email, private_key}` with explicit validation; never print it. Create the JWT with `createSign('RSA-SHA256')`, header `{alg:'RS256',typ:'JWT'}`, claims `{iss,scope,aud:'https://oauth2.googleapis.com/token',iat,exp:iat+3600}` and base64url segments. POST form-encoded JWT bearer grant, cache access token until at least 60 seconds before expiry, and use `Authorization: Bearer` only server-side. Validate numeric `propertyId` with `/^[0-9]+$/`; validate timezone using `Intl.DateTimeFormat` before accepting config.
- [ ] **Step 4: Implement fixed reports.** Send four bounded Data API `runReport` requests for the chosen date range: no dimension `activeUsers`/`screenPageViews` totals; dimension `date` for daily trend; dimension `pagePath` with `screenPageViews` for top safe routes; dimension `eventName` with `eventCount` filtered to the 10 events in the spec. Include `returnPropertyQuota` only in debug/test if needed, never return quota details to the client. Parse GA numeric strings as safe nonnegative integers, verify every dimension/metric header before mapping rows, filter page paths against the app's safe route templates, and cap page rows at 10. `asOf` is server fetch time; `timezone` is the validated `propertyTimezone` argument, with an explicit displayed label. Use `AbortSignal.timeout(8000)` per request.

The request date range is `{ startDate: `${days - 1}daysAgo`, endDate: 'today' }`. The event report body includes a fixed filter:

```ts
const EVENT_NAMES = [
  'album_created', 'album_published', 'album_opened', 'gallery_view_changed',
  'photo_selected', 'photo_unselected', 'photo_note_saved',
  'selection_finalized', 'selection_reopened', 'file_match_completed',
] as const
const eventReport = {
  dateRanges: [{ startDate: `${days - 1}daysAgo`, endDate: 'today' }],
  dimensions: [{ name: 'eventName' }],
  metrics: [{ name: 'eventCount' }],
  dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: EVENT_NAMES } } },
  limit: String(EVENT_NAMES.length),
}
```

- [ ] **Step 5: Run green and commit.** `npm test -- tests/domain/ga4-report.test.ts && npm run typecheck`; expect pass. Commit the five files with `git commit -m "feat: read fixed GA4 site reports"`.

## Task 3: Protected report endpoint and cache

**Files:** Create `server/analytics/site-report.ts`, `server/api/admin/access.get.ts`, `server/api/admin/analytics.get.ts`, `tests/domain/site-report.test.ts`; update `tests/e2e/admin-analytics.spec.ts` created in Task 4 if endpoint tests need shared fixtures.

**Interfaces:** `getCachedSiteReport(days: 7 | 30 | 90): Promise<SiteReport>` consumes Task 2 functions. `GET /api/admin/access` returns `{ isAdmin: boolean }` for a verified session. `GET /api/admin/analytics?days=30` returns `{ report: SiteReport }` to an admin only.

- [ ] **Step 1: Write failing cache and boundary tests.** Inject a clock and report loader; two calls for the same period within 15 minutes invoke loader once, different periods invoke separately, a failed load is not cached, an expired entry reloads, and only one in-flight promise exists per period. Test `days=7|30|90`; reject `0`, `365`, arrays, decimals and missing malformed query with 400; a missing query defaults to 30. Verify unauthenticated 401, verified non-admin 403 and admin 200 using an HTTP fixture.
- [ ] **Step 2: Run red.** `npm test -- tests/domain/site-report.test.ts`; expect missing-module failure.
- [ ] **Step 3: Implement cache and handlers.** Keep a module-local `Map<7|30|90,{value:SiteReport,expiresAt:number}>` plus `Map` of pending promises; cache only success. Handler order: `await requirePlatformAdmin(event)`, parse `getQuery(event).days`, then fetch report. Map missing config to 503, Google 401/403 to 502 with generic message, Google 429 to 503, and timeout/upstream 5xx to 502; do not leak error bodies. Add `Cache-Control: private, no-store` to both endpoints because authorization is per user even when server report data is shared. The access endpoint calls `requireStudioUser`, then `isPlatformAdmin`, and returns a boolean without exposing grants list.

```ts
function parseDays(value: unknown): 7 | 30 | 90 {
  if (value === undefined) return 30
  if (value === '7' || value === '30' || value === '90') return Number(value) as 7 | 30 | 90
  throw createError({ statusCode: 400, statusMessage: 'Khoảng ngày không hợp lệ' })
}
```

- [ ] **Step 4: Run green.** `npm test -- tests/domain/site-report.test.ts && npm run typecheck`; expect pass.
- [ ] **Step 5: Commit.** `git add server/analytics/site-report.ts server/api/admin tests/domain/site-report.test.ts && git commit -m "feat: protect and cache site analytics API"`.

## Task 4: Site report page and navigation

**Files:** Create `app/pages/admin/analytics.vue`, `tests/e2e/admin-analytics.spec.ts`; modify `app/components/studio/StudioHeader.vue`, `app/lib/analytics-model.ts`, `nuxt.config.ts`, `tests/domain/analytics-model.test.ts`.

**Interfaces:** Page calls only `/api/admin/analytics?days=N`; header calls `/api/admin/access` once after session is known. Safe GA route becomes `/admin/analytics` with generic title `Thống kê nền tảng`.

- [ ] **Step 1: Add failing E2E and route tests.** Mock `/api/admin/analytics` with `{report:{days:30,asOf:'2026-10-27T00:00:00Z',timezone:'Asia/Ho_Chi_Minh',activeUsers:12,pageViews:34,trend:[],pages:[],events:[]}}`; page shows 12 and 34, range buttons 7/30/90 fetch the selected period, empty lists get clear empty copy, a 502 gets retry and no fake zeros, narrow viewport has no horizontal body overflow. Test the safe route formatter maps `/admin/analytics?token=secret` to `/admin/analytics`.
- [ ] **Step 2: Run red.** `npm run test:e2e -- --project=chromium tests/e2e/admin-analytics.spec.ts` and `npm test -- tests/domain/analytics-model.test.ts`; expect missing page/route assertion failures.
- [ ] **Step 3: Implement focused UI.** Use `<script setup lang="ts">` with `const days = ref<7|30|90>(30)`, `watch(days, load, {immediate:true})`, explicit `loading`, `error`, `report`; render a semantic `<main>`, 3 range `<button :aria-pressed>`, numeric cards, daily bars as accessible `<ol>` with labels/value, top-page and event `<table>` with responsive overflow. No chart package. Header adds an `aria-current` admin link only when `/api/admin/access` says `isAdmin=true`; avoid fetching it for signed-out visitors. Add `noindex,nofollow` route rule for `/admin/**` and `/studio/analytics`; update GA safe route template without exposing query.
- [ ] **Step 4: Run green plus regression.** `npm run test:e2e -- --project=chromium tests/e2e/admin-analytics.spec.ts tests/e2e/studio-dashboard.spec.ts`, `npm test`, `npm run typecheck`, `npm run build`; expect no failures. Inspect 320 px and 1280 px screenshots for readable tables/focus states.
- [ ] **Step 5: Commit.** Commit page, header, model, config and tests with `git commit -m "feat: show private GA4 site dashboard"`.

## Task 5: Release preparation and Production validation

**Files:** Modify `README.md`, `docs/implementation-progress.md`, `docs/vercel-deployment.md`; no app behavior change.

- [ ] **Step 1: Prepare external access.** In a Google Cloud project, enable Google Analytics Data API; create a service account and add its email as Viewer to the correct GA4 property. Record the numeric property ID and verified property timezone. Add `NUXT_GA4_PROPERTY_ID`, `NUXT_GA4_PROPERTY_TIMEZONE` and `NUXT_GA4_SERVICE_ACCOUNT_JSON` as server-only Vercel Production env values; do not print or commit the JSON. Run `scripts/grant-platform-admin.ts grant <verified-account-email>` against the Production direct URL from a secure shell; confirm exactly one account granted. The script must fail closed if email is absent/unverified.
- [ ] **Step 2: Validate a Preview/test branch with fake or test credentials.** Run migration 024 on a Neon branch copied from Production and repeat `npm test`, `npm run typecheck`, `npm run build`, relevant E2E. Never use Production DB for automated tests.
- [ ] **Step 3: Deploy Production after migration and env are ready.** Verify anonymous `/api/admin/analytics` returns 401, a verified non-admin returns 403, admin gets 200. Compare the same 7-day period to GA4 UI, allowing processing delay; verify report paths contain no token/query and the browser has no service-account credential. Confirm Google errors show a visible error state.
- [ ] **Step 4: Update release docs and commit.** Record deployment ID, property setup status, live smoke evidence, policy dependency and known data freshness limits in the three files; `git diff --check`; commit `docs: record GA4 dashboard release`.

## References

- [Approved design](../specs/2026-10-27-analytics-dashboards-design.md)
- [GA4 Data API report guide](https://developers.google.com/analytics/devguides/reporting/data/v1/basics)
- [Service-account OAuth flow](https://developers.google.com/identity/protocols/oauth2/service-account)
- [Data API quotas](https://developers.google.com/analytics/devguides/reporting/data/v1/quotas)
