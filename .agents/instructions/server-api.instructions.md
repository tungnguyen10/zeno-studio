---
description: "Use when creating or changing Nuxt server routes, API handlers, database access, authentication, authorization, or shared server behavior."
applyTo: "server/**/*.ts"
---

# Server and API Guidance

## Route boundaries

- Follow Nuxt's file-based API routing under `server/api/`; use the HTTP method suffix (`.get.ts`, `.post.ts`, `.put.ts`, `.patch.ts`, `.delete.ts`) that matches the operation.
- Keep `defineEventHandler` functions thin: parse and validate the request, authenticate/authorize, call an existing domain operation, and shape the response. Put reusable business rules and transactions in the relevant `server/<domain>/` module.
- Validate route params, query values, and request bodies at the boundary. Return explicit `createError` status codes/messages for invalid input and denied access; do not silently default invalid values, return success-shaped fallbacks, or expose internal exception details.
- Use `studioApi` and the existing `StudioOperationError` mapping when appropriate. Preserve established response shapes and HTTP semantics unless the task explicitly changes them.

## Authentication and data access

- Authenticate and authorize before accessing protected data. Studio endpoints use the existing studio-session helpers such as `requireStudioUser`; customer album endpoints use `requireAlbumAccess` and its capability-token scope. Do not treat an album token as a studio session or vice versa.
- Validate IDs with the existing helpers such as `studioIdParam` and `albumIdParam` where applicable.
- Use `getAppPool()` for runtime database access and parameterized SQL values; never interpolate user-controlled values into SQL.
- Run tenant- or participant-scoped work through `withDatabaseContext` using the correct studio/album/user/participant identity and scope, in the same transaction as its queries. Preserve RLS boundaries and connection cleanup.
- Prefer existing domain services, access helpers, and transaction patterns over direct route-level SQL or duplicated checks. Do not bypass domain authorization by trusting a request body or URL parameter.
- Mark sensitive or capability-token responses `cache-control: no-store` when the existing endpoint contract requires it; never cache secrets or private album data publicly.

## Errors and tests

- Surface expected errors with the repository's explicit status/message conventions. Re-throw unexpected failures for normal server error handling; do not broadly catch and hide failures.
- Keep credentials, tokens, database URLs, and internal SQL/error details out of responses and logs.
- Add or update focused tests for changed domain rules in `tests/domain/`, database/RLS behavior in `tests/db/`, and HTTP behavior in the relevant integration or Playwright tests. Preserve the distinction between adapter-mocked tests and live Neon tests.
- Run `npm test` and `npm run typecheck` for server behavior changes; run the relevant integration/E2E checks when the HTTP boundary or authorization flow changes.
