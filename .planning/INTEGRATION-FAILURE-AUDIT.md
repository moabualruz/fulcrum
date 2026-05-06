# Integration Failure Audit

Date: 2026-05-06

## Status

This project is not acceptable by the requested acceptance bar.

Compilation, unit tests, isolated route-load tests, and route existence do not prove that Fulcrum features are usable. A feature is not accepted unless it is proven through:

- Playwright E2E tests that drive the real web UI in a browser.
- CLI integration tests that run the real `fulcrum` command surface.
- TUI integration tests that instantiate/navigate real TUI screens.
- Backend integration tests that prove every interface uses the same service/ORM path.
- Cross-surface parity tests proving web, CLI, TUI, API, and background flows operate on the same data model.

Current evidence shows several phases implemented code without sufficient routing, navigation, action wiring, service boundaries, or non-fake E2E coverage.

## Immediate Findings

### F-001: Web DB Access Was Split

Severity: critical

Observed:

- Web runtime had code paths opening PGlite directly and running product-kernel SQL migrations outside the web DB manager.
- `$lib/server/db` has now been partially moved to an ORM-backed compatibility handle.
- `$lib/product-queries` previously opened PGlite directly; board/sprint/project pages using it could read/write through a different DB path than the web runtime.
- CSV import/export API routes also opened PGlite directly before the current repair pass.

Why unacceptable:

- Same feature could appear empty in web while data exists elsewhere.
- Migrations, schema shape, and service behavior diverged.
- Tests using scratch PGlite could pass while dev server showed stale/empty UI.

Required fix:

- One runtime DB manager for all app surfaces.
- No direct `openPglite`, `runMigrations`, or product-kernel migration calls from web runtime code.
- One migration authority.
- One ORM/repository/service boundary for all feature data.

### F-002: Web Pages Are Routed But Not Product-Integrated

Severity: critical

Observed:

- `src/web/src/routes` contains 199 route files.
- Many pages exist as route files but are not necessarily linked from primary navigation, command palette, project navigation, settings navigation, or contextual actions.
- Sidebar and command palette were stale enough that major routes existed but were hidden from normal use.
- Some route loads returned empty data because service adapters were stubs or pointed at wrong paths.

Why unacceptable:

- A route existing in the filesystem is not a shipped feature.
- A page that cannot be discovered or reached from normal product flows is not integrated.
- A page that renders skeleton/empty state because its service is not configured is not accepted.

Required fix:

- Route inventory with owner feature, nav entry, command palette entry, backlink/contextual entry, auth state, empty state, action list, and E2E proof.
- Every route must have either an intentional product path or be deleted/hidden behind explicit feature flag.

### F-003: E2E Test Coverage Is Not a Real Acceptance Gate

Severity: critical

Observed:

- `src/web/tests/e2e` has 17 spec files.
- There are at least 37 skip/guard/weak-assertion patterns, including:
  - `test.skip(...)` based on SSR failures or missing UI.
  - `if (isPlaywrightCli)` wrappers that make files inert under non-Playwright runners.
  - Assertions like `toHaveCount(await locator.count())`, which are tautological and can never validate expected count.
- Root CI only runs `web:e2e:full` when `FULCRUM_RUN_E2E=1`.
- Some existing E2E files explicitly skip known SSR failures instead of failing the build.
- Actual run on 2026-05-06:
  - Command: `cd src/web && bun run web:e2e:smoke`
  - Playwright reported `2 passed`.
  - Dev server logged `500 GET /`.
  - Error: `column "project_id" does not exist`.
  - Therefore the smoke suite passed while the home route server-side load failed.

Why unacceptable:

- Playwright tests that skip when the page is broken are not acceptance tests.
- Unit tests and route-load tests can pass while browser navigation, data persistence, and user actions are broken.
- Optional full E2E means major integration gaps can survive normal CI.
- A smoke test that accepts a global error page because the title still contains "Fulcrum" is worse than no smoke test: it creates false confidence.

Required fix:

- Full Playwright E2E must be mandatory for release/acceptance.
- Remove conditional skips that hide broken routes.
- Replace tautological assertions with fixed expected outcomes.
- Add route smoke that fails on HTTP 500, login redirect unless expected, global error pages, missing `main`, console errors, hydration errors, and missing primary actions.
- Every `page.goto()` must assert `response?.ok()` unless the test explicitly expects an error route.
- Every page smoke must assert that the route did not render SvelteKit's global error page.

### F-004: Backend Boundary Is Not Coherent

Severity: critical

Observed:

- Web pages contain direct SQL queries in page server files.
- Services, product-kernel store functions, tRPC routers, Hono/API routes, and MikroORM repositories coexist without one enforced boundary.
- Some service functions still branch between raw ProductDb and EntityManager.
- Route actions sometimes call local SQL, sometimes call tRPC proxies, sometimes call product-kernel functions.

Why unacceptable:

- Security and tenancy rules cannot be enforced consistently.
- Authorization, validation, audit logging, transactions, and events can be bypassed.
- CLI/TUI/web parity becomes accidental instead of architectural.

Required fix:

- Define one backend application boundary.
- UI routes may call backend/service APIs, not hand-write feature SQL.
- All writes go through commands/services with validation, authz, events, and transactions.
- All reads go through query services/repositories with tenant scoping.

### F-005: Migrations Are Fragmented

Severity: critical

Observed:

- Product-kernel SQL migrations and MikroORM migrations both exist.
- Tests seed older SQL schema while runtime code expects newer ORM columns.
- Runtime had to add compatibility fallbacks for missing columns.

Why unacceptable:

- Tests can validate old schema while app uses new schema.
- Local dev DB can be half-migrated and produce stale/empty pages.
- Feature implementation becomes schema guessing.

Required fix:

- One migration system.
- Migration compatibility policy for existing local data.
- Tests must seed through the same migration path as runtime.

### F-006: Cross-Interface Parity Is Not Proven

Severity: critical

Observed:

- Project has web, CLI, TUI, API, services, and DB layers, but no complete parity matrix proving each feature exists and works in each required surface.
- CLI/TUI tests are not currently tied to the same acceptance scenarios as web E2E.

Why unacceptable:

- Feature parity can be claimed in planning while implementation only exists in one interface.
- CLI/TUI can drift or remain stale while web receives partial implementation.

Required fix:

- Build a feature-by-interface matrix:
  - Web route/actions.
  - CLI command/subcommand/options.
  - TUI screen/actions/keybindings.
  - API/tRPC endpoint.
  - Service/ORM path.
  - E2E/integration test proof.
  - Missing/deferred/blocked status.

### F-007: Current Tests Include Broken or Non-Representative Cases

Severity: high

Observed during current run:

- Focused test run exposed `product-queries.test.ts` importing `listSprintTasks`, which is not exported from `src/web/src/lib/product-queries.ts`.
- Several route-load tests pass without browser, navigation, hydration, actions, or visual/product behavior.
- Existing Playwright tests include self-skipping paths for known broken SSR pages.

Why unacceptable:

- Tests can create false confidence.
- Broken exports and missing integration are not caught as a product-level failure.

Required fix:

- Classify tests as unit, component, route-load, backend integration, CLI integration, TUI integration, Playwright E2E.
- Mark route-load-only coverage as insufficient for feature acceptance.
- Remove fake/tautological tests.

## Architecture Position

I cannot justify the current architecture as acceptable.

### Primary Requirement: One Unified Data Manipulation Layer

The first architectural requirement is not "use Hono", "use tRPC", "use NestJS", or "use SvelteKit actions".

The first architectural requirement is:

> Every interface manipulates Fulcrum data through one application data layer.

Required shape:

```text
web / cli / tui / api / agents
  -> application commands + queries
  -> ORM repositories / EntityManager
  -> database
```

Non-negotiable interface rule:

> No business logic repetition between interfaces.

Interfaces may only:

- Parse surface-specific input.
- Call application command/query services.
- Render or serialize results.
- Map application errors to surface-specific errors.

Interfaces may not own:

- Business rules.
- Validation rules beyond transport parsing.
- Permission or tenant rules.
- DB queries or mutations.
- Event/audit/notification side effects.
- Workflow state transitions.
- DTO shape decisions beyond presentation formatting.

Forbidden shape:

```text
web page SQL
cli direct DB writes
tui direct DB writes
product-kernel SQL stores as runtime API
tRPC routers with business logic
Hono handlers with business logic
multiple migration systems
```

This means:

- One write path: application command services.
- One read path: application query services.
- One ORM path: MikroORM, unless replaced by a deliberate architecture decision.
- One migration authority.
- One validation/authz/audit/event path.
- Surface code is adapter code only.

Target structure:

```text
src/application/tasks/
  task.commands.ts
  task.queries.ts
  task.service.ts
  task.schema.ts

src/server/trpc/routers/tasks.ts   # adapter only
src/api/routes/tasks.ts            # REST adapter only
src/web/routes/.../+page.server.ts # adapter only
src/cli/commands/tasks.ts          # adapter only
src/tui/screens/tasks.ts           # adapter only
```

Dependency rule:

```text
interfaces -> application -> db
```

No reverse dependencies. No bypasses.

Boundary enforcement required:

- `src/web`, `src/cli`, `src/tui`, `src/api`, and `src/server/trpc` cannot import `src/db` directly.
- Interface folders cannot import `product-kernel/db`, `openPglite`, `runMigrations`, or raw migration helpers.
- Interface folders cannot call `.query(` except inside explicitly approved low-level adapter shims during migration.
- Feature acceptance requires parity tests proving web, CLI, TUI, REST/tRPC, and application services use the same command/query path.

What is defensible:

- Local-first storage remains a valid product constraint.
- SvelteKit can be valid for SSR/UI if page files are thin and call a real backend/service boundary.
- MikroORM can be the single DB/ORM layer.
- Existing dependencies like Hono, tRPC, Zod, and MikroORM can support a coherent backend without immediately adding a new framework.

What is not defensible:

- Scattered page-level SQL as the feature backend.
- Multiple DB managers/migration systems.
- Tests that skip broken routes.
- Phase acceptance based on unit tests without Playwright E2E and interface parity.
- Features implemented in code but absent from navigation, actions, CLI, TUI, or shared services.

NestJS with Bun may be a valid direction, but it should be a researched architecture decision, not an anger-driven rewrite. The architectural requirement is not specifically "NestJS"; it is:

- One backend boundary.
- One ORM/data access policy.
- One validation/authz/event/audit path.
- Thin UI adapters.
- Surface parity from web/CLI/TUI/API through shared services.

Candidate backend directions to research before deciding:

- Keep SvelteKit UI, extract backend to Hono/tRPC service modules already present in repo.
- Keep SvelteKit UI, introduce NestJS-style module/service/controller architecture if dependency/runtime tradeoffs are acceptable.
- Split `src/server` as the only backend and make SvelteKit pages call it through typed clients.

API stance to validate:

- tRPC should be the first-party typed API for web/CLI/TUI/agent adapters.
- Hono or another REST/OpenAPI layer should be the external/stable HTTP API adapter.
- Both tRPC and REST must call the same application command/query services.
- Neither tRPC routers nor REST handlers may contain feature data manipulation logic.

No backend decision should be made until current codebase integration points, migration blast radius, and runtime compatibility are mapped.

## Required Audit Work

Initial inventory artifacts:

- `.planning/audit/web-route-files.txt` — 199 web route files.
- `.planning/audit/web-e2e-files.txt` — 17 Playwright spec files.
- `.planning/audit/web-e2e-weak-patterns.txt` — 37 weak/skip/guard patterns.
- `.planning/audit/cli-tui-test-files.txt` — 62 CLI/TUI test files.
- `.planning/audit/cli-tui-source-files.txt` — 272 CLI/TUI source files.
- `.planning/audit/db-access-raw-grep.txt` — raw DB/query access inventory seed.

### A. Route And Navigation Audit

Produce `.planning/audit/web-route-inventory.md`.

For each web route:

- File path.
- Product feature.
- Navigation entry.
- Command palette entry.
- Parent/contextual links.
- Server load source.
- Actions/forms.
- API/tRPC/service dependencies.
- Auth/tenant behavior.
- Empty/error/loading states.
- Playwright coverage.
- Verdict: accepted, partial, fake, broken, orphan, delete.

### B. Backend Boundary Audit

Produce `.planning/audit/backend-boundary-inventory.md`.

Map all DB access:

- Direct SQL in web routes.
- Direct SQL in services.
- Product-kernel store calls.
- MikroORM repository calls.
- tRPC routers.
- Hono/API routes.
- Event/audit dispatchers.
- Transaction boundaries.
- Tenant scoping.

### C. Migration Audit

Produce `.planning/audit/migration-inventory.md`.

Map:

- Product-kernel SQL migrations.
- MikroORM migrations.
- Tests using old schema.
- Runtime using new schema.
- Missing downgrade/upgrade coverage.
- Existing local DB compatibility requirements.

### D. Test Authenticity Audit

Produce `.planning/audit/test-authenticity-inventory.md`.

Classify every test:

- Unit.
- Component.
- Route-load.
- Backend integration.
- CLI integration.
- TUI integration.
- Playwright E2E.
- Fake/weak/tautological.
- Skips broken behavior.
- Uses real app server/browser or not.

### E. Cross-Interface Feature Parity Audit

Produce `.planning/audit/interface-parity-matrix.md`.

For every phase feature:

- Requirement ID.
- Web UI presence.
- Web action works.
- API/tRPC endpoint works.
- CLI command works.
- TUI screen/action works.
- Same backend/service path.
- Same DB schema.
- Same event/audit behavior.
- E2E/integration proof.
- Gap owner.

### F. UI/UX System Audit

Produce `.planning/audit/ui-ux-system-audit.md`.

Review:

- Design language consistency.
- Layout density and information architecture.
- Stale placeholder pages.
- Orphan pages.
- Inconsistent controls.
- Missing empty/error/loading states.
- Web/TUI/CLI conceptual parity.
- Accessibility and keyboard flow.

## New Acceptance Bar

No phase or feature is accepted unless all are true:

- Real Playwright E2E covers browser navigation and user actions.
- CLI integration test covers same workflow where CLI surface exists.
- TUI integration test covers same workflow where TUI surface exists.
- Backend integration test proves service/ORM persistence and event/audit side effects.
- Tests run in normal CI, not only optional env mode.
- No `test.skip` for broken product behavior.
- No tautological assertions.
- No route-level feature SQL outside approved query adapters.
- No duplicate DB managers or migration paths.
- Navigation and command palette expose the feature where expected.
- UI page shows real data from the same backend path as other interfaces.

## Immediate Stop/Continue Rule

Stop adding Phase 10 features.

Next work must be:

1. Finish this audit with generated inventories.
2. Run real Playwright smoke/full suites and record failures.
3. Run CLI/TUI integration inventory and record missing tests.
4. Decide backend architecture with research.
5. Repair architecture before feature closure.
