# Selection Island Original Download Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let customers download original Google Drive image bytes singly or in bounded multi-file batches from the existing gallery, subject to per-album settings.

**Architecture:** Add typed album download settings and a single server policy; keep Drive original retrieval separate from the preview endpoint. The server resolves internal photo IDs, streams originals, and creates bounded ZIP parts from short-lived signed plans. The customer gallery owns an ephemeral download basket and prepares mobile `File` objects only when requested.

**Tech Stack:** Nuxt 4.6.1, Vue 3 Composition API, Tailwind CSS 4.3.3, Nitro/H3, PostgreSQL/RLS on Neon, Google Drive API v3, Vitest 5.0.4, PGlite, Playwright, npm.

## Global Constraints

- Implement all P1 single, P2 multi-file and P3 per-album rights in this plan; release only after the combined gates pass.
- Download content must be the exact current Google Drive binary; never use thumbnail, resized URL, canvas conversion or preview fallback.
- New and existing albums default to disabled. `after_finalize` requires a snapshot for the **current** cycle; reopening closes access until that cycle is finalized.
- `single` controls Focus direct download; `selected` allows any basket subset, including one file; `all` allows one-click whole-album planning.
- The selected list is live saved hearts while `PUBLISHED`, and the Studio-finalized snapshot when `FINALIZED`/`DELIVERED`.
- Basket, hearts, notes and immutable snapshots remain separate. Closing the sheet retains basket; “Hủy chọn ảnh tải” clears it; “Dừng tải” aborts transfer but retains it.
- Mobile share is a two-step prepare/share flow with a fresh user click for `navigator.share`. Never claim a file was saved to Photos based on the share Promise.
- ZIP parts have count and byte bounds; an individually oversized file downloads directly. No durable copy of original images or ZIP on ZENO.
- Keep existing Nuxt routes, token/session auth, `withDatabaseContext` and RLS. Do not add a runtime dependency without approval.
- Use the dedicated Neon test branch for live checks, not production. Preserve `.env` secrets and never print tokens/Drive IDs in test output.
- Read `docs/superpowers/specs/2026-10-26-selection-island-original-download-design.md`, `.agents/instructions/server-api.instructions.md` and `.agents/instructions/ui.instructions.md` before implementing.

---

## File map and contracts

| Unit | Files | Contract |
| --- | --- | --- |
| Persisted settings/catalog | `db/migrations/021_album_download.sql`, `db/migrations/022_album_download_public_settings.sql`, `server/albums/album.ts`, `server/photo-sources/photo-source.ts` | Typed flags and optional byte length/MD5 from Drive listing; separate safe customer settings function. No binary in DB. |
| Policy and manager mutation | `shared/domain/download-policy.ts`, `server/albums/download-policy.ts`, `server/albums/download-settings.ts`, `server/albums/access.ts`, `server/albums/workspace.ts`, `server/albums/manager.ts` | `DownloadAction`, `DownloadSettings`, `DownloadCapabilities`; one policy used by all transfer routes. |
| Drive original | `server/photo-sources/google-drive.ts`, `server/downloads/original.ts` | `getOriginalMetadata(fileId, resourceKey?)` and `readPhoto` return current metadata and original byte stream. |
| Transfer API | `server/api/album/[albumId]/photos/[photoId]/download.get.ts`, `server/api/album/[albumId]/download/plan.post.ts`, `server/api/album/[albumId]/download/file.post.ts`, `server/api/album/[albumId]/download/zip.post.ts` | Auth at boundary, photo IDs only, explicit error and no-store headers. |
| Plan and ZIP | `server/downloads/plan.ts`, `server/downloads/ticket.ts`, `server/downloads/zip.ts`, `server/downloads/names.ts`, `server/downloads/limits.ts`, `db/migrations/023_album_download_rate_limit.sql` | Bounded parts, 10-minute signed tickets, durable rate-window counters, lossless ZIP STORE entries and cancellation. |
| Admin UI/API | `server/api/studio/[studioId]/albums/[albumId]/download.patch.ts`, `server/api/guest/albums/[albumId]/download.patch.ts`, `app/components/album/AlbumWorkspace.vue` | Same settings form for owner/manager and guest admin, with audit mutation. |
| Customer UI | `app/pages/album/[albumId].vue`, `app/components/album/SelectionIsland.vue`, `app/components/album/DownloadSheet.vue`, `app/composables/useAlbumDownload.ts` | Local basket, Focus direct action, mobile share, desktop ZIP progress. |
| Verification | `tests/domain/download-policy.test.ts`, `tests/db/download-policy.test.ts`, `tests/drive/google-drive.test.ts`, `tests/api/album-download.test.ts`, `tests/domain/download-plan.test.ts`, `tests/domain/download-zip.test.ts`, `tests/e2e/gallery-download.spec.ts`, `tests/live/drive-download.ts` | Policy/RLS, byte-for-byte single/ZIP, HTTP, browser and opt-in Drive checks. |

### Task 1: Safe migration and Drive catalog metadata

**Files:** Create `db/migrations/021_album_download.sql`; modify `server/photo-sources/photo-source.ts`, `server/photo-sources/google-drive.ts`, `server/albums/album.ts`; test `tests/db/migrations.test.ts`, `tests/drive/google-drive.test.ts`.

**Interfaces:** `SourcePhoto` gains optional `sizeBytes?: number`, `md5Checksum?: string`, `canDownload?: boolean`; existing adapter mocks remain valid because fields are optional.

- [ ] **Step 1: Add a failing migration/adapter test.** `tests/db/migrations.test.ts` currently stops its explicit migration list at 015; append 016–021 in order, then assert existing `album_settings` rows have `download_enabled=false`, `download_allow_single=true`, `download_allow_selected=true`, `download_allow_all=false`, `download_available_when='anytime'`. In `tests/drive/google-drive.test.ts`, return `size:'1234'`, `md5Checksum:'abc'`, `capabilities:{canDownload:true}` and assert numeric `sizeBytes:1234`, checksum and capability in `page.items[0]`.

```ts
expect(settings.rows[0]).toMatchObject({ download_enabled: false, download_allow_single: true,
  download_allow_selected: true, download_allow_all: false, download_available_when: 'anytime' })
expect(page.items[0]).toMatchObject({ sizeBytes: 1234, md5Checksum: 'abc', canDownload: true })
```

- [ ] **Step 2: Confirm red.** Run `npm test -- tests/db/migrations.test.ts tests/drive/google-drive.test.ts`; expect only the new assertions to fail.
- [ ] **Step 3: Add migration 021 and map metadata.** Use these exact typed columns and defaults; do not rewrite an applied migration. Extend Drive `files.list` fields to include `size,md5Checksum,capabilities(canDownload)`; parse only nonnegative safe integer sizes. Add nullable `source_size_bytes bigint` and `source_md5_checksum text` to `photos`; include the two optional values in `insertAlbumRecords` batches. Preserve existing names, MIME and resource keys.

```sql
ALTER TABLE album_settings ADD COLUMN download_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE album_settings ADD COLUMN download_allow_single boolean NOT NULL DEFAULT true;
ALTER TABLE album_settings ADD COLUMN download_allow_selected boolean NOT NULL DEFAULT true;
ALTER TABLE album_settings ADD COLUMN download_allow_all boolean NOT NULL DEFAULT false;
ALTER TABLE album_settings ADD COLUMN download_available_when text NOT NULL DEFAULT 'anytime'
  CHECK (download_available_when IN ('anytime', 'after_finalize'));
ALTER TABLE photos ADD COLUMN source_size_bytes bigint CHECK (source_size_bytes >= 0);
ALTER TABLE photos ADD COLUMN source_md5_checksum text;
```

- [ ] **Step 4: Confirm green and commit.** Run `npm test -- tests/db/migrations.test.ts tests/drive/google-drive.test.ts` and `npm run typecheck`; expect pass. Commit only these files with `git commit -m "feat: store album download defaults and Drive sizes"`.

### Task 2: Policy, current-cycle capability and RLS

**Files:** Create `shared/domain/download-policy.ts`, `server/albums/download-policy.ts`; modify `server/albums/access.ts`, `server/api/album/[albumId]/access.get.ts`; test `tests/domain/download-policy.test.ts`, `tests/db/download-policy.test.ts`.

**Interfaces:** Export `DownloadSettings`, `DownloadAction = 'single' | 'selected' | 'all'`, `DownloadCapabilities` and `evaluateDownload(settings, status, hasCurrentCycleSnapshot, selectedCount)` from the pure module. Export `getCustomerDownloadCapabilities(pool, access)` and `requireCustomerDownload(pool, access, action)` from the server module. Overview exposes `download: { canSingle, canSelected, canAll, reason, selectedSource, selectedCount }`.

- [ ] **Step 1: Write policy tests before implementation.** Append migration 022 to the migration-list test. Cover disabled defaults; every flag combination; `after_finalize` with `PUBLISHED` and prior snapshot; current-cycle `FINALIZED`; expired album; selected source `live` versus `snapshot`. Add a PGlite test that creates/publishes/finalizes/reopens an album and verifies the capability flips false/true/false without changing the older snapshot.

```ts
expect(evaluateDownload({ enabled: true, allowSingle: true, allowSelected: true,
  allowAll: false, availableWhen: 'after_finalize' }, 'PUBLISHED', true, 2).canSingle).toBe(false)
expect(evaluateDownload({ enabled: true, allowSingle: true, allowSelected: true,
  allowAll: false, availableWhen: 'after_finalize' }, 'FINALIZED', true, 2).selectedSource).toBe('snapshot')
```

- [ ] **Step 2: Confirm red.** Run `npm test -- tests/domain/download-policy.test.ts tests/db/download-policy.test.ts`; expect missing exports/columns.
- [ ] **Step 3: Implement policy and overview.** Add `db/migrations/022_album_download_public_settings.sql` with a separate `app_private.album_download_settings(target uuid)` security-definer function guarded by `app_private.album_readable(target)`; grant only EXECUTE to `app_runtime`. Do not change the existing function's return shape or grant customer direct `album_settings` SELECT. Check `selection_versions.cycle = albums.current_cycle` for the current snapshot. Include `selectedCount` from the authoritative live list or current snapshot so the Island does not mistake stale client hearts for the finalized set. Keep `/access` `Cache-Control: no-store`.

```sql
CREATE FUNCTION app_private.album_download_settings(target uuid)
RETURNS TABLE (download_enabled boolean, download_allow_single boolean,
  download_allow_selected boolean, download_allow_all boolean, download_available_when text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.download_enabled, s.download_allow_single, s.download_allow_selected,
    s.download_allow_all, s.download_available_when
  FROM public.album_settings s
  WHERE s.album_id = target AND app_private.album_readable(target)
$$;
REVOKE ALL ON FUNCTION app_private.album_download_settings(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.album_download_settings(uuid) TO app_runtime;
```

```ts
import type { AlbumStatus } from './album-status'

export type DownloadAction = 'single' | 'selected' | 'all'
export type DownloadSettings = { enabled: boolean; allowSingle: boolean; allowSelected: boolean;
  allowAll: boolean; availableWhen: 'anytime' | 'after_finalize' }
export type DownloadCapabilities = { canSingle: boolean; canSelected: boolean; canAll: boolean;
  reason: 'disabled' | 'waiting_for_finalize' | null; selectedSource: 'live' | 'snapshot' | null;
  selectedCount: number }
export function evaluateDownload(
  settings: DownloadSettings, status: AlbumStatus,
  hasCurrentCycleSnapshot: boolean, selectedCount: number,
): DownloadCapabilities {
  const active = status === 'PUBLISHED' || status === 'FINALIZED' || status === 'DELIVERED'
  const timingAllowed = settings.availableWhen === 'anytime' ||
    (status !== 'PUBLISHED' && hasCurrentCycleSnapshot)
  const allowed = settings.enabled && active && timingAllowed
  return {
    canSingle: allowed && settings.allowSingle,
    canSelected: allowed && settings.allowSelected,
    canAll: allowed && settings.allowAll,
    reason: !settings.enabled ? 'disabled' : !timingAllowed ? 'waiting_for_finalize' : null,
    selectedSource: allowed ? (status === 'PUBLISHED' ? 'live' : 'snapshot') : null,
    selectedCount: allowed ? selectedCount : 0,
  }
}
```

- [ ] **Step 4: Confirm green and commit.** Run the two focused Vitest files plus `npm run typecheck`; expect pass. Commit `git commit -m "feat: enforce current-cycle download policy"`.

### Task 3: Studio and guest admin settings with audit

**Files:** Create `server/albums/download-settings.ts`, `server/api/studio/[studioId]/albums/[albumId]/download.patch.ts`, `server/api/guest/albums/[albumId]/download.patch.ts`; modify `server/albums/manager.ts`, `server/albums/workspace.ts`, `app/components/album/AlbumWorkspace.vue`, `.env.example` only if a new server secret is introduced later; test `tests/db/download-settings.test.ts`, `tests/api/album-download-settings.test.ts`, `tests/e2e/album-workspace.spec.ts`, `tests/e2e/guest-album.spec.ts`.

**Interfaces:** Export `updateManagedDownloadSettings(pool, manager, albumId, settings): Promise<void>`; workspace adds `downloadSettings: DownloadSettings` and `canEditDownloadSettings: boolean`.

- [ ] **Step 1: Write failing tests.** Assert owner/manager and correct guest token can update; member/retoucher, wrong album, revoked token and expired album cannot. Verify one audit row with old/new settings in the same transaction and no row after a rejected mutation. Assert malformed/missing/extra JSON fields yield 400. E2E asserts settings appear in both admin workspaces and persist after reload.

```ts
expect(await readSettings(albumId)).toMatchObject({ enabled: true, allowAll: false })
expect(await readAudit(albumId)).toMatchObject({ action: 'album.download_settings.updated' })
await expect(updateManagedDownloadSettings(pool, member, albumId, enabled)).rejects.toMatchObject({ statusCode: 403 })
```

- [ ] **Step 2: Confirm red.** Run `npm test -- tests/db/download-settings.test.ts tests/api/album-download-settings.test.ts`; expect missing routes/function.
- [ ] **Step 3: Implement one mutation path.** Extend `ManagerAction` with `album.settings`; for guest admin use the existing `withManagedAlbum` token check, for members reuse `canPerform(role, 'album.settings')`. Validate all five booleans/enum exactly and reject unknown keys. Lock album row, update `album_settings`, insert `audit_logs` with `studio_id`, actor and old/new values in the same `withDatabaseContext` transaction. Return no secret. Add a compact accessible settings form to the existing `AlbumWorkspace` rather than creating a new route.

```ts
export async function updateManagedDownloadSettings(
  pool: ConnectionPool, manager: AlbumManager, albumId: string, settings: DownloadSettings,
): Promise<void>
```

- [ ] **Step 4: Confirm green and commit.** Run focused Vitest, the two E2E files in Chromium and `npm run typecheck`; expect pass. Commit `git commit -m "feat: manage album download rights"`.

### Task 4: Original Drive metadata and byte-safe naming

**Files:** Modify `server/photo-sources/google-drive.ts`; create `server/downloads/original.ts`, `server/downloads/names.ts`; test `tests/drive/google-drive.test.ts`, `tests/domain/download-names.test.ts`.

**Interfaces:** `GoogleDriveAdapter.getOriginalMetadata(fileId, resourceKey?)` returns `{ filename, mimeType, sizeBytes, md5Checksum?, canDownload? }`; `readPhoto` remains the byte stream reader. `resolveOriginal(pool, access, photoId, source)` looks up the catalog mapping with album RLS. `contentDisposition(filename)` and `uniqueZipNames(filenames)` sanitize only names, never bytes.

- [ ] **Step 1: Add failing tests.** Mock Drive `files.get?fields=id,name,mimeType,size,md5Checksum,capabilities(canDownload)` and assert resource-key header, `canDownload=false` rejection and no use of thumbnail/webContentLink. Cover `../`, backslash, control characters, Unicode and duplicate names in ZIP. Verify `filename*` encodes UTF-8 and ASCII fallback contains no path segment.

```ts
expect(contentDisposition('../Ảnh cưới.jpg')).toContain("filename*=UTF-8''%E1%BA%A2nh%20c%C6%B0%E1%BB%9Bi.jpg")
expect(uniqueZipNames(['a.jpg', 'a.jpg'])).toEqual(['a.jpg', 'a (2).jpg'])
```

- [ ] **Step 2: Confirm red.** Run `npm test -- tests/drive/google-drive.test.ts tests/domain/download-names.test.ts`; expect missing method/helpers.
- [ ] **Step 3: Implement metadata and resolver.** Use official Drive `files.get` metadata and existing `readPhoto` `alt=media`; require `image/*`, reject `canDownload===false`, parse size as nonnegative safe integer, propagate only safe error categories. Resolve `photoId` using `photos.id` **and** `photos.album_id` in `withDatabaseContext({albumId, scope, participantId})`. Use the current Drive name/MIME for headers; handle missing metadata without substituting preview bytes.

```ts
export interface OriginalMetadata { filename: string; mimeType: string; sizeBytes: number | null;
  md5Checksum?: string; canDownload?: boolean }
export function contentDisposition(filename: string): string
export function uniqueZipNames(filenames: string[]): string[]
```

- [ ] **Step 4: Confirm green and commit.** Run focused Vitest and typecheck; expect pass. Commit `git commit -m "feat: resolve original Drive images safely"`.

### Task 5: Single-photo download API and Focus action

**Files:** Create `server/api/album/[albumId]/photos/[photoId]/download.get.ts`; modify `app/pages/album/[albumId].vue`; test `tests/api/album-download.test.ts`, `tests/e2e/gallery-download.spec.ts`.

**Interfaces:** `GET /api/album/:albumId/photos/:photoId/download` enforces `single` and streams the original. Response has original MIME, safe disposition, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`.

- [ ] **Step 1: Add failing HTTP/browser tests.** Use a fixture with distinctive bytes and a preview fixture with different bytes. Assert disabled/selected-only policy yields 403, wrong-album photo 404, Drive failure 502/503, and enabled request SHA-256 matches original, with exact filename/MIME. In Playwright, Focus download appears only when `canSingle`, including finalized album.

```ts
expect(createHash('sha256').update(new Uint8Array(await response.arrayBuffer())).digest('hex'))
  .toBe(createHash('sha256').update(originalFixture).digest('hex'))
expect(response.headers.get('cache-control')).toBe('private, no-store')
```

- [ ] **Step 2: Confirm red.** Run `npm test -- tests/api/album-download.test.ts` and `npm run test:e2e -- --project=chromium tests/e2e/gallery-download.spec.ts`; expect route/button tests to fail.
- [ ] **Step 3: Implement the thin route and Focus UI.** Validate UUID param, call `requireAlbumAccess`, `requireCustomerDownload(...,'single')`, resolve original metadata/stream, set headers and return `new Response(original.body, { headers })`. In Focus, show an accessible “Tải ảnh gốc” action according to overview capability; desktop and initial mobile fallback use the direct browser download. Task 9 adds mobile prepare/share on top. Preserve existing heart/note and preview behavior.

```ts
return new Response(original.body, { headers: {
  'content-type': metadata.mimeType,
  'content-disposition': contentDisposition(metadata.filename),
  'cache-control': 'private, no-store',
  'x-content-type-options': 'nosniff',
} })
```

- [ ] **Step 4: Confirm green and commit.** Run focused Vitest/E2E, typecheck and build; expect pass. Commit `git commit -m "feat: download one original album photo"`.

### Task 6: Bounded plans and signed tickets

**Files:** Create `server/downloads/limits.ts`, `server/downloads/plan.ts`, `server/downloads/ticket.ts`; modify `.env.example`; test `tests/domain/download-plan.test.ts`, `tests/domain/download-ticket.test.ts`, `tests/db/download-plan.test.ts`.

**Interfaces:** `createDownloadPlan(pool, access, source, {kind, photoIds?})` returns ordered parts `{index, filename, count, byteLength, ticket, fileTickets}` plus unavailable file summaries. `signDownloadTicket`/`verifyDownloadTicket` use `NUXT_DOWNLOAD_TICKET_SECRET`; tickets expire after 10 minutes and include album, cycle, kind, ordered IDs, part index and issue/expiry timestamps.

- [ ] **Step 1: Add failing unit/database tests.** Cover exact byte/count boundaries; 0/duplicate/invalid/cross-album IDs; server-derived live selected list versus Studio snapshot; server-derived `all`; an oversized single file as `format:'file'`; missing sizes on old albums resolved by paginated Drive metadata listing; expired/tampered ticket. Verify no file body is fetched during planning. Use test values of 3 files × 5 bytes with a 10-byte part cap to make two parts deterministic.

```ts
expect(partitionFiles(files, { maxFiles: 2, maxBytes: 10 }).map(part => part.map(file => file.id)))
  .toEqual([['a', 'b'], ['c']])
expect(() => verifyDownloadTicket(`${ticket}x`, secret, now)).toThrow('Vé tải không hợp lệ')
expect(source.readPhoto).not.toHaveBeenCalled()
```

- [ ] **Step 2: Confirm red.** Run `npm test -- tests/domain/download-plan.test.ts tests/domain/download-ticket.test.ts tests/db/download-plan.test.ts`; expect missing exports.
- [ ] **Step 3: Implement pure partition/ticket logic, then DB resolution.** Start with conservative configurable initial caps (`maxFiles: 50`, `maxBytes: 96 * 1024 * 1024`, mobile share `maxFiles: 12`, `maxBytes: 48 * 1024 * 1024`) and revise only after benchmark in Task 10. Each entry must have a known size before partitioning; for old catalog rows, read Drive metadata/listing without writing from a customer RLS context. Use `crypto.createHmac('sha256', secret)` with constant-time signature comparison and a versioned compact payload. Reject payloads over the bounded part count/byte ceiling. Do not put the signed ticket in URL/query or logs. Plan response includes file tickets only when count/bytes fit mobile share caps. Add a separate random secret to `.env.example` without a real value.

```ts
export type DownloadPlanKind = 'selected' | 'basket' | 'all'
export type PlannedFile = { photoId: string; filename: string; mimeType: string; sizeBytes: number }
export type DownloadTicket = { v: 1; albumId: string; cycle: number; kind: DownloadPlanKind;
  format: 'file' | 'zip'; photoIds: string[]; part: number; issuedAt: number; expiresAt: number }
export const DOWNLOAD_LIMITS = { maxFiles: 50, maxBytes: 96 * 1024 * 1024,
  shareMaxFiles: 12, shareMaxBytes: 48 * 1024 * 1024 } as const
```

- [ ] **Step 4: Confirm green and commit.** Run focused tests and typecheck; expect pass. Commit `git commit -m "feat: plan bounded original downloads"`.

### Task 7: Lossless streaming ZIP writer

**Files:** Create `server/downloads/zip.ts`; test `tests/domain/download-zip.test.ts`. Do not add a ZIP dependency unless a measured problem and explicit approval justify it.

**Interfaces:** `createStoredZip(files, signal)` returns a Web `ReadableStream<Uint8Array>` with ZIP STORE entries and a valid central directory. Input file objects expose a stable ZIP name, size and `open(): Promise<ReadableStream<Uint8Array>>`. The writer detects size mismatch and aborts the whole part.

- [ ] **Step 1: Add failing byte tests.** Package JPEG-like, PNG-like and HEIC-like fixture bytes; parse local and central directory records in the test, extract every STORE entry and compare SHA-256 with its original. Assert Unicode/trailing duplicate names are unique, central-directory CRC32 equals entry CRC32, cancellation calls upstream stream cancellation, and a midstream Drive error rejects rather than returning a success-shaped ZIP. Test zero files as a 400-class validation error.

```ts
for (const entry of readStoreEntries(await collect(createStoredZip(fixtures, signal)))) {
  expect(sha256(entry.bytes)).toBe(sha256(fixturesByName.get(entry.name)!.bytes))
  expect(entry.compressionMethod).toBe(0)
}
```

- [ ] **Step 2: Confirm red.** Run `npm test -- tests/domain/download-zip.test.ts`; expect missing writer.
- [ ] **Step 3: Implement STORE stream with CRC32 and bounded memory.** Emit local headers, bytes, data descriptors, central directory and EOCD in order. For each source, read/forward one chunk at a time; track CRC32 and size; reject ZIP64 inputs by making plan parts < 4 GiB and entries < 4 GiB. Use UTF-8 filename flag, unique sanitized names from Task 4 and a readable mapping file only if duplicates were renamed. Cancel the active upstream reader on abort. Never call `arrayBuffer()` on the entire album or write a server temp file.

```ts
export type ZipInput = { name: string; sizeBytes: number;
  open: () => Promise<ReadableStream<Uint8Array>> }
export function createStoredZip(files: ZipInput[], signal: AbortSignal): ReadableStream<Uint8Array>
```

- [ ] **Step 4: Confirm green and commit.** Run ZIP tests and typecheck; expect pass. Commit `git commit -m "feat: stream lossless ZIP parts"`.

### Task 8: Batch endpoints, reauthorization and rate limits

**Files:** Create `server/api/album/[albumId]/download/plan.post.ts`, `server/api/album/[albumId]/download/file.post.ts`, `server/api/album/[albumId]/download/zip.post.ts`, `server/downloads/rate-limit.ts`, `db/migrations/023_album_download_rate_limit.sql`; test `tests/api/album-download.test.ts`, `tests/db/download-policy.test.ts`.

**Interfaces:** `POST /download/plan` accepts `{kind:'selected'|'basket'|'all', photoIds?: string[]}`. `POST /download/file` accepts `{ticket:string, photoId?:string}` as JSON for mobile `fetch` or form-urlencoded for browser-managed oversized file save. `POST /download/zip` accepts JSON `{ticket:string}`. Every request requires the album cookie/token and repeats policy/status/cycle/ID checks. ZIP route returns stream with safe attachment name and no-store headers.

- [ ] **Step 1: Add failing boundary tests.** Append migration 023 to the migration-list test. Cover malformed/extra body keys, 10,001 IDs, duplicate IDs, a ticket from another album, expired ticket, changed permission after plan, reopened cycle, revoked token, source 403/404/429, no Drive fallback, rate-limit 429 with `Retry-After`, missing secret 503 and the file route's form-urlencoded path. For each denied request assert `source.readPhoto` was never called. Verify `GET /image` behavior remains unchanged.

```ts
await expect(zipHandler({ body: { ticket: oldCycleTicket } })).rejects.toMatchObject({ statusCode: 403 })
expect(source.readPhoto).not.toHaveBeenCalled()
expect(response.headers.get('cache-control')).toBe('private, no-store')
```

- [ ] **Step 2: Confirm red.** Run `npm test -- tests/api/album-download.test.ts tests/db/download-policy.test.ts`; expect missing routes/gates.
- [ ] **Step 3: Implement thin routes.** Authenticate with `requireAlbumAccess`, validate JSON and `albumIdParam`, call the plan/ticket/policy services, and map known Drive errors to safe 404/429/502/503 responses. Add migration 023 with `album_download_rate_windows(album_id, address_hash, window_start, attempts)` and a security-definer `app_private.consume_album_download_attempt` guarded by `app_private.album_readable`. Hash the client address with the server secret as `server/albums/guest-rate-limit.ts` does; consume at most 600 plan/stream attempts per album/address/hour, return `Retry-After` on 429. Use a DB counter, not instance memory. On ZIP, check every photo mapping and policy before sending the first byte, then stream the Task 7 writer. On client disconnect, abort Drive reads. Never cache a private stream on a public CDN.

```sql
CREATE TABLE album_download_rate_windows (
  album_id uuid NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  address_hash text NOT NULL,
  window_start timestamptz NOT NULL,
  attempts integer NOT NULL,
  PRIMARY KEY (album_id, address_hash, window_start)
);
REVOKE ALL ON album_download_rate_windows FROM PUBLIC;
CREATE INDEX album_download_rate_windows_age_idx ON album_download_rate_windows (window_start);
CREATE FUNCTION app_private.consume_album_download_attempt(target uuid, supplied_hash text)
RETURNS TABLE (allowed boolean, retry_after_seconds integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE current_window timestamptz := date_trunc('hour', now());
DECLARE current_attempts integer;
BEGIN
  IF NOT app_private.album_readable(target) OR supplied_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid download attempt' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.album_download_rate_windows WHERE window_start < now() - interval '2 days';
  INSERT INTO public.album_download_rate_windows (album_id, address_hash, window_start, attempts)
  VALUES (target, supplied_hash, current_window, 1)
  ON CONFLICT (album_id, address_hash, window_start)
  DO UPDATE SET attempts = public.album_download_rate_windows.attempts + 1
  RETURNING attempts INTO current_attempts;
  RETURN QUERY SELECT current_attempts <= 600,
    greatest(1, ceil(extract(epoch FROM current_window + interval '1 hour' - now()))::integer);
END
$$;
REVOKE ALL ON FUNCTION app_private.consume_album_download_attempt(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.consume_album_download_attempt(uuid, text) TO app_runtime;
```

```ts
const access = await requireAlbumAccess(event)
const body = await readBody<unknown>(event)
const request = parseDownloadRequest(body)
return studioApi(() => createDownloadPlan(getAppPool(), access, requireVerifiedDriveSource(), request))
```

- [ ] **Step 4: Confirm green and commit.** Run focused Vitest, typecheck and build; expect pass. Commit `git commit -m "feat: serve authorized download plans and ZIPs"`.

### Task 9: Selection Island, basket and plan UI

**Files:** Create `app/components/album/SelectionIsland.vue`, `app/components/album/DownloadSheet.vue`, `app/composables/useAlbumDownload.ts`; modify `app/pages/album/[albumId].vue`; test `tests/e2e/gallery-download.spec.ts`, `tests/e2e/gallery.spec.ts`.

**Interfaces:** `useAlbumDownload(apiRoot, capabilities)` initially owns ephemeral `Set<photoId>` and plan state. `SelectionIsland` receives heart/finalized counts, capability and actions via props/emits. `DownloadSheet` receives modes, basket IDs, loading/error/plan and emits select/clear/plan/close. The page remains owner of route data and saved heart queue.

- [ ] **Step 1: Add failing Playwright cases.** On mobile and desktop, check no Island CTA when disabled or single-only; Island sheet with `selected`/`all`; basket checkbox across Grid/List/Focus without a selection PUT; selected plan waits for a pending heart save; after finalize label/count use Studio snapshot; reopening disables `after_finalize`. Cover Escape/focus return, touch targets, empty basket, “Hủy chọn ảnh tải” and refresh-clears-basket copy. The plan summary shows numbered parts and unavailable files without downloading content.

```ts
await page.getByRole('button', { name: 'Tải xuống' }).click()
await page.getByRole('button', { name: 'Chọn ảnh khác để tải' }).click()
await page.getByRole('checkbox', { name: /Ảnh A.JPG/ }).check()
expect(selectionPutRequests).toHaveLength(0)
await expect(page.getByRole('button', { name: 'Chuẩn bị tải 1 ảnh' })).toBeEnabled()
```

- [ ] **Step 2: Confirm red.** Run `npm run test:e2e -- --project=chromium tests/e2e/gallery-download.spec.ts`; expect new sheet/basket assertions to fail.
- [ ] **Step 3: Implement Island, sheet and plan preparation.** Preserve heart/note code and preview pipeline. Island appears while choosing or when finalized downloads are available; after finalization use `selectedCount` from the server capability. The sheet has a labelled dialog, focus containment/restoration, safe-area padding and distinct “Hủy chọn ảnh tải”/close controls. Store basket IDs independently of virtualized mounted photos. `selected` waits for `selectionQueue`, then server derives the saved list; `all` never loads the whole grid in browser. Display plan parts, byte estimates, file errors and the next action; do not transfer binary yet.

```ts
const basket = ref<Set<string>>(new Set())
function toggleBasket(photoId: string) {
  const next = new Set(basket.value)
  if (next.has(photoId)) next.delete(photoId)
  else next.add(photoId)
  basket.value = next
}
function clearBasket() { basket.value = new Set() }
```

- [ ] **Step 4: Confirm green and commit.** Run both E2E files and typecheck; expect pass. Inspect 390 px/1440 px, long filenames and overlay focus. Commit `git commit -m "feat: add download basket to selection island"`.

### Task 10: Mobile share and desktop ZIP transfer UI

**Files:** Modify `app/composables/useAlbumDownload.ts`, `app/components/album/DownloadSheet.vue`, `app/pages/album/[albumId].vue`; test `tests/e2e/gallery-download.spec.ts`.

**Interfaces:** Extend `useAlbumDownload` with `prepareFiles(fileTickets: string[])`, `sharePrepared()`, `downloadPart(ticket: string)`, `cancelTransfer()` and per-part progress. Reuse Task 9 basket/plan contract; do not add shared global state.

- [ ] **Step 1: Add failing browser tests.** Stub `navigator.canShare/share` and assert file objects are original bytes and `share` happens only on a second click. Simulate unsupported webview and oversized files to see Safari/Chrome/ZIP/direct-file fallback, not N automatic downloads or “Đã lưu vào Photos”. Test ZIP part progress, manual retry, abort that keeps the basket, a policy 403 that clears it, and object URL cleanup.

```ts
await page.getByRole('button', { name: 'Chuẩn bị ảnh gốc' }).click()
await expect(page.getByRole('button', { name: 'Mở bảng lưu/chia sẻ' })).toBeEnabled()
await page.getByRole('button', { name: 'Mở bảng lưu/chia sẻ' }).click()
expect(await page.evaluate(() => (window as any).__sharedFiles[0].name)).toBe('Ảnh A.JPG')
```

- [ ] **Step 2: Confirm red.** Run `npm run test:e2e -- --project=chromium tests/e2e/gallery-download.spec.ts`; expect transfer assertions to fail.
- [ ] **Step 3: Implement transfer methods.** Prepare mobile `File` objects only within Task 6 caps; expose a separate share button so `navigator.share({files})` is called immediately in that click handler after `navigator.canShare({files})`. Handle resolved, rejected and cancelled share without asserting Photos save. For ZIP, read bounded response streams with `AbortController`, write to File System Access API when supported or bounded Blob otherwise, save each numbered part, show completed/failed counts and manual retry. Oversized single files use a browser-managed form POST with the signed ticket. “Dừng tải” aborts the current fetch but leaves basket; a 403 clears basket/tickets and refreshes capability. Revoke object URLs and release buffers.

```ts
const transferError = ref('')
function sharePrepared(files: File[]): boolean {
  if (!navigator.canShare?.({ files })) return false
  void navigator.share({ files }).catch(error => {
    if (error instanceof DOMException && error.name === 'AbortError') return
    transferError.value = 'Không mở được bảng chia sẻ. Hãy tải file gốc hoặc ZIP.'
  })
  return true
}
```

- [ ] **Step 4: Confirm green and commit.** Run gallery download E2E, typecheck, regular tests and build; expect pass. Commit `git commit -m "feat: share originals and save bounded ZIPs"`.

### Task 11: Integration, scale measurement and release documentation

**Files:** Create `tests/live/drive-download.ts`, `scripts/measure-drive-downloads.ts`; modify `package.json`, `README.md`, `docs/implementation-progress.md`, `docs/studio-user-guide.md`, `docs/vercel-deployment.md` as needed for commands/env/limits; test existing `tests/live/drive-album-http.ts` remains compatible.

**Interfaces:** `npm run test:drive-download` is opt-in, requires an explicitly configured public test folder and test database; `npm run measure:drive-downloads` reports counts, duration, memory/bytes, quota errors and part sizes without IDs or tokens.

- [ ] **Step 1: Add the opt-in fixture checks.** Compare downloaded single and every ZIP entry against the fixture Drive bytes using SHA-256; cover JPEG/PNG/HEIC, Unicode/duplicate names, MIME/size/EXIF, resource key, deleted/restricted file and 429. Avoid production URLs and secrets. Report skipped device/scale checks explicitly rather than silently passing.

```ts
assert.equal(sha256(downloadedSingle), sha256(driveOriginal))
for (const entry of zipEntries) assert.equal(sha256(entry.bytes), sha256(originalByName.get(entry.originalName)!))
```

- [ ] **Step 2: Measure and set final caps.** Run with 1, 10, 100, 1,000 and 3,000 test images and a large single file; capture server memory, stream duration, Drive API quota/errors, Vercel Preview behavior, 4G preparation time and gallery LCP before/after. Adjust `DOWNLOAD_LIMITS` from Task 6 only when measured data supports the change. Record configured Vercel function duration and the chosen safe limits in docs.
- [ ] **Step 3: Complete browser QA.** Check iOS Safari, Android Chrome, Zalo/Messenger webviews and Chrome/Edge/Safari desktop on real devices; record whether native save, share, Files or ZIP fallback appeared. Do not report Photos success from a resolved Share API Promise. Verify no automatic multi-download popup and no cross-tenant access.
- [ ] **Step 4: Run release gates and commit.** Run `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e -- --project=chromium`, `npm run test:drive-download` and the measurement script on the test branch/Preview. Require each to pass or record a concrete blocker; do not call the feature released with an unverified Drive/device gate. Commit docs/scripts with `git commit -m "test: verify original album downloads across Drive and browsers"`.

## Plan self-review and execution order

Tasks 1–2 establish persisted policy, 3 exposes management, 4–5 deliver a working single-file path, 6–8 deliver bounded authorized bulk transfers, 9 adds basket/planning UI, 10 adds transfer UX, and 11 closes real-Drive/device/scale gates. Each task ends in a testable commit. The existing `/image` preview contract, hearts, notes, snapshots and Local File Filter remain intact. Before each task, inspect current code and adapt only if it changed since this plan was written; keep the documented interfaces and acceptance rules.
