# Manual test findings (2026-05-23)

This pass crawled **80 canonical web routes**, the full CLI, and the TUI menu against a live stack (NestJS `:3000`, web `:5173`, ttyd `:7681`) and captured 108 web + 10 CLI + 5 TUI screenshots in `docs/manuals/screenshots/`.

## Real data seeded into NestJS

Via `/api/v1/*`:
- **7 tasks** (varied statuses + priorities) on `local-project`
- **1 sprint** ("Sprint 1", capacity 40)
- **3 docs** (ADR / meeting / wiki) on `local-project`
- **3 modules** (Capture & Plan / Build & Ship / Operate & Audit)
- **2 intake** (open + accepted)

`memory` rejected by auth (`UNAUTHORIZED`); sprint-task assignment by id rejected (project-not-found mismatch — see bugs below). The route-level screenshots reflect this real data on list/board/intake/modules surfaces.

## Bugs surfaced + fixed

### 1. NestJS literal routes mounted AFTER parametric (FIXED)

`project-public-api.controller.ts` mounted `Get(":id")` before `Get("dashboard")` because NestJS's RouterExplorer walks methods in class-definition order. Express then matched `/api/v1/projects/dashboard` against `getProject({id:"dashboard"})` → 404. Reordered `dashboard` / `listProjectOptions` / `createProjectFromSetup` above `getProject` in the controller class. Commit `b3901dcc` followed by today's fix.

### 2. `WorkCycleService.addTask` SQL used `?` placeholders (FIXED)

`em.query` against TypeORM Postgres needs `$N`, not `?`. The PGlite-compat `ormSqlConnection.execute` wrapper used `?` correctly elsewhere; this method bypassed it. Converted both `addTask` + `removeTask` to `$1..$N`.

### 3. `ProjectPublicStore.findScopedProject` rejected slugs (FIXED)

Web URLs use the project slug (`/projects/local-project/...`). `findScopedProject` looked up by `id` only. Added slug fallback — the same store now resolves either form.

### 4. `ProjectPublicStore.projectOverview` passed slug to UUID query (FIXED)

After `findScopedProject` resolved a slug → entity, `loadProjectOverview` was still called with `input.id` (the slug). Pass `project.id` (resolved uuid) so the inner SQL `WHERE id::text = $1` matches.

## Bugs found, NOT yet fixed

### A. `/projects/local-project` still 404 after slug-fix

`GET /api/v1/projects/local-project/overview?orgId=…` returns `{"error":"Project not found."}` even though `GET /api/v1/projects/local-project` (the same `findScopedProject` codepath) returns 200. The 404 surfaces from `loadProjectOverview` returning `null` — needs SQL/schema investigation (PGlite `id::text = $1` against the seeded `id="local-project"` row).

### B. `/settings` returns 500 — Report API 404

Root layout loads through `locals.container` which the invocation-layer retirement neutralized. The legacy `ThemeService` / `KeybindingService` resolution falls through and the eventual Report API call 404s. Layout needs to read through public-api clients instead.

### C. CLI `--help` only works on `compress` + `doctor`

- `fulcrum install --help` → `unknown arg '--help'`
- `fulcrum init --help` → tries to use `--help` as a directory
- `fulcrum hooks --help` → `unknown subcommand '--help'`
- `fulcrum skills --help` → `unknown subcommand '--help'`

`apps/cli/src/main.ts` dispatches help via `renderCommandHelp(argv)` only when `COMMAND_HELP.get(root)` is populated. Currently only `doctor` + `init` have entries (and `init`'s handler still treats `--help` as a positional). Each subcommand needs a `COMMAND_HELP` entry; each subcommand handler needs to short-circuit on `argv.includes("--help")` before consuming positionals.

### D. CLI `init --help` consumes `--help` as the target directory

`runInit(rest)` passes `--help` to `mkdir(--help)` → `not a directory`. Same dispatch fix as C.

### E. Sprint task-assignment by project slug 500s

`POST /api/v1/projects/local-project/backlog/sprint-tasks` returns 500 `Project not found`. The route resolves the project (via `findScopedProject`, post-fix) but the underlying `addTaskToSprint` / `WorkCycleService.addTask` reads `sprint.projectId` (a uuid) which has to match the route's `:id` (the slug). Same slug→uuid mismatch class as D.

### F. Task PATCH does not accept `sprintId`

`PATCH /api/v1/tasks/:id` rejects `{sprintId}` with `VALIDATION_ERROR: At least one task field is required.` The patch DTO is too narrow for sprint assignment.

## Manual-test status per surface

### Web (80 routes crawled, 108 screenshots)

| Status | Count | Examples |
|---|---|---|
| Render ok with real data | ~55 | `02-plan` (167KB), `48-stage-build` (162KB), `60-operate-mcp` (166KB), `61-operate-plugins` (179KB), `25-design-tokens`, `26-doctor` |
| Render ok, designed empty-state | ~18 | `15-inbox` ("No notifications" — by design), `12-memory` (auth-walled), `33-notifications-settings` |
| **Render but project-detail data missing** | ~8 | `70-proj-detail` (404 banner), `72-backlog`, `73-sprints` (slug-resolution bug A above) |
| **Real 500** | 1 | `05-settings` (bug B) |

### CLI (10 screenshots)

`fulcrum --help`, `--version`, `doctor` (json + human), `hooks list`, `skills list` (+ `--installed`), `compress --help` captured. **`install --help`, `init --help`, `hooks --help`, `skills --help` all show error screenshots** that document the bugs C/D — kept on purpose so the manual records the broken state until fixed.

Commands NOT yet screenshotted (deferred): `fulcrum init <dir>` happy-path, `install --dry-run`, `install --profile rules-only`, `skills sync`, `skills upstream`, `hooks enable`, `hooks test`, `uninstall --dry-run`, `compress --check`, every `fulcrum doctor --subsystem <name>`, every `fulcrum hook <name>` recipe invocation. Per-subcommand help screenshots blocked by bug C.

### TUI (5 screenshots)

Launch menu, arrow-down to Feature Flags, Feature Flags screen, back-to-menu, Auth screen. The TUI currently exposes only those two settings entries; broader screen set is not yet shipped (see `apps/tui/src/index.ts` JSDoc "C4: TUI surface at feature parity path; foundation screen set shipped"). No bugs found in the surfaces that exist.

## What this manual is + isn't

This is a **stack health report + screenshot ledger**, NOT a polished end-user manual. To reach "full manual + all parities + every flow filled with data" we still need:
1. Fix bugs A–F above.
2. Re-screenshot the 8 project-detail routes that 404'd today.
3. Drive interactive flows (create-doc form, create-task, sprint-add-task, intake-accept, module-attach-task, run-dispatch, doctor-probe) and screenshot each step.
4. Author per-subcommand CLI screenshots once `--help` dispatch is wired.
5. Expand TUI screen set or note explicitly which screens are out-of-scope.
6. Cross-link parity tables: web route ↔ CLI command ↔ TUI screen ↔ public-api endpoint.

Steps 1–6 are tracked above; each is a discrete unit of work.
