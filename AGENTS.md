# Agent Rules

## Stack

Nuxt 4.6.1; Vue 3.5.44; Tailwind CSS 4.3.3; Pinia 4.0.3 with `@pinia/nuxt` 1.0.2; Vitest 5.0.4; npm (`package-lock.json`); single-package repository with no workspace or Turborepo. `@nuxt/ui`, VueUse, and Vue Test Utils are not installed.

## Project overview

Zeno Studio is a mobile-first photo-workflow app for creating studio albums, collecting customer selections and retouching notes, reviewing results, and sharing delivery links. The frontend is Nuxt 4/Vue; server routes and domain operations run through Nitro; PostgreSQL is hosted on Neon with tenant isolation/RLS; studio authentication uses Better Auth; deployments use Vercel.

Read `README.md`, `docs/photo-workflow-platform-v1-spec.md`, and `docs/implementation-progress.md` when a task depends on product scope, current feature status, or deployment/database setup. Keep unimplemented product requirements distinct from working behavior.

## Repository map

### Current structure

- `app/pages/`: file-based Nuxt routes. Pages currently orchestrate route data/actions and render much of their screen markup directly.
- `app/assets/css/main.css`: Tailwind CSS v4 import and small global styles; no complete design-token system exists yet.
- `app/lib/`: app-side integrations; currently includes the Better Auth client.
- `server/api/`: Nuxt file-based HTTP handlers grouped by studio, album, and auth.
- `server/`: server-side domain operations, database context/pool, auth/access helpers, photo-source adapters, and utilities.
- `shared/domain/`: pure domain rules shared across runtime boundaries.
- `tests/domain/`, `tests/db/`, `tests/e2e/`, `tests/live/`: domain, database, browser, and opt-in live integration checks.
- `.agents/`: the only source for reusable project instructions, prompts, and skills.
- There are currently no `app/components/`, `app/composables/`, or `app/stores/` directories. Create them only when a concrete feature needs them.

### Organization for new work

- Keep `app/pages/` focused on route-level orchestration and screen composition. Keep one-off UI local; extract components when reuse, independent interaction/state, or complexity makes the boundary useful.
- When needed, put generic, accessible primitives in `app/components/ui/`; put reusable product-specific components in `app/components/album/` or `app/components/studio/`.
- Use `app/composables/` for reusable client-side behavior with meaningful state or side effects, not as a default wrapper for every function.
- Use Pinia stores only for state shared across routes or features. Keep local view state in the page/component.
- Keep pure, cross-runtime business rules in `shared/domain/`; keep database and server orchestration in `server/`.

## Conventions

### Vue and UI

- Use Vue 3 Composition API with `<script setup lang="ts">`, typed props/emits, and Nuxt file-based routing.
- For non-trivial UI changes, sketch component responsibilities and data contracts before implementation. Keep primitive APIs small; prefer semantic native HTML before adding abstraction or dependencies.
- Use props down/events up. Use `v-model` only when two-way state is an intentional component contract.
- Make UI accessible by default: accessible names, keyboard operation, visible focus, correct disabled/busy states, clear validation/errors, and suitable loading/empty/success feedback.
- Design mobile-first for the customer gallery and studio workflows; check narrow and wide layouts, touch targets, long filenames, and overlays.
- Preserve the existing muted background, green brand, typography, rounded surfaces, and spacing. Avoid proliferating color literals; add shared CSS/Tailwind tokens in `app/assets/css/main.css` only when repeated use or a concrete UI change justifies them.
- Follow the existing Tailwind CSS v4 setup (`@import "tailwindcss"` and `@tailwindcss/vite`). Verify version-specific syntax; do not copy Tailwind v3 instructions blindly.
- Do not split every multi-section page into a fixed number of components solely because a generic skill recommends it. Follow user scope and extract when reuse or complexity improves clarity; do not bulk-refactor unrelated pages.
- Preserve established rendering/data-fetching behavior unless the task requires a change. Prefer `useFetch`/`useAsyncData` for SSR-hydrated route reads and `$fetch` for user-triggered writes; do not mechanically rewrite existing client-mounted flows.

Detailed UI and component instructions: `.agents/instructions/ui.instructions.md`.

### Server and API

- Use Nuxt file-based handlers under `server/api/` with the matching HTTP method suffix. Keep handlers thin: validate, authenticate/authorize, call domain operations, and shape the response.
- Validate route params, query values, and request bodies at the boundary. Use explicit HTTP errors/statuses; do not silently default invalid input, return success-shaped fallbacks, or leak internal errors.
- Reuse established helpers such as `requireStudioUser`, `requireAlbumAccess`, `studioApi`, `studioIdParam`, and `albumIdParam` where applicable.
- Use parameterized SQL. Run tenant/participant database work through `withDatabaseContext` with the correct identity and scope in the same transaction as the queries; preserve RLS.
- Keep credentials, tokens, database URLs, and internal SQL/error details out of responses and logs. Do not publicly cache private album data or capability-token responses.
- Keep reusable business operations and transactions in the existing server domain modules rather than duplicating them in route handlers.

Detailed server/API instructions: `.agents/instructions/server-api.instructions.md`.

### Errors, tests, and changes

- Surface errors explicitly using repository conventions. Do not broadly catch and hide failures.
- Add or update tests for changed behavior: domain rules in `tests/domain/`, database/RLS behavior in `tests/db/`, and HTTP/browser behavior in the relevant integration or E2E tests.
- The regular Vitest suite covers domain/database tests. Playwright is the E2E runner. No Vue component-test setup is installed; do not imply otherwise or add dependencies without approval.
- Avoid running live Neon checks against production. Use the dedicated test database/branch and review the scripts/docs before any live operation.
- Preserve secrets in environment configuration; never add secrets, real credentials, or private URLs to code, tests, or docs.

## Commands

- Install from the lockfile: `npm ci`
- Development: `npm run dev`
- Build: `npm run build`
- Unit/domain/database tests: `npm test`
- Typecheck: `npm run typecheck`
- Browser E2E: `npm run test:e2e -- --project=chromium` (requires Playwright Chromium installation)
- Lint: no lint script is defined.

## Skills

All skills live in the real `.agents/skills/` directory. Use the skill that matches the task; skills supplement rather than override this repository guide, the product spec, or the user's requested scope.

| Task | Skill |
|---|---|
| Nuxt routes, server rendering, data fetching, and framework conventions | `nuxt` |
| Nuxt 4 hydration, SSR-safe fetching, route rules, and performance | `nuxt4-patterns` |
| Vue components, reactivity, and Composition API | `vue` and `vue-best-practices` |
| Cross-route shared state and stores | `pinia` |
| Tailwind CSS v4 utilities, variants, and configuration | `tailwind-4-docs` |
| Requested UI/accessibility/design review | `web-design-guidelines` |

Version notes:

- The installed `nuxt` skill says it is based on Nuxt 5.x. This repository uses Nuxt 4.6.1; confirm version-specific APIs against `nuxt4-patterns` and the installed package before applying them.
- `tailwind-4-docs` can download a local snapshot of upstream Tailwind documentation that is source-available but not open-source. Do not run its snapshot initializer/refresh script unless the user explicitly accepts the license and download.
- `web-design-guidelines` fetches current public Vercel Web Interface Guidelines when conducting a review; use it for relevant UI/a11y review work, not unrelated tasks.
- `@nuxt/ui`, VueUse, and Vue Test Utils are not installed. Do not use skills as evidence that a corresponding package exists or add a UI/runtime dependency without user approval.

## Do / Don't

- Do read relevant product and implementation docs before changing business behavior.
- Do make focused changes, preserve existing contracts, and run the smallest relevant validation plus the regular tests/typecheck when behavior changes.
- Do update the real files under `.agents/`; consumer directories in `.github/`, `.codex/`, and `.claude/` are symlinks.
- Do distinguish current implementation from proposed/future architecture in docs and agent guidance.
- Don't edit customization through a symlink or duplicate full customization content outside `.agents/`.
- Don't change app source, adopt a component library, or add runtime dependencies while doing agent-customization-only work.
- Don't impose generic skill patterns when they conflict with the project, product spec, or user's scope.
