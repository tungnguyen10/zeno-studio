# Default Analytics Implementation Plan

**Goal:** Run GA4 by default and count authorized gallery opens on Production, while fixing the live admin report.

**Architecture:** Keep the existing client-only GA4 plugin and sanitized event allowlist. Remove obsolete consent state/UI, make the gallery counter depend only on its own Production flag and album access, and allow Nitro-parsed service-account objects at the token boundary.

**Stack:** Nuxt 4.6.1, Vue 3.5.44, Nitro, Vitest 5, Playwright, Vercel, Neon PostgreSQL.

## Constraints

- No new runtime dependencies or database migration.
- Keep GA4 disabled by default for Local and Preview; keep Enhanced Measurement disabled.
- Keep private URL/token/filename/note/email out of analytics payloads and logs.
- Never put service-account JSON in source, docs, tests or tool output.

## Tasks

### 1. Fix Production GA4 credential handling

Files: `server/analytics/google-token.ts`, `server/analytics/site-report.ts`, `tests/domain/ga4-report.test.ts`.

- [ ] Add a failing test passing a parsed service-account object to `requestServiceAccountToken`, asserting RSA signature and read-only scope; add invalid-object rejection.
- [ ] Accept and validate either JSON string or parsed object, normalize to a stable cache key, preserve generic errors.
- [ ] Run `npx vitest run tests/domain/ga4-report.test.ts`; reproduce the current Production response type locally and verify the live read-only Data API report still succeeds.

### 2. Enable GA4 without consent UI

Files: `app/plugins/analytics.client.ts`, `app/app.vue`, `app/components/SiteFooter.vue`; remove `app/components/AnalyticsConsent.vue` and `app/composables/useAnalyticsConsent.ts`; simplify `app/lib/analytics-consent.ts` to the environment gate; update `tests/domain/analytics-consent.test.ts`, `tests/e2e/analytics.spec.ts`.

- [ ] Change browser tests first: with GA4 enabled, first visit sends one safe `page_view` without a banner; navigation sends one more; legacy rejected storage does not suppress events; disabled environments still send none.
- [ ] Start the client plugin after mount when the explicit environment flag and valid Measurement ID permit it. Keep manual page/event tracking and `send_page_view:false`; set ads storage denied.
- [ ] Remove consent UI/state/cookie and stale tests. Run the focused domain and browser tests.

### 3. Enable studio gallery opens independent of GA4

Files: `app/lib/studio-analytics.ts`, `app/pages/album/[albumId].vue`, `server/api/album/[albumId]/analytics/open.post.ts`, `app/pages/studio/analytics.vue`, `app/pages/admin/analytics.vue`, `tests/e2e/analytics.spec.ts`.

- [ ] Change browser tests first: successful authorized gallery load sends one empty POST without consent; failure sends none; query/history changes do not duplicate it.
- [ ] Remove client and server consent checks, keep the separate gallery flag, access guard, rate limit, and safe payload. Update dashboard copy.
- [ ] Run focused browser/domain/database tests, `npm test`, `npm run typecheck`, and `npm run build`.

### 4. Release and smoke

Files: `.env.example`, `docs/vercel-deployment.md`, `docs/implementation-progress.md`.

- [ ] Document the changed behavior, historical data limit and external privacy-page task. Commit the focused changes to local `main`.
- [ ] Set `NUXT_PUBLIC_STUDIO_GALLERY_ANALYTICS_ENABLED=true` only in Vercel Production and deploy `main` to Production.
- [ ] Confirm deployment Ready, no consent banner, one sanitized GA4 page view in an isolated browser session, authenticated admin report, studio dashboard, and anonymous API authorization. Record deployment ID and smoke outcome.
