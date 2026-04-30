# 03 — Projects CRUD

Status: ready-for-agent
Risk tier: medium
Severity: critical
Dependencies: 02
File ownership:
- `src/web/src/routes/projects/**`
- `src/web/src/lib/server/projects.ts`
- `src/product-kernel/store/repositories.ts` (extend with `updateProject`, `deleteProject` if missing)

TDD plan:
- RED unit: `src/web/src/lib/server/projects.test.ts` exercises `createProjectAction(formData)`, `updateProjectAction(id, formData)`, `deleteProjectAction(id)` against a temp PGlite. Each test asserts the source row mutation AND the matching `events` row (`project.created` / `project.updated` / `project.deleted`).
- RED unit: `slugify.test.ts` for the auto-derived slug helper (collapse whitespace, lowercase, strip non `[a-z0-9-]`).
- RED component: `project-form.svelte.test.ts` renders the form, types into `name`, asserts `slug` field auto-fills, submits, asserts the SvelteKit `enhance` callback fires.
- RED component: `project-row.svelte.test.ts` clicks "set active" and asserts the cookie helper was called with the slug.
- GREEN: implement `+page.server.ts` actions, the `<ProjectForm />`, `<ProjectRow />`, `<DeleteProjectDialog />`, and the list table.
- REFACTOR: extract `<DangerZone />` reusable for docs/tasks deletes.

Acceptance criteria:
- `/projects` table view with shadcn `Table` (columns: name, slug, description, updated, actions). Filter by name. Empty state with CTA.
- `/projects/new` form (name, slug auto-derived, description). Server action calls `createProject` + writes a `project.created` event.
- `/projects/[id]` detail page with inline rename, description edit, danger-zone delete (uses `AlertDialog`). Update + delete go through SvelteKit form actions and write events.
- Set-active-project button on each row + on detail page (writes the cookie via fetch helper).
- Form validation via Zod (or similar) with inline error messages.
- Toasts on success/failure.

## Sub-tasks

- [x] **03.1 — Server actions module.** Owns: `src/web/src/lib/server/projects.ts`, `.test.ts`. RED: tests against PGlite for `createProjectAction`, `updateProjectAction`, `deleteProjectAction`. Each asserts row + matching `events` row.
- [x] **03.2 — `slugify` helper.** Owns: `src/web/src/lib/util/slugify.ts`, `.test.ts`. RED: cases for whitespace, casing, non-ASCII, empty input.
- [x] **03.3 — `/projects` list route.** Owns: `src/web/src/routes/projects/+page.server.ts`, `+page.svelte`, `+page.svelte.test.ts`. RED: load test asserts seeded rows; component test asserts table rendering + filter input.
- [ ] **03.4 — `/projects/new` create form.** Owns: `src/web/src/routes/projects/new/+page.server.ts`, `+page.svelte`, `ProjectForm.svelte`, `.svelte.test.ts`. RED: validation rejects empty name; auto-slug from name typed.
- [ ] **03.5 — `/projects/[id]` detail + delete.** Owns: `src/web/src/routes/projects/[id]/+page.server.ts`, `+page.svelte`, `DangerZone.svelte`. RED: delete button gated by `AlertDialog`; submitting calls `deleteProjectAction` once.
- [ ] **03.6 — Set-active-project integration.** Owns: `src/web/src/lib/components/projects/SetActiveButton.svelte`, `.svelte.test.ts`. RED: click fires fetch to `/api/active-project` with the slug. Commit `feat(web): add projects CRUD with form actions and set-active button`.

## Comments

### 03.1 server-actions module — landed

- Module: `src/web/src/lib/server/projects.ts` (88 LOC, ≤90 budget).
- Tests: `src/web/src/lib/server/projects.test.ts` — 8 cases all green (`bun test --conditions=svelte ./src/web/src/lib/server/projects.test.ts`).
- `createProjectAction` reuses the kernel `createProject`, which writes a `project.created` event with `payload = {}` (kernel does not yet attach `{ title, status }` for projects the way it does for tasks). The test mirrors this exactly — does not assert payload shape on `created`.
- `updateProjectAction` builds a dynamic `UPDATE ... RETURNING org_id` and emits `project.updated` with `payload = { changed: [...] }`. Throws on missing id or empty field set, as specified.
- `deleteProjectAction` returns `{ ok: true }` for both existing and missing rows; emits `project.deleted` only when a row was actually deleted (via `RETURNING org_id`).

### Kernel surface notes

- `events.project_id` has a non-cascade FK to `projects(id)`, so deleting a project that has any prior events (`project.created`, `project.updated`, …) would violate the FK. `deleteProjectAction` therefore strips dependent event rows first (`DELETE FROM events WHERE project_id = $1`) before deleting the project row, then writes the new `project.deleted` event with `project_id = NULL`. Other tables (`tasks`, `documents`, `agent_runs`, `repos`, `memories`, `artifacts`, `edges`) also reference `projects(id)` without cascade — once 03.5 wires the UI delete button against real projects that may have these dependents, the kernel will need either `ON DELETE CASCADE` migrations or a dedicated `cascadeDeleteProject` helper. Out of scope for 03.1; flagged for the kernel team.

### 03.2 slugify helper — landed

- Module: `src/web/src/lib/util/slugify.ts` (29 LOC, ≤30 budget).
- Tests: `src/web/src/lib/util/slugify.test.ts` — 16 cases (15 unit + 1 property-style regex assertion), 26 expect() calls all green.
- RED: `bun test --conditions=svelte ./src/web/src/lib/util/slugify.test.ts` failed with `Cannot find module './slugify'` before the helper existed.
- GREEN: `bun test --conditions=svelte ./src/web/src/lib/util/slugify.test.ts` → `16 pass / 0 fail`.
- Algorithm: `trim → toLowerCase → ß→ss → NFKD + strip diacritics → replace any non-[a-z0-9] run with single hyphen → collapse hyphens → trim leading/trailing hyphen → slice(0, 64) → strip trailing hyphen left by truncation`. Returns `""` when result is empty or starts with a hyphen.
- ß handled by an explicit pre-NFKD substitution (`ß → ss`) because NFKD on `ß` yields `ß` itself; the diacritic-strip pass then leaves it untouched and the final non-alpha strip would erase it. Pre-mapping keeps the romanisation contract from the issue spec.
- Non-Latin scripts (`中文`) decompose to characters outside `[a-z0-9]` and are stripped; output is `""` so the canonical safe-slug regex `^[a-z0-9][a-z0-9-]{0,63}$` is never violated. Property-style assertion at the end of the test file iterates every input and confirms non-empty outputs match the regex.
- Gates: `cd src/web && bun run check` → 0/0/0; `cd src/web && bun run build` ok; root `bun run ci` → 9 stages green.

### 03.3 /projects list route — landed

- Files:
  - `src/web/src/routes/projects/+page.server.ts` (REWRITE, 7 LOC) — typed `PageServerLoad` that calls `listProjects()` and returns `{ projects }`.
  - `src/web/src/routes/projects/+page.svelte` (REWRITE, 106 LOC; ≤120 budget) — `<header data-projects-header>` with `<h1>Projects</h1>` + `<a data-new-project href="/projects/new">`; `<input data-projects-filter type="search" bind:value={filter}>`; SSR-friendly flat-data-slot table (`data-slot="table-row" data-project-row`) avoiding the shadcn `<Table>` SSR dependency. Empty + filtered-empty states render distinct markers (`data-empty-projects` / `data-empty-filter`).
  - `src/web/src/routes/projects/page.svelte.test.ts` (CREATE, non-`+` prefix) — 6 SSR cases (empty marker + zero rows; 3 rows for 3 projects; filter input shape; new-project CTA; row links; H1 text).
  - `src/web/src/routes/projects/page.server.test.ts` (CREATE, non-`+` prefix) — 2 cases against a temp `FULCRUM_HOME` PGlite seeded with two projects, asserting deterministic created_at-ASC order (mutates `created_at` after insert to dodge same-tick ties) and the empty case.
- TDD discipline:
  - RED command: `bun test --conditions=svelte ./src/web/src/routes/projects/page.svelte.test.ts ./src/web/src/routes/projects/page.server.test.ts`.
  - RED first lines: ``bun test v1.3.13 (bf2e2cec)\n\nsrc/web/src/routes/projects/page.svelte.test.ts:\n66 |     Page = mod.default;\n67 |   });\n68 | ``.
  - GREEN command: same. GREEN result: `8 pass / 0 fail / 24 expect()`.
- Edge: design contract says reuse `listProjects()` and "only modify if you must (and document under Comments)". The route needs `updated_at` for the table column, so I extended `ProjectListing` (added `updated_at: string`) and the `SELECT` to include it. Touch was additive (existing test `listProjects reads real rows from the product DB` only asserts length + slug + id and stays green). This is the documented "only-if-must" exit.
- Filtering: case-insensitive substring match against `name` AND `slug`, runs at render-time only via `$derived.by`. SSR therefore renders the unfiltered table and the empty-filter branch is exercised only in the browser; SSR tests cover both empty-states by passing prop shapes that take that branch.
- Description truncation: 80-char ellipsis (`truncate(value, 80)`); `null` description renders an empty `<td>`.
- Updated formatter: `YYYY-MM-DD HH:mm` slice from the ISO string (no timezone shift). Avoids `Intl.DateTimeFormat` whose locale could vary between dev/CI machines.
- Gates: `cd src/web && bun run check` → 0/0/0; `cd src/web && bun run build` ok; root `bun run ci` → 9 stages green.
