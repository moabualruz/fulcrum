# Test Scenarios — Detailed Specifications

Each scenario maps to an issue in `.scratch/test-coverage/issues/`. Scenarios
are grouped by phase and include the exact test file path, setup, steps, and
assertions.

---

## Phase 1: Infrastructure

### S-P1-01: Migration compatibility

**File:** `tests/infrastructure/migration-compat.test.ts`
**Framework:** bun test + PGlite

```
Setup:
  - Fresh PGlite instance (in-memory or tmpdir)

Steps:
  1. Read all *.sql files from src/product-kernel/db/migrations/ in alphabetical order
  2. For each file, execute via db.exec(sql)
  3. After all migrations: query pg_catalog.pg_tables for expected tables

Assertions:
  - Zero errors during migration execution
  - All expected tables exist: orgs, projects, tasks, documents, events,
    search_documents, agent_runs, notification_rules, notifications, saved_searches,
    sprints, memories, artifacts, repos, connector_sync_log, feature_flags
  - No duplicate table definitions across migration files
  - No ALTER TABLE on columns that already exist in CREATE TABLE of same file
```

### S-P1-02: Dev server smoke

**File:** `tests/infrastructure/dev-server-smoke.test.ts`
**Framework:** bun test (spawns vite dev, uses fetch)

```
Setup:
  - Set FULCRUM_HOME to tmpdir
  - Spawn `npx vite dev --port <random>` from src/web/
  - Wait for "ready in" stdout

Steps:
  1. GET / → expect 200 (not 302 — dev mode auto-session)
  2. GET /doctor → expect 200
  3. GET /auth/login → expect 200
  4. GET /nonexistent → expect 404
  5. Check Vite stdout for zero "500" or "SyntaxError" lines

Assertions:
  - HTTP 200 on /, /doctor, /auth/login
  - HTTP 404 on /nonexistent
  - No SSR errors in server output

Teardown:
  - Kill vite process
  - Remove tmpdir
```

### S-P1-03: SvelteKit export validation

**File:** `tests/infrastructure/sveltekit-exports.test.ts`
**Framework:** bun test (static file analysis)

```
Steps:
  1. Glob src/web/src/routes/**/+page.server.ts
  2. For each file, parse exports using regex or AST
  3. Valid exports: load, actions, prerender, csr, ssr, trailingSlash, config, entries, _*
  4. Flag any export not in that set

Assertions:
  - Zero invalid exports across all +page.server.ts files
```

### S-P1-04: Auth mode

**File:** `tests/infrastructure/auth-mode.test.ts`
**Framework:** bun test (two vite spawns)

```
Test 1 — Dev mode (no FULCRUM_REQUIRE_AUTH):
  - Start vite dev
  - GET / → 200 (auto-session)
  - Response contains "Dashboard" not "Log in"

Test 2 — Auth mode (FULCRUM_REQUIRE_AUTH=1):
  - Start vite dev with env
  - GET / → 302 redirect to /auth/login
  - GET /doctor → 200 (exempt from auth)
```

### S-P1-05: Default org auto-seeding

**File:** `tests/infrastructure/default-org-seeding.test.ts`
**Framework:** bun test + PGlite

```
Steps:
  1. Open fresh PGlite via openProductDb()
  2. Query: SELECT * FROM orgs WHERE slug = 'default'

Assertions:
  - Exactly 1 row returned
  - slug = 'default', name = 'Local'
  - Calling openProductDb() again does not create duplicate
```

### S-P1-06: Feature flag gating consistency

**File:** `tests/infrastructure/feature-flag-gating.test.ts`
**Framework:** Playwright

```
Setup:
  - Start dev server with FULCRUM_FEATURES="" (all off)

Steps:
  For each gated route:
    /settings/i18n, /settings/experiments, /settings/billing,
    /settings/api, /api/v1/openapi.json
  1. GET route → expect 404
  2. Restart with FULCRUM_FEATURES=<flag>
  3. GET route → expect 200

Assertions:
  - Gated routes return 404 when flag OFF
  - Gated routes return 200 when flag ON
  - No route leaks (returns 200 with flag OFF)
```

---

## Phase 2: tRPC Integration (selected key scenarios)

### S-P2-08: Sprint close dispositions

**File:** `tests/trpc/sprints-close.test.ts`
**Framework:** bun test + PGlite + tRPC caller

```
Setup:
  - PGlite with migrations
  - Create org, project, sprint (active), 5 tasks assigned

Steps:
  1. Complete 3 tasks (status=done)
  2. Call sprints.close with unfinishedDisposition="backlog"
  3. Verify: 2 tasks have sprint_id=null
  4. Create new sprint (planned)
  5. Create another active sprint with 3 tasks, complete 1
  6. Call sprints.close with unfinishedDisposition="next-sprint"
  7. Verify: 2 tasks moved to the planned sprint's ID

Assertions:
  - Backlog disposition: sprint_id set to null
  - Next-sprint disposition: sprint_id set to next planned sprint
  - No next sprint → falls back to backlog (sprint_id=null)
  - Metrics snapshot has non-empty UUID
  - Event payload metrics_snapshot.id matches metrics row ID
```

### S-P2-10: Hybrid search params

**File:** `tests/trpc/hybrid-search.test.ts`
**Framework:** bun test + PGlite

```
Setup:
  - PGlite with search_documents table populated
  - 10 documents with varied content

Steps:
  1. Call queryHybridSearchDocuments with q="deploy" and mock embedQuery
  2. Verify: FTS WHERE clause uses the query text, not a timestamp
  3. Results contain documents mentioning "deploy"
  4. Results do NOT contain unrelated documents

Assertions:
  - Params array positionally matches WHERE clause placeholders
  - $2 resolves to query text, not now() timestamp
  - Result set is correct (FTS filter applied)
```

### S-P2-14: Webhook retry timing

**File:** `tests/trpc/webhook-retry.test.ts`
**Framework:** bun test + mocked clock

```
Setup:
  - Webhook subscription + delivery row

Steps:
  1. Stub fetch to return 500 for first 3 calls, 200 for 4th
  2. Call deliverWithRetry()
  3. Record timestamps of each attempt

Assertions:
  - Attempts are NOT all within 100ms (current bug: synchronous loop)
  - After fix: delays match exponential backoff schedule
  - Final success: delivery status = 'delivered'
  - nextRetryAt timestamps in DB match actual delay
```

---

## Phase 3: Playwright Web Routes (selected key scenarios)

### S-P3-01: Doctor dashboard

**File:** `src/web/tests/e2e/doctor.spec.ts`
**Framework:** Playwright

```
Steps:
  1. Navigate to /doctor (no auth needed)
  2. Wait for table to render

Assertions:
  - Page title contains "Doctor"
  - Table has ≥17 rows (one per subsystem)
  - Each row has: subsystem name, status badge, message, timestamp
  - "Refresh now" button exists and is clickable
  - At least "Foundation" subsystem shows "OK"
  - "Inference" may show "FAIL" — verify recovery button appears
```

### S-P3-Dashboard: Dashboard with data

**File:** `src/web/tests/e2e/dashboard.spec.ts`
**Framework:** Playwright

```
Setup:
  - Seed PGlite with: 2 projects, 5 tasks, 3 docs

Steps:
  1. Navigate to /
  2. Verify metric cards show correct counts
  3. Click "Projects" card → navigates to /projects
  4. Go back → click a project in the list → navigates to project page

Assertions:
  - Metric cards: Projects=2, Open tasks=5, Docs=3
  - Navigation works from dashboard
  - No "Failed to load" error messages
```

---

## Phase 4: TUI Integration (all scenarios)

### S-P4-01: Screen render smoke

**File:** `tests/tui/screen-smoke.test.ts`
**Framework:** bun test + FakeTTY

```
Steps:
  For each screen in src/tui/screens/*.ts:
  1. Instantiate with minimal mock dependencies
  2. Call render(fakeTTYRenderer)
  3. Verify no throw

Assertions:
  - All screens render without crash
  - Output contains at least one non-empty line
  - No unhandled promise rejections
```

### S-P4-02: Keyboard navigation

**File:** `tests/tui/keyboard-nav.test.ts`
**Framework:** bun test

```
Steps:
  1. TaskListScreen: j/k navigate, Space selects, B opens bulk menu
  2. SprintsScreen: C opens close overlay, b/n selects disposition, q cancels
  3. DocsReaderEditor: e enters edit, h opens history, q exits
  4. MemoryBrowser: g toggles global filter (not G)
  5. NotificationsScreen: R marks read, M toggles mute

Assertions:
  - Each key handler returns true (handled)
  - State changes correctly after key press
  - Overlay transitions work
```

---

## Phase 7: Cross-Surface E2E (maps to USER-JOURNEYS.md)

Each journey J01-J14 becomes a Playwright + CLI hybrid test.

**File pattern:** `tests/e2e/journey-<NN>.spec.ts`
**Framework:** Playwright + child_process.exec for CLI steps

```
Shared setup:
  - Fresh FULCRUM_HOME tmpdir
  - Dev server started via Playwright webServer config
  - PGlite auto-initialized with default org

Each journey test:
  1. Execute CLI steps via exec(`bun run src/index.ts <args>`)
  2. Navigate web routes via Playwright page
  3. Assert data consistency across surfaces
```

---

## Phase 8: Gate Regression Tests

**File:** `tests/regressions/gate-findings.test.ts`
**Framework:** bun test + PGlite (no mocks)

One test per gate finding from the table in TEST-GAPS.md. Each test
reproduces the exact bug scenario and asserts the fix holds.
