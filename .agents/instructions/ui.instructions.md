---
description: "Use when creating or changing Nuxt pages, Vue components, UI primitives, styles, responsive layouts, or accessibility behavior."
applyTo: "app/**/*.{vue,css,scss}"
---

# Vue and UI Guidance

## Use the project stack

- Use Vue 3 Composition API with `<script setup lang="ts">`, typed props/emits, and Nuxt file-based routing.
- Use the `vue` and `vue-best-practices` skills for Vue work; use `nuxt` and `nuxt4-patterns` when touching routing, SSR, hydration, or data fetching. Check advice against the installed Nuxt 4 version.
- Preserve the existing page's rendering and data-fetching model unless the task requires changing it. Use `useFetch`/`useAsyncData` for SSR-hydrated route reads and `$fetch` for user-triggered writes; do not mechanically rewrite existing client-mounted flows.
- Use Pinia only when state is shared across routes/features. Keep page- or component-local state local.

## Organize pages, components, and logic

- Pages under `app/pages/` own route-level orchestration and compose the screen. Keep one-off UI local; do not extract a component only to reduce line count.
- For non-trivial UI work, briefly map component responsibilities and typed props/emits before implementation. Extract when a section is reused, has its own meaningful interaction/state, or separating it materially simplifies the page.
- When needed, place shared accessible primitives in `app/components/ui/`; place reusable product components in `app/components/album/` or `app/components/studio/`. These directories do not currently exist; create only the directory needed for actual components.
- Keep presentational components focused on rendering and emitting user intent. Put reusable client-side stateful behavior in `app/composables/` only when reuse or complexity warrants it. Put pure business rules shared by client/server in `shared/domain/`.
- Skill guidance is subordinate to the user's scope and this repository's patterns. Do not split every multi-section or CRUD page into a fixed number of components when that adds indirection without improving reuse or clarity. Do not bulk-refactor existing pages as part of an unrelated feature.

## Build UI primitives and screens

- Prefer semantic native HTML elements before adding an abstraction or dependency. Do not assume `@nuxt/ui`, VueUse, Vue Test Utils, or another component library is installed.
- Keep primitive APIs small and typed. Use props down and events up; use `v-model` only for an intentional two-way contract. Avoid boolean-prop proliferation and hidden global state.
- Primitives must have accessible names, keyboard operation, visible focus, correct disabled/busy semantics, and clear validation/error feedback. Use dialog semantics and focus behavior for overlays; don't replace native form behavior without a reason.
- Provide visible loading, error, empty, success, and disabled states appropriate to each screen. Announce asynchronous feedback with status/alert semantics where useful.
- Design mobile-first for the customer gallery and studio workflows; verify narrow and wide layouts, touch target size, long filenames, and responsive dialogs/panels.
- Match the existing muted background, green brand, typography, rounded surfaces, and spacing rather than introducing a new visual language. There is no established token system yet: avoid proliferating new color literals; add a shared CSS/Tailwind token in `app/assets/css/main.css` only when a repeated value or UI change justifies it.
- Use the existing Tailwind CSS v4 integration (`@import "tailwindcss"` and `@tailwindcss/vite`). For v4 questions, consult `tailwind-4-docs`; do not use v3 directives or configuration examples without verifying compatibility.
- Use `web-design-guidelines` for explicit UI/accessibility reviews. Do not add a component library or runtime dependency without a concrete need and user approval.

## Validate UI changes

- Run `npm run typecheck` and relevant tests after behavior changes. The repository currently has Vitest domain/database tests and Playwright E2E tests, but no Vue component-test setup.
- Do not add component-test dependencies just to satisfy a generic skill checklist; request approval if component tests require new dependencies.
