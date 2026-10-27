# Studio Analytics Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each studio owner view complete workflow progress plus consented gallery-open and file-match counts for only their studio.

**Architecture:** Store non-identifying daily aggregates by studio in Neon, and album-level gallery opens in the existing `album_daily_stats`. Successful server mutations record operational counts transactionally; customer gallery entry reports only after consent and verified album access; local file matching reports only numeric results. A studio-owner-only Nitro API reads these aggregates under tenant RLS, and a mobile-first Nuxt page renders them. This plan is a companion to `2026-10-27-ga4-site-dashboard.md`; both are implemented in one delivery, with migration 024 before 025.

**Tech Stack:** Nuxt 4.6.1, Vue 3.5.44, Nitro, PostgreSQL/Neon RLS, Better Auth, PGlite, Vitest 5.0.4, Playwright, Node.js 24, npm. No new runtime or UI dependency.

## Global Constraints

- `/studio/analytics?studio=<studioId>` is readable only by that studio's `owner`; platform-admin status alone grants no access.
- Workflow counts include valid operations regardless of GA4 consent. Gallery opens require accepted consent and valid album access; label them as opens, not people or sessions.
- Keep only numbers, studio/album IDs and dates. No IP, email, token, filename, path, note body or personal identifier in aggregate tables or request bodies.
- Fixed ranges are 7, 30, 90 days in `Asia/Ho_Chi_Minh`; keep `studio_daily_metrics` at most 120 days. Historic purged albums cannot be backfilled.
- New metric writes are in the same database transaction as the successful operation where server-owned. Guest quick-create metrics move to the destination studio on claim without double counting.
- Preserve RLS and existing album access contracts. A failed metrics report from the local filter must not stop file matching; show its status explicitly.
- Follow `AGENTS.md`: parameterized SQL, thin HTTP routes, `withDatabaseContext`, accessible mobile-first UI, no new runtime dependency without approval.

---

## File map

| File | Responsibility |
| --- | --- |
| `db/migrations/025_studio_analytics.sql` | Daily aggregate table, owner read RLS, bounded metric write functions, guest-claim transfer and initial backfill |
| `server/analytics/studio-writer.ts` | Typed helper for transaction-owned counter increments |
| `server/analytics/studio-report.ts` | Owner authorization and 7/30/90-day report query |
| `server/api/studio/[studioId]/analytics.get.ts` | Studio report HTTP boundary |
| `server/api/album/[albumId]/analytics/open.post.ts` | Customer open counter boundary |
| `server/api/studio/[studioId]/albums/[albumId]/file-match.post.ts` and guest counterpart | Numeric local-filter report boundaries |
| `app/lib/studio-analytics.ts` | Small client helper checking existing analytics consent before gallery POST |
| `app/pages/studio/analytics.vue` | Owner dashboard UI |
| `app/components/studio/StudioHeader.vue` | Studio analytics navigation for owner |
| `functions/expire/handler.ts` | Purge aggregate rows older than 120 days in scheduled work |
| `tests/db/studio-analytics.test.ts`, `tests/domain/studio-analytics.test.ts`, `tests/e2e/studio-analytics.spec.ts` | RLS, counting, API and browser behavior |

## Task 1: Aggregate schema, permissions, backfill and claim transfer

**Files:** Create `db/migrations/025_studio_analytics.sql`, `tests/db/studio-analytics.test.ts`; modify `tests/db/migrations.test.ts`. Replace the function from migration 017 inside migration 025; do not edit the already-applied 017 file.

**Interfaces:** `studio_daily_metrics(studio_id, day, albums_created, albums_published, selection_finalized, gallery_opens, file_match_runs, matched_count, missing_count, ambiguous_count)`; `album_analytics_open_rate(album_id, minute, request_count)`; `app_private.record_studio_metric(target_studio uuid, target_album uuid, metric text, amount integer default 1)`; `app_private.record_gallery_open(target_album uuid)`; `app_private.record_file_match(target_album uuid, matched integer, missing integer, ambiguous integer)`; `app_private.purge_studio_metrics() RETURNS TABLE(metrics_deleted integer, rate_deleted integer)`.

- [ ] **Step 1: Write failing DB tests.** Apply migrations 000–025 to PGlite; assert new table RLS is enabled, owner of A reads A only, manager/member/retoucher of A read none, owner of B cannot read A, and runtime cannot directly mutate aggregates. Insert an album and call the metric functions with valid/invalid context; valid call increments once, bad `studioId`/`albumId` or metric name fails, repeated guest claim does not duplicate transferred counts. Verify 90-day aggregate survives album deletion while album-level row cascades.
- [ ] **Step 2: Run red.** `npm test -- tests/db/studio-analytics.test.ts tests/db/migrations.test.ts`; expect missing table/function failures.
- [ ] **Step 3: Add schema and guarded functions.** Create `studio_daily_metrics` with `PRIMARY KEY(studio_id,day)`, nonnegative integer defaults and FK `studio_id REFERENCES studios(id) ON DELETE CASCADE`; RLS `SELECT` policy requires `studio_id=app_private.studio_id()` and an owner membership for `app_private.user_id()`. Grant runtime SELECT only; revoke direct INSERT/UPDATE/DELETE. Create `album_analytics_open_rate` keyed by `(album_id, minute)` with only a request count; enable RLS with no runtime policy or table grant. Each `SECURITY DEFINER SET search_path=public,pg_temp` writer validates context before upsert: member scope requires matching studio plus membership, guest-admin scope requires `app.album_id=target_album` and album ownership, customer scope is allowed only in `record_gallery_open` after `app_private.album_readable(target_album)`. `record_gallery_open` atomically rejects after 120 accepted calls per album/minute, then increments both `studio_daily_metrics.gallery_opens` and `album_daily_stats.views` for Vietnam-local day in one transaction. `record_file_match` accepts `0..10000` per count and checks manager access or authenticated studio member. Define `purge_studio_metrics()` to delete daily rows older than 120 Vietnam-local days and rate rows older than one day; return both deleted row counts. Fix function privileges to `REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO app_runtime`.

The aggregate table starts with this schema; the three writer functions expose the only mutation path:

```sql
CREATE TABLE studio_daily_metrics (
  studio_id uuid NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  day date NOT NULL,
  albums_created integer NOT NULL DEFAULT 0 CHECK (albums_created >= 0),
  albums_published integer NOT NULL DEFAULT 0 CHECK (albums_published >= 0),
  selection_finalized integer NOT NULL DEFAULT 0 CHECK (selection_finalized >= 0),
  gallery_opens integer NOT NULL DEFAULT 0 CHECK (gallery_opens >= 0),
  file_match_runs integer NOT NULL DEFAULT 0 CHECK (file_match_runs >= 0),
  matched_count integer NOT NULL DEFAULT 0 CHECK (matched_count >= 0),
  missing_count integer NOT NULL DEFAULT 0 CHECK (missing_count >= 0),
  ambiguous_count integer NOT NULL DEFAULT 0 CHECK (ambiguous_count >= 0),
  PRIMARY KEY (studio_id, day)
);
```
- [ ] **Step 4: Backfill and transfer.** In 025, insert historic `albums.created_at`, non-null `albums.published_at` and `selection_versions.finalized_at` into daily aggregates using grouped `INSERT ... ON CONFLICT DO UPDATE`; the migration runs once before app metric writers deploy. Replace `app_private.claim_guest_album` with the same existing authorization and album/token updates plus a grouped upsert from `source_studio` to `target_studio` **before** deleting the guest-only studio. Guest-only studio is one album by current `createGuestAlbum`; verify the source has no other album before transfer. Preserve all original guards and side effects from migration 017. Never edit migration 017 in place.
- [ ] **Step 5: Run green and commit.** `npm test -- tests/db/studio-analytics.test.ts tests/db/migrations.test.ts`; expect RLS, backfill and claim tests pass. Commit migration/tests with `git commit -m "feat: add tenant-isolated studio analytics aggregates"`.

## Task 2: Count successful workflow operations transactionally

**Files:** Create `server/analytics/studio-writer.ts`; modify `server/albums/album.ts`, `server/albums/guest.ts`, `server/albums/selection.ts`; add/update `tests/db/studio-analytics.test.ts`, `tests/domain/studio-analytics.test.ts`.

**Interfaces:** `recordStudioMetric(client: QueryClient, studioId: string, albumId: string, metric: 'album_created'|'album_published'|'selection_finalized'): Promise<void>` runs `SELECT app_private.record_studio_metric($1,$2,$3,1)`; it never opens a new transaction. For guest quick-create, call twice (`album_created`, `album_published`) after `insertAlbumRecords` inside the same `withDatabaseContext` work.

- [ ] **Step 1: Write failing behavior tests.** For studio draft creation, publish and finalize, assert exactly one matching daily increment after success. Force a later SQL failure in each transaction and assert neither business row nor metric remains. Retry rejected publish/finalize and assert no increment. Create a guest album and assert both created and published are counted in its guest-only studio; claim it and assert counts move once.
- [ ] **Step 2: Run red.** `npm test -- tests/db/studio-analytics.test.ts tests/domain/studio-analytics.test.ts`; expect absent increments.
- [ ] **Step 3: Implement minimal calls.** Import the typed helper and call it after the successful `INSERT INTO albums` in `insertAlbumRecords` for album create; after the successful publish status update for publish; after inserting `selection_versions` and updating album status for finalize. Prevent double-created count: `insertAlbumRecords` handles studio and guest creation once; guest quick-create additionally records publish, while studio draft publish records it in `publishAlbum`. Use `session.studioId` from `withManagedAlbum` for finalize. All calls use the existing `client` so a thrown error rolls back both writes.

```ts
export async function recordStudioMetric(
  client: QueryClient, studioId: string, albumId: string,
  metric: 'album_created' | 'album_published' | 'selection_finalized',
): Promise<void> {
  await client.query('SELECT app_private.record_studio_metric($1, $2, $3, 1)',
    [studioId, albumId, metric])
}
```
- [ ] **Step 4: Run green.** `npm test -- tests/db/studio-analytics.test.ts tests/domain/studio-analytics.test.ts && npm run typecheck`; expect exact-once and rollback tests pass.
- [ ] **Step 5: Commit.** Commit helper, domain changes and tests with `git commit -m "feat: count studio workflow progress"`.

## Task 3: Consented customer gallery opens

**Files:** Create `server/api/album/[albumId]/analytics/open.post.ts`, `app/lib/studio-analytics.ts`; modify `app/pages/album/[albumId].vue`; extend `tests/db/studio-analytics.test.ts`, `tests/e2e/analytics.spec.ts`.

**Interfaces:** `reportGalleryOpen(albumId: string): Promise<void>` reads existing `readConsent`, `isAnalyticsEnabled` and runtime config; returns without network when not Production-enabled or choice is not `accepted`. Endpoint body is empty; it uses existing album access cookie/bearer and no client-supplied studio ID.

- [ ] **Step 1: Write failing consent tests.** In the GA4-enabled Playwright server: unknown/rejected consent yields no `/api/album/:id/analytics/open` POST; after accepted consent and a successful first gallery photo page, exactly one POST occurs; accepting while an already-loaded gallery is open also sends exactly one POST; failed album access/photos yields none; query/hash-only navigation, polling and repeated render yield none; revocation stops later POSTs. DB test checks valid customer context increments gallery and album daily values, invalid/expired access fails and leaves counts unchanged.
- [ ] **Step 2: Run red.** `npm run test:e2e:analytics` and `npm test -- tests/db/studio-analytics.test.ts`; expect missing POST/count assertions.
- [ ] **Step 3: Implement endpoint and client trigger.** Handler order: `requireAlbumAccess(event)`; reject non-customer/participant/finalizer scope; check `useRuntimeConfig(event).public.ga4Enabled` equals `true` or `'true'`, then call `withDatabaseContext(getAppPool(), {albumId:access.albumId,participantId:access.participantId ?? undefined,scope:access.scope}, client => client.query('SELECT app_private.record_gallery_open($1)',[access.albumId]))`; `Cache-Control: no-store`, status 204. The client helper checks accepted local consent and Production flag, POSTs an empty body, and returns a status for a small nonblocking diagnostics warning if the write fails. In the gallery page, watch `useAnalyticsConsent().choice` and a `galleryReady` flag set only after `enter()` loaded the first page; report when both are true. A per-entry `reportedOpen` guard prevents duplicate POSTs on polling/render/query changes and covers consent accepted after the gallery loaded. Never send raw URL or token.
- [ ] **Step 4: Run green.** `npm run test:e2e:analytics && npm test -- tests/db/studio-analytics.test.ts && npm run typecheck`; expect consent and access gates pass.
- [ ] **Step 5: Commit.** Commit endpoint, helper, page and tests with `git commit -m "feat: count consented gallery opens by studio"`.

## Task 4: Numeric file-matching reports

**Files:** Create `server/api/studio/[studioId]/albums/[albumId]/file-match.post.ts`, `server/api/guest/albums/[albumId]/file-match.post.ts`; modify `app/composables/useLocalPhotoFilter.ts`, `app/pages/studio/albums/[albumId]/filter.vue`, `app/pages/guest/albums/[albumId]/filter.vue`; extend `tests/db/studio-analytics.test.ts`, `tests/e2e/file-filter.spec.ts` and `tests/e2e/album-local-filter.spec.ts` where the current surface is covered.

**Interfaces:** Both endpoints accept `{ matchedCount: number, missingCount: number, ambiguousCount: number }` only. `useLocalPhotoFilter(manifest, reportMatch?: (counts) => Promise<void>)` calls callback only after preview is successfully built; the existing GA4 `file_match_completed` event remains consent-gated and separate.

- [ ] **Step 1: Write failing API/browser tests.** Reject strings, decimals, negatives, values over 10,000 and extra keys with 400; reject nonmember/nonmanager guest with 403; success increments one run and the three totals; failed/cancelled scan sends no POST. In browser, intercept POST and assert body contains only the three numeric keys, no filename, path, token or note. A 503 from analytics POST leaves preview usable and displays a small warning.
- [ ] **Step 2: Run red.** `npm run test:e2e -- --project=chromium tests/e2e/file-filter.spec.ts tests/e2e/album-local-filter.spec.ts` and `npm test -- tests/db/studio-analytics.test.ts`; expect missing endpoint/report failures.
- [ ] **Step 3: Implement boundaries and callback.** Studio handler uses `requireStudioUser`, `studioIdParam`, album ID validation and a membership/album check inside `withDatabaseContext`; guest handler uses existing `guestManager` from `server/utils/guest-api.ts` plus `withManagedAlbum` to verify the cookie. Both validate exact own-property keys and integer bounds before `SELECT app_private.record_file_match($1,$2,$3,$4)`; no body data is logged. In the composable, call `reportMatch` after successful preview creation (where the existing GA event fires), catch only its network error into a `reportError` ref and preserve preview. The two album filter pages pass the appropriate `$fetch` callback; the stand-alone `/tools/file-filter` has no album and does not report per-studio data.
- [ ] **Step 4: Run green.** Run the same E2E/DB commands plus `npm run typecheck`; expect valid reports and nonblocking failures.
- [ ] **Step 5: Commit.** Commit endpoints, composable/pages and tests with `git commit -m "feat: report album file matching totals"`.

## Task 5: Owner-only report API and studio page

**Files:** Create `server/analytics/studio-report.ts`, `server/api/studio/[studioId]/analytics.get.ts`, `app/pages/studio/analytics.vue`, `tests/domain/studio-analytics.test.ts`, `tests/e2e/studio-analytics.spec.ts`; modify `app/components/studio/StudioHeader.vue`, `app/lib/analytics-model.ts`, `nuxt.config.ts`.

**Interfaces:** `getStudioAnalytics(pool: ConnectionPool, studioId: string, userId: string, days: 7|30|90): Promise<StudioAnalyticsReport>`; report has `{days,asOf,timezone:'Asia/Ho_Chi_Minh',albumsCreated,albumsPublished,albumsFinalized, galleryOpens,fileMatchRuns,matchedCount,missingCount,ambiguousCount,trend,albums}`. Only the owner may call it.

- [ ] **Step 1: Write failing report/security tests.** Owner A sees only studio A; manager/member/retoucher A and owner B receive 403 for A. Invalid `studioId`/`days` returns 400. Verify dates on Vietnam midnight, no cross-studio album rows, zero counts on empty valid periods, and clear distinction between finalized-album card (distinct album IDs) and daily finalization operations. E2E mocks report: cards/table show values, 7/30/90 controls refetch, loading/error/empty states read clearly at 320 and 1280 px.
- [ ] **Step 2: Run red.** `npm test -- tests/domain/studio-analytics.test.ts tests/db/studio-analytics.test.ts` and `npm run test:e2e -- --project=chromium tests/e2e/studio-analytics.spec.ts`; expect missing API/page failures.
- [ ] **Step 3: Implement query and route.** Route calls `requireStudioUser`, `studioIdParam`, validates `getQuery(event).days` against `7|30|90` (missing defaults 30), sets `Cache-Control: private, no-store`, then calls report. The report function runs under `withDatabaseContext(pool,{studioId,userId,scope:'member'},...)`; first query `studio_members` for `role='owner'` and throw 403 otherwise. Query `studio_daily_metrics` for daily series/totals, `selection_versions` for distinct finalized albums, and album-scoped current rows for status, latest snapshot item count, current note count, and `album_daily_stats.views`. Use parameterized date bounds and return only aggregate numbers/album metadata already visible to owner, never note bodies, customer identity, tokens or filenames.
- [ ] **Step 4: Implement UI and verify.** Use `<script setup lang="ts">`, existing `StudioHeader`, a date-range button group with `aria-pressed`, accessible numeric cards, a labeled daily bar/list, and a table that becomes cards/scrolls on mobile. Only show analytics navigation when `store.studio?.role === 'owner'`; API still guards. Map `/studio/analytics` in `safePage` and add `noindex,nofollow` route rule. Run `npm test`, `npm run typecheck`, `npm run build`, and E2E `studio-analytics.spec.ts` plus existing `studio-dashboard.spec.ts`; expect pass and no 320 px overflow.
- [ ] **Step 5: Commit.** Commit API, report query, page/nav/model/config and tests with `git commit -m "feat: show owner-only studio analytics"`.

## Task 6: Retention and same-batch release

**Files:** Modify `functions/expire/handler.ts`, `docs/vercel-deployment.md`, `docs/implementation-progress.md`, `README.md`; extend `tests/db/studio-analytics.test.ts`, `tests/domain/neon-expiry-handler.test.ts`.

- [ ] **Step 1: Write retention test.** Insert `studio_daily_metrics` at 121 and 90 days old plus `album_analytics_open_rate` rows at 25 hours and 30 minutes old; invoke the cleanup SQL used by the Neon Function; expect the 121-day metric and 25-hour rate row deleted, the newer rows retained. Confirm a deleted album cannot erase studio-level daily aggregates until retention expires.
- [ ] **Step 2: Run red.** `npm test -- tests/db/studio-analytics.test.ts`; expect old row still present.
- [ ] **Step 3: Wire bounded cleanup.** The `app_private.purge_studio_metrics()` function already exists from Task 1 and deletes daily rows with `day < ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 120)` and rate rows older than one day. Extend the existing scheduled expire handler to call it after `app_private.expire_and_purge()` and include its two deletion counts in the JSON response; do not log row data. Build the Neon function with `npm run neon:build`, inspect `neon config plan`, then apply on the intended Production branch when release gates are met. The Production `album-expiry` schedule must be deployed and verified; current schedule is only observed on `codex-v1-dev`.
- [ ] **Step 4: Prepare and validate release.** Apply migration 025 on an isolated branch copied from Neon Production; verify runtime role remains `NOBYPASSRLS NOCREATEROLE`, RLS tests and backfill/claim behavior. Apply to Production before deploying code; run `npm test`, `npm run typecheck`, `npm run build`, Chromium relevant tests and live smoke with owned studio plus consented/declined customer link. Verify cross-studio 403, no PII in request payloads, privacy policy describes consented studio counts, and dashboard labels do not imply unique visitors. Never run live test fixtures against Production.
- [ ] **Step 5: Document and commit.** Update docs with migration, deployment ID, policy/GA4 setup, retention schedule and live evidence; `git diff --check`; commit `docs: record studio analytics release`.

## References

- [Approved design](../specs/2026-10-27-analytics-dashboards-design.md)
- [Current implementation progress](../../implementation-progress.md)
- [Existing GA4 consent design](../specs/2026-10-27-ga4-integration-design.md)
