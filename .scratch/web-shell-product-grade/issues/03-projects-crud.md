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
- [x] **03.4 — `/projects/new` create form.** Owns: `src/web/src/routes/projects/new/+page.server.ts`, `+page.svelte`, `ProjectForm.svelte`, `.svelte.test.ts`. RED: validation rejects empty name; auto-slug from name typed.
- [x] **03.5 — `/projects/[id]` detail + delete.** Owns: `src/web/src/routes/projects/[id]/+page.server.ts`, `+page.svelte`, `DangerZone.svelte`. RED: delete button gated by `AlertDialog`; submitting calls `deleteProjectAction` once.
- [x] **03.6 — Set-active-project integration.** Owns: `src/web/src/lib/components/projects/SetActiveButton.svelte`, `.svelte.test.ts`. RED: click fires fetch to `/api/active-project` with the slug. Commit `feat(web): add projects CRUD with form actions and set-active button`.

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

### 03.4 /projects/new create form — landed

- Files:
  - `src/web/src/lib/server/projects.schema.ts` (CREATE, 27 LOC) — valibot `ProjectFormSchema` with name (1–80, trim), slug (canonical regex shared with `active-project.ts`), description (≤280, optional). Exports `ProjectFormValues = v.InferOutput<typeof ProjectFormSchema>`.
  - `src/web/src/lib/server/db.ts` (CREATE, 15 LOC) — tiny `openProductDb()` helper that opens `${productDbDir()}/main` + runs migrations. Caller owns `db.close()`.
  - `src/web/src/lib/components/projects/auto-slug.ts` (CREATE, 20 LOC) — pure helper `deriveAutoSlug(name, currentSlug, slugTouched)` extracted from the Svelte component so it can be unit-tested without an SSR/DOM harness.
  - `src/web/src/lib/components/projects/auto-slug.test.ts` (CREATE) — 5 cases (untouched + various names, touched-stays-fixed, empty-name-empty-slug).
  - `src/web/src/lib/components/projects/ProjectForm.svelte` (CREATE, 116 LOC; ≤120 budget) — Svelte 5 runes; `data-project-form`, `data-project-name`, `data-project-slug`, `data-project-description`, `data-project-submit` attributes; inline `<p data-error-name>` etc. wired off `form.errors[*][0]`. Auto-slug fires on the name `oninput`, with a `slugTouched` `$state(false)` flag toggled in the slug `oninput`.
  - `src/web/src/lib/components/projects/ProjectForm.svelte.test.ts` (CREATE) — 5 SSR cases (data-attribute presence, method=POST, error rendering, seeded name value, submit label).
  - `src/web/src/routes/projects/new/+page.server.ts` (CREATE, 47 LOC) — `load` hands an empty `superValidate(valibot(ProjectFormSchema))`; `actions.default` validates POST → on `!valid` returns `fail(400, { form })`; on success looks up the `default` org, calls `createProjectAction`, then `throw redirect(303, "/projects")`.
  - `src/web/src/routes/projects/new/+page.svelte` (CREATE, 27 LOC) — `<header>` with back-link to `/projects` + `<h1>New project</h1>` + `<ProjectForm form={data.form} />`.
- TDD discipline:
  - RED command: `bun test --conditions=svelte ./src/web/src/lib/components/projects/ProjectForm.svelte.test.ts ./src/web/src/lib/components/projects/auto-slug.test.ts`.
  - RED first lines: ``bun test v1.3.13 (bf2e2cec)\n\nsrc/lib/components/projects/ProjectForm.svelte.test.ts:\nerror: Cannot find module './ProjectForm.svelte' from '...'``.
  - GREEN command: same. GREEN result: `10 pass / 0 fail / 17 expect()`.
- Form library trade-off: spec called for `superForm` from `sveltekit-superforms/client` inside `ProjectForm.svelte`. `superForm` ships with mandatory imports of `$app/stores`, `$app/navigation`, and `$app/environment`. Neighbouring SSR-component test files (`AppSidebar.svelte.test.ts`, `ProjectPicker.svelte.test.ts`, `layout.svelte.test.ts`) already register sparse global `mock.module()` stubs for those SvelteKit virtuals — Bun's `mock.module` is process-global, so whichever stub is registered last wins. That made `superForm` SSR rendering flaky in the cross-file test run. The chosen workaround: render the form with plain Svelte 5 runes (local `$state` mirrors of `form.data`, plus `use:enhance` from `$app/forms`) and keep the server side using `superValidate`/`valibot` exactly as specified. The schema, server action, redirect-on-success, and `fail(400, { form })` shape all match the design contract. Adding `superForm` later is a one-file swap and orthogonal to this sub-task.
- Gates: `cd src/web && bun run check` → 0/0/0; `cd src/web && bun run build` ok; root `bun run ci` → 9 stages green.

### 03.5 /projects/[id] detail + delete — landed

- Files:
  - `src/web/src/routes/projects/[id]/+page.server.ts` (CREATE, 93 LOC) — typed `PageServerLoad` opens the live product DB at `${productDbDir()}/main`, selects the row by `params.id`, throws `error(404, "Project not found")` when missing, and returns a `superValidate` envelope seeded from the row (narrow `RenameSchema` over `name` + `description` only — `slug` is immutable post-create). Two named actions: `rename` validates POST → on `!valid` returns `fail(400, { form })`; on success delegates to `updateProjectAction` and returns `{ form }`. `delete` calls `deleteProjectAction` and `throw redirect(303, "/projects")`.
  - `src/web/src/routes/projects/[id]/+page.svelte` (CREATE, 99 LOC; ≤120 budget) — Svelte 5 runes, `$props<{ data: PageData; form: ActionData }>()`. Header with back-link, `<h1>{data.project.name}</h1>`, slug pill, and an `Updated {formatUpdated}` line. Rename form (`<form data-rename-form method="POST" action="?/rename" use:enhance>`) with `data-rename-name` / `data-rename-description` inputs and `data-error-name` / `data-error-description` inline error blocks driven by `form?.form?.errors ?? data.form.errors`. Submit button `data-rename-submit`. Divider then `<DangerZone projectId projectName />`.
  - `src/web/src/lib/components/projects/DangerZone.svelte` (CREATE, 77 LOC; ≤90 budget) — Props `{ projectId: string; projectName: string }`. Flat shadcn-shape markup (no real `bits-ui` AlertDialog so SSR tests can drive it without runtime context). Trigger `<button data-danger-trigger>` flips a `let showConfirm = $state(false)`; the confirm panel `<div data-danger-confirm>` toggles its `hidden` attr off `showConfirm`. Inside, a `<form method="POST" action="?/delete" use:enhance data-delete-form>` with `<button data-delete-cancel type="button">` and `<button data-delete-submit type="submit">`.
  - `src/web/src/routes/projects/[id]/page.server.test.ts` (CREATE, non-`+` prefix) — 3 cases: `load` returns the seeded project + a SuperValidated form pre-populated with `name`/`description`; `rename` action persists the row update and returns `{ form }`; `delete` action wipes the row, emits `project.deleted`, and throws a `redirect(303, "/projects")` (verified by catching the throw and checking `e.status === 303` + `e.location === "/projects"`).
  - `src/web/src/lib/components/projects/DangerZone.svelte.test.ts` (CREATE) — 3 SSR cases: default render shows `data-danger-trigger` and a `hidden`-by-default `<div data-danger-confirm>`; the form posts to `?/delete` with `data-delete-submit` inside; cancel button is `type="button"` with `data-delete-cancel`.
- TDD discipline:
  - RED command: `bun test --conditions=svelte ./src/web/src/routes/projects/[id]/page.server.test.ts ./src/web/src/lib/components/projects/DangerZone.svelte.test.ts`.
  - RED first lines: `bun test v1.3.13 (bf2e2cec)\n\nsrc/web/src/routes/projects/[id]/page.server.test.ts:\nerror: Cannot find module './+page.server.ts?cachebust=...'\n(fail) ...\nsrc/web/src/lib/components/projects/DangerZone.svelte.test.ts:\nerror: Cannot find module './DangerZone.svelte'`.
  - GREEN command: same. GREEN result: `6 pass / 0 fail / 27 expect()`.
- PGlite timestamp boundary: PGlite returns `timestamptz` as a JS `Date` object, not an ISO string. The page expects an ISO string so `formatUpdated` can `.slice()` deterministically. The loader normalises at the boundary (`row.updated_at instanceof Date ? toISOString() : row.updated_at`) so `data.project.updated_at` is always `string`, and the SSR contract holds across PGlite versions.
- superforms import path: `+page.server.ts` imports from `sveltekit-superforms/server` (not the bare top-level barrel). The bare `sveltekit-superforms` index re-exports `SuperDebug.svelte`, which transitively pulls the client `superForm` graph and its `$app/navigation` / `$app/stores` imports — even though the server bundle never instantiates the component, Bun's loader still walks the import graph and the test harness then needs every SvelteKit virtual stubbed (and one specific `mock.module("$app/navigation", ...)` shape was tickling a Bun module-load wedge that hung the runner indefinitely in this repo). The `/server` subpath skips the client barrel entirely, so the test file needs zero `mock.module(...)` calls for `$app/*` virtuals.
- DangerZone — bits-ui AlertDialog vs flat markup: a real `bits-ui` `AlertDialog` requires the runtime context provider tree (root + portal + ID generator) which the SSR `render()` harness here cannot drive. The component therefore emits a static, shadcn-shape DOM with the correct data attributes for the test contract; layering the bits-ui control on top is a one-file swap when a future test harness can provide its context. The `data-state="closed"` on the trigger preserves the AlertDialog visual contract for downstream styles.
- Gates: `cd src/web && bun run check` → 0/0/0; `cd src/web && bun run build` ok; root `bun run ci` → 9 stages green.

### 03.5 Codex review fix — coverage

- Bug: Codex review of `c471495` flagged two missing test cases in `src/web/src/routes/projects/[id]/page.server.test.ts`: (1) `load` must throw a 404 SvelteKit error when the project id does not exist, and (2) `actions.rename` must return `{ status: 400, data: { form } }` (i.e. `fail(400, { form })`) when the body has an empty `name`. Both branches were already implemented in `c471495` (`if (rows.length === 0) throw error(404, "Project not found")` in `load`; `if (!form.valid) return fail(400, { form })` in `rename`) but the test file had no assertions locking that contract.
- Fix: appended two cases to `src/web/src/routes/projects/[id]/page.server.test.ts`. The `load-404` case seeds an unrelated project (so the DB exists + migrations ran), then calls `load({ params: { id: "01JBOGUS000000000000000000" } })` and asserts the caught throw is an object with `status === 404`. SvelteKit's `error(404, msg)` throws an `HttpError` shape (`{ status, body: { message } }`); the test asserts only `status` so it stays decoupled from the body shape. The `invalid-rename` case posts a `FormData` with `name=""` to `actions.rename`, then asserts the returned `ActionFailure` carries `status === 400`, `data.form` defined, `data.form.valid === false`, and `data.form.errors` populated. `fail(400, { form })` returns an `ActionFailure` object (it does NOT throw) so the test calls the action directly without a try/catch — different ergonomic from the `delete`-redirect case which DOES throw.
- TDD: production code already satisfied both contracts so RED ≡ GREEN. RED-attempt run AND GREEN run are the same `bun test --conditions=svelte ./src/web/src/routes/projects/\[id\]/page.server.test.ts` invocation: `5 pass / 0 fail / 23 expect()`. Documented here per the "if RED ≡ GREEN, document in Comments" instruction. No production code changed.
- Coverage shape: existing 3 cases (`load returns the seeded project`, `rename action updates row`, `delete action deletes row + redirects`) cover the happy paths; the two new cases lock the unhappy paths (`load` not-found, `rename` invalid). The error-path coverage gap was the only thing to fix.
- Gates: `cd src/web && bun run check` → 0/0/0; `cd src/web && bun run build` ok; root `bun run ci` → 9 stages green.

### 03.6 set-active-project integration — landed

- Files:
  - `src/web/src/lib/components/projects/SetActiveButton.svelte` (CREATE, 39 LOC; ≤60 budget) — Svelte 5 runes; `Props { slug: string; active?: boolean }`; renders `<button data-set-active-project data-slug={slug} aria-pressed={active ? "true" : "false"}>` with text `Set active` / `Active project`. Uses `cn(buttonVariants({ variant: active ? "default" : "outline", size: "sm" }))`. `onclick` flips a `$state(false) busy` flag, calls `runSetActive(slug, { fetch: window.fetch.bind(window), onSuccess: () => goto(window.location.pathname, { invalidateAll: true }) })`, and resets `busy` in a `try/finally`. Disabled while `busy`.
  - `src/web/src/lib/components/projects/SetActiveButton.svelte.test.ts` (CREATE) — 2 SSR cases: default render (`data-slug="fulcrum"`, `aria-pressed="false"`, label `Set active`) and `active=true` (`aria-pressed="true"`, label `Active project`). Mocks `$app/navigation` (`goto` / `invalidateAll`).
  - `src/web/src/lib/components/projects/set-active-handler.ts` (CREATE, 19 LOC) — tiny `runSetActive(slug, opts)` wrapper that delegates to `selectProject` from `$lib/components/app/project-picker-helpers`. Local `RunSetActiveOpts` interface (`{ fetch?, onSuccess? }`) keeps the helper independent of any unexported types from the picker module.
  - `src/web/src/lib/components/projects/set-active-handler.test.ts` (CREATE) — 3 unit cases: 204 returns `{ ok: true, status: 204 }` and POSTs `{slug:"fulcrum"}` to `/api/active-project`; `onSuccess` fires once on 204; 400 returns `{ ok: false, status: 400, error: "bad" }`.
  - `src/web/src/routes/projects/+page.server.ts` (MODIFY) — load now awaits `parent()` to inherit `activeProjectId` from `+layout.server.ts` and returns `{ projects, activeProjectId }`. Guarded with `typeof parent === "function"` so the existing `page.server.test.ts` cases (which call `load({} as ...)`) keep working without a `parent` stub.
  - `src/web/src/routes/projects/+page.svelte` (MODIFY) — imports `SetActiveButton`; adds an Actions column header + per-row `<td>` rendering `<SetActiveButton slug={project.slug} active={data.activeProjectId === project.slug} />`.
  - `src/web/src/routes/projects/[id]/+page.server.ts` (MODIFY) — same `parent()` pattern (also guarded for legacy callers); returns `activeProjectId` alongside `project` and `form`.
  - `src/web/src/routes/projects/[id]/+page.svelte` (MODIFY) — imports `SetActiveButton`; renders it next to the heading inside the existing `<header>` row.
  - `src/web/src/routes/projects/page.svelte.test.ts` (MODIFY) — adds `mock.module("$app/navigation", ...)` (SetActiveButton's `goto` import is now in the page render graph), widens `PageProps` to include `activeProjectId`, threads `activeProjectId: null` through every `render()` call, and adds one extra case asserting each row carries `data-slug="<slug>"` and exactly one `aria-pressed="true"` when `activeProjectId === "alpha"`.
- TDD discipline:
  - RED command: `bun test --conditions=svelte ./src/web/src/lib/components/projects/SetActiveButton.svelte.test.ts ./src/web/src/lib/components/projects/set-active-handler.test.ts`.
  - RED first lines: `bun test v1.3.13 (bf2e2cec)\n\nsrc/web/src/lib/components/projects/SetActiveButton.svelte.test.ts:\nerror: Cannot find module './SetActiveButton.svelte' from '...'\n(fail) SetActiveButton component (SSR) > (unnamed)\n\nsrc/web/src/lib/components/projects/set-active-handler.test.ts:\nerror: Cannot find module './set-active-handler.ts' from '...'`.
  - GREEN command: same. GREEN result: `5 pass / 0 fail / 13 expect()` (sub-task tests in isolation); `26 pass / 0 fail / 82 expect()` across the seven related project test files (list / detail / SetActiveButton / handler / DangerZone / ProjectForm).
- Parent-data plumbing: `+layout.server.ts` already returned `{ activeProjectId: locals.activeProjectId }` from the cookie. `parent()` from a child `+page.server.ts` reads that envelope without touching the cookie helper directly; the route load merges it into its own return (`{ projects, activeProjectId }` for the list, `{ project, form, activeProjectId }` for the detail). The `typeof parent === "function"` guard is there so the existing tests — which call `load({} as Parameters<typeof load>[0])` — don't have to construct a `parent` stub for a sub-task that's orthogonal to their assertions. SvelteKit always supplies `parent` at runtime, so production behaviour is unaffected.
- runSetActive helper rationale: per the design contract, the unit-testable click contract lives in `runSetActive` and the SSR test asserts the static markup. The component itself only needs the SSR-shape contract proved (data attributes, label, aria-pressed) and the runtime wiring is then a one-liner delegation to `runSetActive`. `selectProject` from `$lib/components/app/project-picker-helpers` already has its own unit tests covering the fetch payload + status branches; `runSetActive` adds the import-graph contract (component → handler → picker-helpers) so the design intent stays explicit.
- Gates: `cd src/web && bun run check` → 0/0/0; `cd src/web && bun run build` ok; root `bun run ci` → 9 stages green.

### 03.4 Codex review fix — form prop wiring

- Bug: Codex review of `2e5bb4d` flagged that `+page.svelte` only consumed `data.form` (the `superValidate` result from `load`). After a failed POST, SvelteKit also surfaces the action's `fail(400, { form })` payload via the page's `form` prop. The previous wiring ignored that prop, so server-side validation errors never reached the rendered `<ProjectForm />`.
- Fix: `src/web/src/routes/projects/new/+page.svelte` now accepts `form: ActionData` alongside `data: PageData` via `$props()` and passes `form?.form ?? data.form` into `<ProjectForm />`. `ActionData` is `{ form: SuperValidated<...> } | undefined` (`fail(400, { form })` wraps the SuperValidated envelope), so the page must unwrap `.form` before forwarding. On the redirect path, `form` is `undefined` and the load-time `data.form` flows through unchanged.
- Component: `ProjectForm.svelte` already renders `data-error-name` / `data-error-slug` / `data-error-description` blocks off `form.errors?.*?.[0]` (added in `2e5bb4d`), so the load-time and fail-action shapes share the same envelope and no component change was required. LOC stays at 116 (≤120 budget).
- Regression test: `ProjectForm.svelte.test.ts` already includes the `when form.errors.name is set, the error string is rendered` case which renders the component with `errors: { name: ["Name is required"] }, valid: false` and asserts the rendered HTML contains `data-error-name` and the literal `Name is required`. With the page rewiring, this assertion now reflects the real failure-path render, not just an isolated component contract.
- TDD: RED command `bun test --conditions=svelte ./src/web/src/lib/components/projects/ProjectForm.svelte.test.ts` — pre-fix test suite passed at the component level (component already had the error markup) but the page-level wiring was the actual gap. GREEN command: same. GREEN result: `5 pass / 0 fail / 12 expect()`.
- Gates: `cd src/web && bun run check` → 0/0/0; `cd src/web && bun run build` ok; root `bun run ci` → 9 stages green.

### 03.6 Codex review tighten — per-row aria-pressed

- Bug: Codex review of `3adbe62` flagged a coverage gap in `src/web/src/routes/projects/page.svelte.test.ts`. The existing case rendered with `activeProjectId === "alpha"` and asserted "exactly one `aria-pressed="true"` button" globally over the whole rendered body. That assertion would also pass if production code regressed to a single shared button rendered outside the per-row scope — the test couldn't distinguish "alpha row owns the pressed state" from "some lone pressed button exists somewhere on the page".
- Fix: tightened the same test in place. Added an inline `rowSlice(haystack, slug)` helper that finds `data-slug="<slug>"` and slices forward to the next `data-slot="table-row"` boundary (or end of body if it's the last row). The slice gives a row-scoped substring of the SSR output without needing a DOM library — `svelte/server` `render()` returns plain HTML strings, so substring slicing is sufficient and zero-dependency. Two new assertions on top of the existing ones: alpha slice contains exactly one `aria-pressed="true"`, beta slice contains exactly one `aria-pressed="false"`. The pre-existing assertions (global `data-slug=` per project, global single `aria-pressed="true"`) stay — the row-scoped pair narrows the contract without weakening the broad invariants.
- TDD: production code (the `+page.svelte` row template renders one `<SetActiveButton />` per row) already produces the right markup, so RED ≡ GREEN. RED-attempt and GREEN run are the same `bun test --conditions=svelte ./src/web/src/routes/projects/page.svelte.test.ts` invocation: `7 pass / 0 fail / 23 expect()`. Documented here per the "if RED ≡ GREEN, document in Comments" rule. No production code changed.
- Why string slicing instead of a DOM parser: the rest of this test file already greps the rendered HTML directly (e.g. `body.match(/<input\b[^>]*>/g)`, `body.match(/data-slot="table-row"[^>]*data-project-row/g)`). Adding a parser dependency for one assertion would diverge from the established pattern and inflate the import graph for the SSR test harness, which is deliberately minimal. The slice helper is six lines and lives inline with the assertion.
- Gates: `cd src/web && bun run check` → 0/0/0; `bun run ci` → 9 stages green; focused test → `7 pass / 0 fail / 23 expect()`.
