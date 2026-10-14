# Project Agent Guidance and Skills

## Status

Design proposal for review. No project source code, dependencies, or existing skills are changed by this proposal.

## Goal

Give Copilot, Codex, and Claude Code a consistent, evidence-based guide to this Nuxt 4 project: how to use the installed skills, build Vue components, structure the UI and reusable primitives, add server API routes, and validate changes. Keep `.agents/` as the only source of agent customization.

## Findings

- The project uses Nuxt 4.6.1, Vue 3.5.44, Tailwind CSS 4.3.3, Pinia 4.0.3, and Vitest 5.0.4.
- `@nuxt/ui`, VueUse, and Vue Test Utils are not dependencies.
- The installed `nuxt` skill describes itself as based on Nuxt 5.x, while the repository uses Nuxt 4.
- There is no `app/components/`, `app/composables/`, or `app/stores/` directory. Pages currently contain page-specific data loading, actions, and Tailwind markup. Several pages share repeated visual patterns; the public album page is 251 lines.
- Tailwind is imported in `app/assets/css/main.css`. Existing pages primarily use Tailwind utilities and inline brand color values; a centralized token system and complete accessibility review are not yet established.
- Server routes use Nuxt file-based API handlers. Existing helpers include `requireStudioUser`, `requireAlbumAccess`, `studioApi`, `albumIdParam`, and `withDatabaseContext`. Database context establishes RLS scope in a transaction.
- Tests currently cover domain/database behavior and Playwright E2E; no Vue component tests were found.

## Proposed files

1. Expand root `AGENTS.md` as the canonical, cross-agent project guide:
   - Add folder responsibilities, skill selection and usage guidance, command/test expectations, and links to scoped instructions.
   - Describe the current architecture as observed, distinguishing conventions from future guidance.
2. Add `.agents/instructions/ui.instructions.md`, scoped to Vue SFC and stylesheet files under `app/`:
   - Page versus reusable component responsibilities.
   - Suggested locations for shared primitives (`app/components/ui/`) and product/domain components (`app/components/album/`, `app/components/studio/`), created only when reuse or complexity justifies extraction.
   - Composition API + `<script setup lang="ts">`, typed props/emits, accessible semantic HTML, loading/error/empty states, mobile-first responsive layout, and existing Tailwind v4 setup.
   - Keep business rules out of presentational components; put reusable client behavior in `app/composables/` only when needed, and pure cross-runtime rules in `shared/domain/`.
   - Do not add `@nuxt/ui`, another component library, VueUse, or design tokens/package dependencies without a concrete need and approval.
3. Add `.agents/instructions/server-api.instructions.md`, scoped to `server/api/**/*.ts` and `server/**/*.ts`:
   - Follow Nuxt file-based handlers and HTTP method suffixes.
   - Validate route params, query, and request bodies at the boundary; use explicit status/error behavior and avoid exposing internal errors.
   - Authenticate and authorize before data access; distinguish studio session from album capability-token access.
   - Use `withDatabaseContext` for tenant/participant DB work, parameterized SQL, and existing domain services/helpers; do not put business logic or direct SQL in route handlers when a domain service is appropriate.
   - Preserve no-store behavior for sensitive responses and add focused tests for domain behavior and API/database flows.
4. Update the short Copilot instruction summary only to point to the canonical rules and reinforce the highest-impact constraints. Do not create a second copy of the full guide.

The Tailwind documentation skill requires explicit acceptance before downloading its local documentation snapshot because the upstream docs are source-available but not open-source. Do not run its initializer without that acceptance. The generic Vue skill may recommend broader component splitting than this project needs; follow the project-specific reuse/complexity rule and the user's feature scope.

All written customization content remains in `.agents/` or the required real entry files; no customization is edited through a symlink. No existing page is refactored as part of this task.

## Proposed skill additions

Install only these four confirmed skills into the real `.agents/skills/` directory:

| Skill | Source | Reason |
| --- | --- | --- |
| `nuxt4-patterns` | `affaan-m/ecc` | Targets Nuxt 4 and offsets the installed Nuxt skill's Nuxt 5 basis. |
| `vue-best-practices` | `vuejs-ai/skills` | Adds broad Vue 3, Composition API, SSR, and TypeScript practices. |
| `tailwind-4-docs` | `lombiq/tailwind-agent-skills` | Matches the installed Tailwind CSS v4 major version. |
| `web-design-guidelines` | `vercel-labs/agent-skills` | Supports targeted accessibility, responsive UI, and interface reviews; not the React-specific Vercel skills. |

Each source was checked with `npx skills add <source> --list` before considering the named skill. Do not install the React composition, React/Next.js performance, or React Native skills.

Do not add `vueuse-functions` because VueUse is not installed or used. Do not add Vue component-testing guidance yet because the project has no Vue component tests or Vue Test Utils dependency. Do not add `nuxt-ui`, because `@nuxt/ui` is not installed. Reconsider these only if the project adopts the corresponding package or test surface.

## Validation

- Check all four added skill manifests for `name` and `description` frontmatter and inspect their instructions for unexpected commands or URLs.
- Verify `.agents/skills/` remains a real directory and all consumers still resolve through relative symlinks.
- Verify the scoped instruction frontmatter and `applyTo` patterns.
- Inspect the final diff and run the existing typecheck and focused tests only if implementation changes warrant them; this documentation/skill-only change should not alter application behavior.

## Explicit non-goals

- No application code, UI library, npm dependency, route behavior, component tree, or product design changes.
- No bulk extraction/refactor of current pages.
- No source skill substitution based on an unverified name.
- No commit; preserve the user's request to review the worktree first.
