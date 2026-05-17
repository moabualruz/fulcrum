# Manual Smoke Test + UX Critique - 2026-05-17

## Scope

Manual smoke pass across Fulcrum web, CLI, TUI, and API surfaces.

Environment:

- Repo: `/Users/mkh/workspace/fulcrum`
- Scratch home: `/Users/mkh/workspace/fulcrum/.scratch/manual-smoke-2026-05-17/home`
- Web URL left running: `http://127.0.0.1:5173/`
- Feature flags: `public-api,import-csv,export-csv,real-time-collab-server`

Evidence:

- Web route JSON: `/Users/mkh/workspace/fulcrum/.scratch/manual-smoke-2026-05-17/web-smoke-results.json`
- Screenshots: `/Users/mkh/workspace/fulcrum/.scratch/manual-smoke-2026-05-17/screenshots/`
- CLI log: `/Users/mkh/workspace/fulcrum/.scratch/manual-smoke-2026-05-17/logs/cli-smoke.txt`
- API endpoint log: `/Users/mkh/workspace/fulcrum/.scratch/manual-smoke-2026-05-17/logs/api-smoke.txt`
- API startup log: `/Users/mkh/workspace/fulcrum/.scratch/manual-smoke-2026-05-17/logs/api-server-startup.txt`
- TUI startup log: `/Users/mkh/workspace/fulcrum/.scratch/manual-smoke-2026-05-17/logs/tui-startup.txt`

## Remediation Pass - 2026-05-17 13:31 Asia/Amman

Fixed blockers in this pass:

- API now boots and binds `http://127.0.0.1:3000`.
  - Current command: `FULCRUM_HOME=/Users/mkh/workspace/fulcrum/.scratch/manual-smoke-2026-05-17/home FULCRUM_FEATURES=public-api,import-csv,export-csv,real-time-collab-server FULCRUM_SERVER_PORT=3000 bun run --cwd apps/server dev`
  - Evidence: API startup session reached `Nest application successfully started`.
- TUI now renders the first interactive frame.
  - Current command: `FULCRUM_HOME=/Users/mkh/workspace/fulcrum/.scratch/manual-smoke-2026-05-17/home FULCRUM_SERVER_URL=http://127.0.0.1:3000 FULCRUM_PUBLIC_API_URL=http://127.0.0.1:3000/api/v1 FULCRUM_ORG_ID=00000000-0000-0000-0000-000000000001 FULCRUM_USER_ID=44065500-0ffe-41db-8d51-f2fbb816d4d2 FULCRUM_API_TOKEN=local-dev-token bun run --cwd apps/tui dev`
  - Evidence: rendered header, domain nav, detail pane, footer, and command palette prompt.
- Web route sweep now passes all scripted desktop/mobile core routes.
  - Command: `node .scratch/manual-smoke-2026-05-17/web-smoke.mjs`
  - Result: `{"routes":24,"failures":[]}`
  - Evidence: `/Users/mkh/workspace/fulcrum/.scratch/manual-smoke-2026-05-17/web-smoke-results.json`
- API smoke now passes OpenAPI, public API, and workflow trace endpoints.
  - Evidence: `/Users/mkh/workspace/fulcrum/.scratch/manual-smoke-2026-05-17/logs/api-workflow-endpoints-smoke.json`
- CLI package-local invocation works with the new `apps/cli/tsconfig.json`.
  - Evidence: `/Users/mkh/workspace/fulcrum/.scratch/manual-smoke-2026-05-17/logs/cli-flags-list-cwd.json`
  - Evidence: `/Users/mkh/workspace/fulcrum/.scratch/manual-smoke-2026-05-17/logs/cli-projects-list.json`
- CLI can run the real acceptance-cycle workflow against the local API.
  - Command: `bun run --cwd apps/cli src/main.ts product workflows acceptance-cycle run --file ../../.scratch/manual-smoke-2026-05-17/cli-workflow-payload.json --json`
  - Result summary: `traceId=trace-cli-smoke-mp9mwwsq`, `materializedTaskIds=4`, `dependencyRuns=4`, `finalQa=passed`, `uat=approved`, `e2e=planned`, `generatedFiles=4`
  - Evidence: `/Users/mkh/workspace/fulcrum/.scratch/manual-smoke-2026-05-17/logs/cli-workflow-acceptance-cycle.json`
- Full workflow HTTP API path now runs end-to-end.
  - Command: `set -o pipefail; bun /tmp/fulcrum-workflow-smoke.mjs | tee .scratch/manual-smoke-2026-05-17/logs/workflow-acceptance-cycle-smoke.json`
  - Result: `status=201`, `ok=true`, `traceId=trace-manual-smoke-mp9mwwsq`
  - Proven chain: freeform doc -> ACP planning session and traffic -> approved plan docs/artifacts/tasks -> dependency run dispatch/lifecycle -> QA -> final QA passed -> UAT/code-review handoff -> UAT approval -> generated real-data E2E plan.
  - Trace summary evidence: `/Users/mkh/workspace/fulcrum/.scratch/manual-smoke-2026-05-17/logs/workflow-trace-summary-smoke.json`

Fresh workflow trace evidence:

- Workflow trace ID: `trace-manual-smoke-mp9mwwsq`
- Project ID: `project-manual-smoke-mp9mwwsq`
- Trace summary includes 4 docs, 4 tasks, 3 dependency edges, 1 plan, 1 prototype, UAT/code-review session IDs, 4 generated E2E test IDs, 1 artifact, and 5 agent run IDs.
- Generated E2E temp files are under `/var/folders/m0/h9317g_x73s05cpkmvrcbgtc0000gn/T/fulcrum-generated-e2e/project-manual-smoke-mp9mwwsq/trace-manual-smoke-mp9mwwsq/`.

Code fixes made:

- Added app-local `tsconfig.json` files for `apps/server`, `apps/tui`, and `apps/cli` so decorator metadata is available under package-local `bun run --cwd ...`.
- Replaced app TypeORM migration glob dependence on CommonJS `__dirname` with explicit migration classes.
- Added missing platform feature-flag and notification trace migrations to the app migration path.
- Seeded local development runtime identity into public organization/workspace membership tables.
- Aligned local web request runtime user ID with the seeded admin user.
- Fixed project and run SQL placeholders for PostgreSQL/PGlite.
- Added dependency-preview cycle detection so bad graphs do not stack overflow.
- Fixed approved-plan materialization so explicit `verify-end-to-end` tasks are not duplicated and do not create self-dependencies.
- Added default verification success criteria to explicit `verify-end-to-end` tasks when the plan author omits task-level criteria, allowing final QA and UAT/E2E generation to proceed.
- Updated Nest bootstrap test harness for tRPC middleware mounting.

Focused verification run:

- `bun test tests/planning-review/approved-plan-breakdown.test.ts` -> 4 pass.
- `bun test services/workflow-coordination/src/application/workflow-acceptance-cycle.integration.test.ts` -> 2 pass.
- `bun test tests/execution-orchestration/dependency-run-preview.test.ts` -> 5 pass.
- `bun test apps/server/src/nest-application.test.ts` -> 2 pass.
- Combined focused workflow run -> 11 pass.
- `bun test services/platform-core/src/application/runtime/web-request-runtime.test.ts services/platform-core/src/infrastructure/application-database/typeorm.config.test.ts` reported 5 pass / 0 fail but Bun exited `99`; treat as a remaining verification anomaly until isolated or fixed.

Remaining blockers before claiming verified-complete:

- Full `bun run ci` has not been run after these changes.
- TUI smoke is only first-frame and command-palette evidence; deeper navigation/workflow parity still needs interactive proof and screenshots.
- Web scripted smoke passes, but UX critique issues remain: navigation is feature-bucket oriented, many empty states are thin, recovery/diagnostics/trace IDs are inconsistent, and mobile wrapping must be rechecked visually after the backend fixes.
- API generated E2E is planned and materialized; the full configured generated-E2E runner path still needs a direct verification command.
- The `web-request-runtime + typeorm.config` focused test pair has a Bun exit-code anomaly despite all assertions passing.

Current reviewability:

- Web dev server is running at `http://127.0.0.1:5173/`.
- API dev server is running at `http://127.0.0.1:3000`.
- TUI dev session is running in the current terminal session and has rendered its first frame.

## Reviewability

- Web dev server is still running at `http://127.0.0.1:5173/`.
- API dev server is not running. It exits at startup before binding `:3000`.
- TUI is not running. It exits at startup before first frame.
- CLI is runnable for static/help commands; data-backed workflow commands are blocked by missing API configuration or unreachable API.

## Critical Blockers

1. API cannot boot.
   - Command: `bun run --cwd apps/server dev`
   - Exit: `1`
   - Failure: `TypeError: undefined is not an object (evaluating 'object.constructor')`
   - Stack points at `services/identity-access/src/infrastructure/database/entities/auth/Org.ts` through TypeORM `PrimaryGeneratedColumn`.

2. TUI cannot boot.
   - Command: `bun run --cwd apps/tui dev`
   - Exit: `1`
   - Failure: `TypeError();`
   - Stack points through `reflect-metadata`, TypeORM `PrimaryColumn`, and `services/identity-access/src/infrastructure/database/entities/auth/Session.ts`.

3. Web local database initialization fails on key routes.
   - Routes such as `/` and `/projects/new` log `ReferenceError: __dirname is not defined`.
   - Stack points at `services/platform-core/src/infrastructure/application-database/typeorm.config.ts`.
   - Result: dashboard, project creation, and other core screens cannot load real data.

4. Web pages call missing public API routes on the web host.
   - `/api/v1/docs`, `/api/v1/artifacts`, `/api/v1/audit`, `/api/v1/connectors`, `/api/v1/routing/rules`, and `/api/v1/routing/drafts` return `404`.
   - Result: docs/global, artifacts, audit, routing, and connectors surfaces are shells or error pages.

5. End-to-end workflow proof is impossible in current runtime state.
   - Freeform docs -> ACP planning -> prototype/review -> PM/dependency execution -> QA/UAT -> real-data E2E cannot be manually completed because core data/API surfaces are down.

## Web Route Sweep

| Route | Status | Issue hints | Screenshot |
| --- | ---: | --- | --- |
| dashboard | 200 | internal error visible | `screenshots/dashboard.png` |
| projects | 200 | none, but blank content area | `screenshots/projects.png` |
| project-new | 500 | HTTP 500; internal error visible | `screenshots/project-new.png` |
| docs | 200 | none, but blank content area | `screenshots/docs.png` |
| docs-global | 500 | HTTP 500; internal error visible | `screenshots/docs-global.png` |
| search | 200 | none | `screenshots/search.png` |
| inbox | 500 | HTTP 500; internal error visible | `screenshots/inbox.png` |
| runs | 200 | none | `screenshots/runs.png` |
| agents | 200 | none | `screenshots/agents.png` |
| planning | 200 | none | `screenshots/planning.png` |
| planning-sessions | 200 | none | `screenshots/planning-sessions.png` |
| repos | 200 | none | `screenshots/repos.png` |
| artifacts | 200 | none, but API 404 in backing call | `screenshots/artifacts.png` |
| audit | 502 | HTTP 502 | `screenshots/audit.png` |
| settings-flags | 500 | HTTP 500 | `screenshots/settings-flags.png` |
| settings-routing | 500 | HTTP 500; internal error visible | `screenshots/settings-routing.png` |
| settings-connectors | 500 | HTTP 500; internal error visible | `screenshots/settings-connectors.png` |
| settings-theme | 200 | none | `screenshots/settings-theme.png` |
| settings-api | 200 | none, but advertises web-host API that returns 404 | `screenshots/settings-api.png` |
| doctor | 200 | none | `screenshots/doctor.png` |
| dashboard-mobile | 200 | internal error visible | `screenshots/dashboard-mobile.png` |
| projects-mobile | 200 | blank content area | `screenshots/projects-mobile.png` |
| docs-mobile | 200 | blank content area | `screenshots/docs-mobile.png` |
| settings-flags-mobile | 500 | HTTP 500 | `screenshots/settings-flags-mobile.png` |

Additional terminal-style screenshots:

- `screenshots/cli-smoke-terminal.png`
- `screenshots/api-smoke-terminal.png`
- `screenshots/api-startup-terminal.png`
- `screenshots/tui-startup-terminal.png`

## Web UX / UI Critique

Severity: high.

- Core pages often render as empty application chrome. `/projects` and `/docs` show nav and breadcrumb but no useful empty state, no call to action, no explanation, and no visible loading/error boundary.
- The dashboard exposes a raw red failure line: `Failed to load dashboard: Internal Error`. This is useful for developers but hostile as product UX. It gives no recovery action, no route-specific cause, and no trace ID.
- Generic 500 pages erase context. `/projects/new` becomes centered `Something went wrong` with `Go home`, which loses the user's workflow and gives no retry, report, details, or diagnostic link.
- Top-right status says `Unreachable`, but affected pages still present controls as if the app is usable. The status is not connected to visible recovery guidance.
- The left navigation dominates every desktop screenshot. It is visually clear, but product hierarchy is too flat: Dashboard, Board, Docs, Planning, Runs, Artifacts, Portfolio, Search, Memory, Context, System, Agents, Orchestration, Audit, Doctor, Settings all compete at once.
- Breadcrumbs are present but thin. They do not compensate for blank content. When a page fails, breadcrumb context remains but task context is gone.
- Mobile header controls collide. `All projects` wraps into two lines in the top bar, making the header feel broken at phone width.
- Error styling is inconsistent. Dashboard shows inline red text; project-new shows generic centered error page; audit returns 502; settings pages mix 500 screens and blank states.
- Successful settings pages still feel disconnected from reality. `/settings/api` shows `http://127.0.0.1:5173/api/v1`, but direct smoke requests to those endpoints return 404.
- ACP Sessions page is one of the few complete-looking screens, but it is still form-heavy and lacks status visibility: no session preview, no stream panel, no validation affordance for required IDs, no visible persistence/history linkage above the fold.
- Form layout on ACP Sessions has clipped-looking IDs in right-side fields. Long IDs are central to traceability, but they are hard to inspect.
- Visual system is utilitarian and consistent, but too much of the current app reads like admin scaffolding rather than a guided workflow workbench.

## Workflow Critique

Expected workflow:

`freeform docs -> ACP planning -> prototype/boilerplate review -> PM task/dependency execution -> QA/review -> UAT/code review -> real-data E2E`

Observed:

- Docs workbench cannot be proven because `/docs` is blank and `/docs/global` fails through missing document API.
- ACP planning form is visible, but the live bridge/session persistence cannot be proven from the UI in this smoke pass.
- Prototype/boilerplate review and final review/UAT flows were not discoverable as an end-to-end user journey from the primary navigation.
- PM task/dependency execution surfaces are not coherent from the current nav. There is Board/Planning/Runs/Orchestration, but no obvious linear handoff from a planning session into task execution.
- QA/review/UAT surfaces are not obvious enough to smoke as workflow stages. A user has to infer which screen owns each step.
- Real-data E2E cannot be proven because both API and local DB initialization are failing.

## CLI Smoke

Commands run:

- `bun run apps/cli/src/main.ts --help` -> exit `0`
- `bun run apps/cli/src/main.ts version` -> exit `0`
- `bun run apps/cli/src/main.ts doctor --json` -> exit `0`
- `bun run apps/cli/src/main.ts projects --help` -> exit `0`
- `bun run apps/cli/src/main.ts projects list --json` -> exit `1`
- `bun run apps/cli/src/main.ts docs --help` -> exit `0`
- `bun run apps/cli/src/main.ts docs list --json` -> exit `1`
- `bun run apps/cli/src/main.ts search --help` -> exit `0`
- `bun run apps/cli/src/main.ts search smoke --json` -> exit `1`
- `bun run apps/cli/src/main.ts work --help` -> exit `1`
- `bun run apps/cli/src/main.ts runs --help` -> exit `0`

CLI issues:

- Help/version/doctor are usable.
- Data-backed CLI commands require server/API environment variables and cannot fall back to the running local web dev server.
- `search smoke --json` fails with: `Search API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL, FULCRUM_ORG_ID, FULCRUM_USER_ID, and FULCRUM_API_TOKEN or FULCRUM_PUBLIC_API_TOKEN.`
- `work --help` fails because `work` is not a command. This conflicts with the product workflow vocabulary around PM work execution.
- CLI is not currently workflow-equivalent with web/TUI because it cannot complete docs/search/project/task workflows without manual API configuration and a bootable API.

## API Smoke

Endpoints checked:

- `http://127.0.0.1:3000/`
- `http://127.0.0.1:3000/openapi`
- `http://127.0.0.1:3000/api/v1/docs`
- `http://127.0.0.1:3000/api/v1/audit`
- `http://127.0.0.1:5173/api/v1/docs`
- `http://127.0.0.1:5173/api/v1/artifacts`
- `http://127.0.0.1:5173/api/v1/audit`
- `http://127.0.0.1:5173/api/v1/connectors`
- `http://127.0.0.1:5173/api/v1/routing/rules`

API issues:

- All `:3000` requests fail because the API server never starts.
- Web-hosted `/api/v1/*` requests return `404`.
- `/settings/api` advertises an API base URL that is not backed by working routes in this dev setup.
- OpenAPI cannot be reviewed because the API runtime is down.

## TUI Smoke

Command:

- `bun run --cwd apps/tui dev` -> exit `1`

TUI issues:

- TUI exits before any interactive frame renders.
- No TUI workflow screenshot could be captured from the real app because startup crashes immediately.
- The terminal failure screenshot is saved as `screenshots/tui-startup-terminal.png`.

## Most Important Fix Order

1. Fix TypeORM decorator/runtime initialization so API and TUI boot.
2. Fix web local DB `__dirname` usage under current module/runtime mode.
3. Decide whether web dev should proxy `/api/v1/*` to API or mount public API routes itself; current settings page advertises a dead base URL.
4. Add route-level resilient empty/error states with trace IDs, retry, and diagnostics.
5. Rework workflow navigation from feature buckets into the actual end-to-end journey.
6. Make CLI local-first workflow commands usable without hidden API env setup, or make the env contract visible and generated by `doctor`.
7. Add mobile header constraints so scope/status controls do not wrap or collide.

## Bottom Line

Current app is not smoke-passable as a product workflow. It has visible shell structure and some isolated screens, but API/TUI startup failures, web database init failures, missing public API routes, blank content areas, and generic error pages block meaningful end-to-end testing.


## Remediation Pass - 2026-05-17 13:55 Asia/Amman

Status: smoke-passable after TypeORM/Nest/TUI runtime repair and current full verification. This section supersedes earlier blocker lists above; retained earlier notes remain useful as historical UX critique.

### Fixed Blockers

- API boots and binds on `http://127.0.0.1:3000`; current listener PID: `8130`.
- TUI boots and renders first interactive frame plus command palette. Current session remains running.
- Web no longer shows generic 500/502/blank-shell failures on the 24 smoked routes; web smoke result: `24 routes, 0 failures`.
- Local TypeORM/PGlite migration paths now use per-migration transaction mode where needed, fixing CLI/local web singleton migration startup failures.
- Workflow acceptance cycle now completes through server-owned services with shared trace/link IDs. Latest trace: `trace-manual-smoke-mp9npf55`; project: `project-manual-smoke-mp9npf55`.
- Generated real-data E2E artifacts are created and executed. Generated E2E command exit: `0`; generated files: `4`.
- Full `bun run ci` is green: install, typecheck, architecture, license-audit, ci:codegen, ci:schemas, unit, integration, build, web:check, web:build, web:test.

### Current Evidence

- Web route smoke: `node .scratch/manual-smoke-2026-05-17/web-smoke.mjs` -> `24 routes, 0 failures`; results: `web-smoke-results.json`.
- API endpoint smoke: `logs/api-workflow-endpoints-smoke.json` -> 7 endpoints, 0 failures; includes OpenAPI, doctor, organizations, docs, artifacts, audit, workflow trace summary.
- Full workflow smoke: `logs/workflow-acceptance-cycle-smoke.json` -> HTTP `201`, `ok=true`, trace `trace-manual-smoke-mp9npf55`.
- Generated E2E run: `logs/generated-e2e-run.json` -> exit `0`; command `bun run scripts/ci-generated-e2e.ts`.
- CLI workflow smoke: `logs/cli-workflow-acceptance-cycle.json` -> trace `trace-cli-smoke-mp9mwwsq`, tasks `4`, final QA `passed`, UAT/code review `approve_without_manual_review`, generated files `4`.
- TUI smoke: running session renders nav and command palette; screenshot `screenshots/tui-command-palette.png`.
- Screenshot index: `screenshot-index.json` -> 29 PNG screenshots.

### Current Screenshot Paths

- Screenshot directory: `/Users/mkh/workspace/fulcrum/.scratch/manual-smoke-2026-05-17/screenshots`
- Screenshot index: `/Users/mkh/workspace/fulcrum/.scratch/manual-smoke-2026-05-17/screenshot-index.json`
- TUI command palette: `screenshots/tui-command-palette.png`
- API smoke terminal: `screenshots/api-smoke-terminal.png`
- CLI smoke terminal: `screenshots/cli-smoke-terminal.png`
- Web desktop/mobile route screenshots: listed in `screenshot-index.json`.

### UX / Design Critique After Remediation

- Core blockers are gone, but the app still reads more like a feature inventory than a guided workflow. Navigation exposes domains, not the required journey: docs -> planning -> review -> execution -> QA -> UAT -> E2E.
- Empty states are better than failing screens only because smoke data/API now load; several screens still need stronger primary actions and route-specific next steps.
- Error recovery remains uneven. API/backend failures should surface route name, retry, diagnostics, and trace ID everywhere, not only developer logs.
- Mobile smoke no longer shows generic error pages, but header density and control wrapping still need visual tightening across workflow-heavy routes.
- Settings/inference route still triggers repeated server log noise when the embedded inference binary is absent. This is degraded optional backend behavior, not a boot blocker, but it should be quieter and clearer in UI diagnostics.
- TUI is smoke-passable, but selected-row highlighting/navigation feedback is weak in captured output. Command palette is visible; deeper workflow execution from TUI should get a richer manual script next pass.

### Remaining Non-Blocking Polish

- Reframe primary web nav around workflow stages while preserving domain routes.
- Add trace-ID-aware recovery panels to all core screens.
- Add a TUI manual smoke script that navigates every workflow domain and records terminal frames deterministically.
- Improve optional inference backend health: no repeated exception logs for expected missing local binary; expose one actionable degraded-status row instead.
- Reduce Svelte build warning backlog, especially stale `data` references and undefined `ScrollArea.Viewport` warning.

### Dev Servers Left Running

- API/NestJS: `http://127.0.0.1:3000`
- Web/SvelteKit: `http://127.0.0.1:5173`
- TUI: running in current session with `FULCRUM_SERVER_URL=http://127.0.0.1:3000` and seeded local user/org.
