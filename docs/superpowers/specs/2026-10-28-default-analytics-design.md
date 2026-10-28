# Default analytics and gallery opens — design

Date: 2026-10-28. Approved scope: GA4 by default worldwide, with no consent banner, for every app route and the existing ten workflow events; count valid gallery opens per studio. Keep Google Enhanced Measurement disabled.

## Behavior

- Production keeps `NUXT_PUBLIC_GA4_ENABLED=true` and `G-2GD5P03B7S`. The client plugin loads `gtag.js` after app mount without reading the former local consent choice. It sends one sanitized page view per path and only the existing allowlisted workflow events. Query strings, fragments, capability tokens, email, filenames and notes never enter GA4 payloads. Ads storage and personalization remain denied.
- Remove the consent banner, settings controls, local consent state and consent cookie. Old `accepted`/`rejected` local storage values are ignored. Local/Preview GA4 stays off by default through the existing environment gate.
- `NUXT_PUBLIC_STUDIO_GALLERY_ANALYTICS_ENABLED=true` in Production enables a separate server counter. The client sends an empty POST once after an authorized customer gallery successfully loads. The server checks album access and keeps its per-album rate limit; it does not require a consent cookie or GA4 to be enabled. Failed access/photos and repeated render/query changes do not increment the count. A blocked request or JavaScript-disabled browser may be missing from the count, so it is not a unique-visitor metric.
- `/admin/analytics` describes GA4 page views and events without consent wording. `/studio/analytics` describes counted successful gallery opens without consent wording. Historical opens before this release cannot be backfilled.
- Fix Nitro runtime config handling for the private GA4 service account: Nitro may parse `NUXT_GA4_SERVICE_ACCOUNT_JSON` into an object. Token generation accepts a validated string or object, caches by normalized credential content, and never logs the private key.

## Verification and release

- Unit tests cover token signing with parsed object credentials and strict invalid-key rejection. Browser tests cover automatic safe GA4 collection, no banner, and one gallery POST after successful load. Existing database/RLS tests remain the gate for gallery counts and owner access.
- Run focused tests, full Vitest, typecheck, build, then deploy Production with the gallery flag enabled. Smoke the public app and signed-in admin/studio pages. Do not create production album fixtures solely for QA.
- The public privacy page at `https://www.zenocorp.vn/privacy` still contains placeholder text; its update is owned by the user outside this repository. This design records the requested collection behavior and does not assert legal compliance.
