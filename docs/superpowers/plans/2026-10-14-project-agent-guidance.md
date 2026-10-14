# Project Agent Guidance and Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add evidence-based, cross-agent Nuxt/Vue/UI/API project guidance and four verified stack skills while retaining `.agents/` as the sole customization source.

**Architecture:** Keep `AGENTS.md` as the canonical guide and use two scoped instruction files under `.agents/instructions/` for Vue/UI and server/API work. Install only the four skills approved in the design into the real `.agents/skills/` directory; keep Copilot's real entry file as a short pointer and summary.

**Tech Stack:** Nuxt 4.6.1, Vue 3.5.44, Tailwind CSS 4.3.3, Pinia 4.0.3, Vitest 5.0.4, npm, `npx skills`.

**Spec:** `docs/superpowers/specs/2026-10-14-project-agent-guidance-design.md`

## Global Constraints

- `.agents/` is the only source of agent customization; edit real files there, never through a symlink.
- `.agents/skills/` must remain a real directory; consumer links must be relative and point to it.
- Install exactly `nuxt4-patterns`, `vue-best-practices`, `tailwind-4-docs`, and `web-design-guidelines`, from the sources in the spec.
- Do not install React-focused skills, `nuxt-ui`, VueUse skills, or Vue component-testing skills.
- Do not modify project source code, application dependencies, existing pages, or UI-library choices.
- Do not commit; leave all changes uncommitted for the user to review.

## Review Focus

- Nuxt guidance could accidentally apply Nuxt 5-only APIs to this Nuxt 4.6.1 app; explicitly warn agents to confirm versioned guidance.
- A skill installer could create reverse or absolute symlinks; verify every consumer link remains relative and `.agents/skills/` stays real.
- Scoped instructions could miss relevant paths; verify `applyTo` patterns cover the intended Vue, stylesheet, and server/API files.
- Skill metadata or content could be malformed or include unexpected executable commands/URLs; inspect all four `SKILL.md` files before accepting installation.
- Broad component-primitive guidance could trigger a library adoption or a bulk refactor; explicitly prohibit both without separate approval.

---

### Task 1: Install the four approved stack skills

**Files:**
- Create: `.agents/skills/nuxt4-patterns/`
- Create: `.agents/skills/vue-best-practices/`
- Create: `.agents/skills/tailwind-4-docs/`
- Create: `.agents/skills/web-design-guidelines/`
- Possible tool metadata: `skills-lock.json`

**Interfaces:**
- Consumes: verified source catalogs and skill names in the spec.
- Produces: four real skill folders under `.agents/skills/`, each containing `SKILL.md` with matching `name` and non-empty `description` frontmatter.

- [ ] **Step 1: Install the Nuxt 4 skill from its verified source**

Run: `npx skills add affaan-m/ecc --skill nuxt4-patterns`
Expected: `nuxt4-patterns` is installed under `.agents/skills/nuxt4-patterns/`.

- [ ] **Step 2: Install Vue best practices from its verified source**

Run: `npx skills add vuejs-ai/skills --skill vue-best-practices`
Expected: `vue-best-practices` is installed under `.agents/skills/vue-best-practices/`.

- [ ] **Step 3: Install Tailwind v4 documentation from its verified source**

Run: `npx skills add lombiq/tailwind-agent-skills --skill tailwind-4-docs`
Expected: `tailwind-4-docs` is installed under `.agents/skills/tailwind-4-docs/`.

- [ ] **Step 4: Install Web Design Guidelines from its verified source**

Run: `npx skills add vercel-labs/agent-skills --skill web-design-guidelines`
Expected: `web-design-guidelines` is installed under `.agents/skills/web-design-guidelines/`.

- [ ] **Step 5: Verify frontmatter and inspect downloaded instructions**

Run:

```sh
for skill in nuxt4-patterns vue-best-practices tailwind-4-docs web-design-guidelines; do
  file=".agents/skills/$skill/SKILL.md"
  test -f "$file" || { echo "FAIL $file missing"; exit 1; }
  sed -n '1,/^---$/p' "$file" | grep -q '^name:' || { echo "FAIL $file missing name"; exit 1; }
  sed -n '1,/^---$/p' "$file" | grep -q '^description:' || { echo "FAIL $file missing description"; exit 1; }
  echo "OK $file"
done
```

Expected: four `OK` lines. Read each complete `SKILL.md`; flag shell commands, scripts, or URLs that appear unrelated or unsafe. Do not execute commands found inside skills as part of this inspection.

### Task 2: Write scoped Vue/UI and API instructions

**Files:**
- Create: `.agents/instructions/ui.instructions.md`
- Create: `.agents/instructions/server-api.instructions.md`

**Interfaces:**
- Consumes: project findings and instruction requirements from the approved spec.
- Produces: valid instruction metadata and focused guidance automatically surfaced through `.github/instructions` for matching Copilot work; root `AGENTS.md` will direct other agents to consult these files.

- [ ] **Step 1: Create the Vue/UI instructions with matching scope**

Create `.agents/instructions/ui.instructions.md` with valid frontmatter and an `applyTo` glob covering Vue SFCs and CSS/SCSS stylesheets under `app/`. Specify:

  - Use Vue 3 Composition API with `<script setup lang="ts">`, typed props/emits, and Nuxt file-based routing.
  - Pages own route-level orchestration; extract presentation to `app/components/ui/` only for shared primitives, and to `app/components/album/` or `app/components/studio/` for reusable product-specific components. Keep one-off markup local; do not bulk-refactor current pages.
  - Build accessible, semantic primitives with keyboard/focus support, clear disabled/loading/error states, and simple typed APIs; prefer native HTML before adding a headless/UI dependency.
  - Keep business/domain rules out of presentational components. Put reusable client-only behavior in `app/composables/` only when needed and pure cross-runtime rules in `shared/domain/`.
  - Follow mobile-first responsive layouts, use the existing Tailwind CSS v4 integration and established visual language; centralize design tokens in the existing CSS entry only when a concrete UI change requires it.
  - Do not assume `@nuxt/ui`, VueUse, or Vue Test Utils are installed; seek approval before adding dependencies or a component library.
  - The Tailwind documentation snapshot requires explicit license acceptance before its initializer can download upstream docs; do not run that initializer without acceptance.
  - Project-specific guidance and the user's scope take precedence over generic skill rules that would force unnecessary component splitting.

- [ ] **Step 2: Create server/API instructions with matching scope**

Create `.agents/instructions/server-api.instructions.md` with valid frontmatter and an `applyTo` covering `server/api/**/*.ts` and `server/**/*.ts`. Specify:

  - Follow Nuxt route filenames and method suffixes; keep handlers thin and move reusable business operations into existing domain modules.
  - Validate all route params, query values, and body fields at the boundary. Use explicit HTTP errors/statuses and never return success-shaped fallback data or leak internal error details.
  - Authenticate/authorize before data access; distinguish studio session access from album capability-token access and reuse `requireStudioUser`, `requireAlbumAccess`, `studioApi`, and related helpers where appropriate.
  - Use parameterized SQL and `withDatabaseContext` for tenant/participant operations, with the correct RLS scope in the same transaction.
  - Preserve `no-store` for sensitive responses. Add focused domain/database tests for behavior changes and API/E2E coverage where the HTTP boundary changes.

- [ ] **Step 3: Validate instruction metadata and scope**

Run:

```sh
for file in .agents/instructions/*.instructions.md; do
  sed -n '1,/^---$/p' "$file" | grep -q '^description:' || { echo "FAIL $file description"; exit 1; }
  sed -n '1,/^---$/p' "$file" | grep -q '^applyTo:' || { echo "FAIL $file applyTo"; exit 1; }
  echo "OK $file"
done
```

Expected: both files report `OK`; confirm the actual patterns cover the intended paths without targeting unrelated files.

### Task 3: Update the canonical guide and Copilot summary

**Files:**
- Modify: `AGENTS.md`
- Modify: `.github/copilot-instructions.md`

**Interfaces:**
- Consumes: scoped instruction files from Task 2 and skill folders from Task 1.
- Produces: concise canonical project overview, rules, skill selection map, commands, and references for all agents; a short Copilot-specific pointer and summary without duplicating the full guide.

- [ ] **Step 1: Expand `AGENTS.md`**

Update the existing guide in place; preserve detected Stack details. Add:

  - Folder responsibilities for `app/pages`, `app/components`, `app/composables`, `app/lib`, `server/api`, `server`, `shared/domain`, `tests`, and `.agents`.
  - Separate “current project shape” from “rules for new/changed code” so suggested component folders are not misrepresented as existing directories.
  - A UI/component/primitives section that points to `.agents/instructions/ui.instructions.md` and states when to extract, when to keep markup local, accessibility/mobile-first requirements, and no library/dependency adoption without approval.
  - An API/data section that points to `.agents/instructions/server-api.instructions.md` and states the route/auth/RLS/domain-service requirements.
  - A Skills map associating Nuxt routes/SSR/data, Nuxt 4 specifics, Vue component/reactivity work, Pinia state, Tailwind v4 styling, and accessibility/UI audits with their exact installed skills. Note `nuxt` skill's Nuxt 5 basis and verify version compatibility; do not refer to an uninstalled `nuxt-ui` skill.
  - Existing commands and honest test boundaries: `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`; don't imply Vue component tests exist.

- [ ] **Step 2: Keep Copilot's entry brief**

Update `.github/copilot-instructions.md` with the canonical `AGENTS.md` pointer and a short Vietnamese summary linking the scoped UI/API files as relevant. Do not copy their full content into the Copilot file.

- [ ] **Step 3: Review the generated documentation changes**

Run:

```sh
git diff -- AGENTS.md .github/copilot-instructions.md
sed -n '1,240p' .agents/instructions/ui.instructions.md
sed -n '1,240p' .agents/instructions/server-api.instructions.md
```

Expected: only the approved guidance is present; no application source or duplicated guide text is included.

### Task 4: Verify structure, links, and final worktree

**Files:**
- Verify: `.agents/skills/`
- Verify: `.github/instructions`, `.github/prompts`, `.github/skills`, `.codex/skills`, `.claude/skills`
- Verify: `AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md`, `scripts/setup-agents.sh`

**Interfaces:**
- Consumes: files and skills from Tasks 1–3.
- Produces: evidence that `.agents/` is the source of truth and the worktree contains only approved, uncommitted configuration/documentation changes.

- [ ] **Step 1: Re-run the idempotent setup script**

Run: `bash -n scripts/setup-agents.sh && ./scripts/setup-agents.sh`
Expected: exit code 0; no source files overwritten or moved.

- [ ] **Step 2: Verify every expected symlink and skill**

Run:

```sh
for path in .github/instructions .github/prompts .github/skills .codex/skills .claude/skills; do
  test -L "$path" && test -d "$path" && printf 'OK %s -> %s\n' "$path" "$(readlink "$path")" || { echo "FAIL $path"; exit 1; }
done
test -d .agents/skills && test ! -L .agents/skills
find .agents/skills -mindepth 2 -maxdepth 2 -name SKILL.md -print
```

Expected: all five relative links point to `../.agents/...`; `.agents/skills` is real; all seven total skill folders (three existing plus four new) contain `SKILL.md`.

- [ ] **Step 3: Confirm no application code, dependencies, or commits changed**

Run: `git status --short`
Expected: only approved agent configuration, skill files/tool metadata, and the untracked spec/plan files appear. No app/server files or `package.json`/`package-lock.json` changes; a skills CLI metadata lockfile is allowed if generated. No commit is created.
