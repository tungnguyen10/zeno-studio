# GA4 integration design

Date: 2026-10-27
Status: approved for implementation planning

## Goal and scope

Measure page views across Zeno Studio and the ten core workflow events already named in `docs/photo-workflow-platform-v1-spec.md`, using GA4 web stream `G-2GD5P03B7S`. Measurement runs only in Production and only after the visitor explicitly accepts analytics through an in-app banner. Local development and Vercel Preview stay disabled by default. This integration measures product usage in GA4; it does not implement the separate in-product studio analytics, `analytics_events`, daily aggregation, or North Star work listed as T48–T49 in `docs/implementation-progress.md`.

## Chosen approach

Use the official `gtag.js` script through a small Nuxt client plugin. Do not add a runtime GA module or Google Tag Manager. This keeps consent, route sanitization, and event payloads in code that can be reviewed and tested. The supplied measurement ID is public configuration, not a secret. A public runtime flag enables the plugin only for Production; the ID is configured there as well. A missing flag or ID disables measurement.

## Units and data flow

1. **Consent state and UI.** A small client-side consent state holds `unknown`, `accepted`, or `rejected` and persists a versioned choice in local storage. A responsive, accessible banner offers accept and reject with equal prominence and links to the privacy policy. A footer control reopens the choice. The app remains fully usable with either choice. When storage is unavailable, the choice works for the current page but is not assumed on the next load. An unknown or rejected choice never loads the Google script. Accepting starts measurement on the current screen; earlier screens and actions are not backfilled. Revoking immediately stops app-originated analytics calls, updates Google consent to denied if the tag is present, and reloads the page. The next load starts rejected if persistence succeeded, or unknown if it did not; neither state loads the tag. The policy at `https://www.zenocorp.vn/privacy` must disclose this use before the Production switch is enabled.
2. **Analytics client.** `app/plugins/analytics.client.ts` owns loading the script once, initializing `gtag`, registering the route hook, and reacting to consent changes. A small typed helper exposes only `trackPageView` and the approved workflow events. It never runs during SSR. Script load failure, blockers, or unavailable storage must not break the product; no retry loop or success-shaped fallback event is needed.
3. **Safe page metadata.** A pure formatter maps the current Nuxt route to an allowlisted page name and absolute `page_location`. It strips every query and fragment and replaces dynamic IDs with route templates (for example, `/album/:albumId` and `/studio/albums/:albumId`). Unknown routes use a generic `/other` value. It also supplies a generic `page_title` and a sanitized `page_referrer`: same-origin referrers use safe route patterns; external referrers use origin only. Raw `location.href`, `document.title`, album title, studio/album/photo IDs, token, email, note text, filename, and Drive URL cannot be event fields. No GA `user_id` is set. An allowlisted event schema permits only coarse enum values and numeric counts.
4. **Page views.** Initialize GA with `send_page_view: false` and safe page metadata before the remote script can process queued commands. Disable **Page changes based on browser history events** in the GA4 web stream's Enhanced Measurement settings; `send_page_view: false` alone does not disable those history events. Disable other optional automatic collection that could capture outbound URLs, form fields, or search terms. After consent, send one manual `page_view` for the current route. For later Nuxt navigations, update safe page metadata and send one manual `page_view` after successful route resolution. Count changes to a different album screen even when its reported route template is the same; ignore query-only changes and duplicate route notifications. Keep the previous safe page value as the virtual referrer. No page view is sent for a failed or cancelled navigation.

## Workflow event contract

All events require accepted consent and Production enablement. Fire from the UI owner after an operation is confirmed, not from a button click or a server request made by another participant. Repeated polling and initial persisted state do not fire events.

| Event | Confirmed trigger | Safe optional parameters |
| --- | --- | --- |
| `album_created` | Guest quick-create or studio draft create succeeds | `creation_flow`: `guest` or `studio` |
| `album_published` | Studio publish succeeds; guest quick-create also succeeds because it publishes immediately | `creation_flow`: `guest` or `studio` |
| `album_opened` | Customer gallery access succeeds and the first photo page/empty state is ready | none |
| `gallery_view_changed` | User actively chooses a different gallery layout | `layout`: one of the four defined layout keys; `surface`: `customer` or `studio` |
| `photo_selected` | Customer selection API confirms a newly selected photo | `selected_count`: nonnegative number if the confirmed response provides it |
| `photo_unselected` | Customer selection API confirms removal | `selected_count`: nonnegative number if available |
| `photo_note_saved` | Note API returns `saved`, not conflict | none |
| `selection_finalized` | Studio or guest-admin finalize API succeeds | `surface`: `studio` or `guest_admin` |
| `selection_reopened` | Reopen API succeeds | `surface`: `studio` or `guest_admin` |
| `file_match_completed` | Local file scan and matching reach the preview phase | Numeric matched, missing, and ambiguous counts only |

The guest quick-create flow emits both `album_created` and `album_published` once on the same successful response. Retry, conflict, validation error, cancelled file scan, and failed API calls emit no success event. The `file_match_completed` event represents matching preview, not completion of local copying. Adding download-specific events or richer funnels is outside this change.

## Error handling and privacy controls

- A missing Production setting, absent consent, blocked script, or network failure leaves the app functional. Do not log tokens, event payloads, or raw URLs while diagnosing analytics.
- The remote tag must not be requested before acceptance. The analytics helper is a no-op unless enabled and accepted.
- Configure the GA4 stream to turn off automatic History page views and optional Enhanced Measurement events that can observe sensitive URLs or forms. Configure GA4 data redaction as a secondary safeguard for token-bearing query parameters; application-side allowlisting remains the primary guard.
- No Google tag is injected into SSR HTML. Consent UI should be accessible by keyboard and screen reader, with visible focus and no blocking of the main workflow.

## Verification and release

1. Unit-test the route formatter, event schema, consent transitions, and page-view deduplication. Include token-bearing customer links, guest-admin fragments, `next` and `studio` query values, dynamic route IDs, same-route different-album navigation, and unknown routes.
2. In Playwright, intercept Google hosts to prove that unknown/rejected consent and non-Production builds make no request; acceptance requests the tag once; initial and client-side route transitions yield one sanitized page view each; revocation stops later collection; successful actions yield the expected event; failures and conflicts do not.
3. Run `npm run typecheck`, `npm test`, the relevant Chromium E2E suite, and `npm run build`. Check the banner at narrow and wide widths.
4. Before enabling Production, update the privacy disclosure and GA4 stream settings. After release, inspect browser network payloads and GA4 DebugView for sanitized `page_location`/`page_referrer`, event names, absence of duplicate page views, and no data before consent. If the external tag is blocked, the product still passes its own workflows.

## References

- [Google Analytics: Measure pageviews](https://developers.google.com/analytics/devguides/collection/ga4/views)
- [Google Analytics: Measure single-page applications](https://developers.google.com/analytics/devguides/collection/ga4/single-page-applications)
- [Google Analytics: Avoid sending personally identifiable information](https://support.google.com/analytics/answer/6366371)
- [Nuxt 4 plugins](https://nuxt.com/docs/4.x/directory-structure/app/plugins)
