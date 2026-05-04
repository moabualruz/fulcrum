# Testing Patterns

**Analysis Date:** 2026-05-04

## Test Framework

**Primary Runner (CLI/backend):**
- `bun:test` — Bun's built-in test runner
- 208 test files use `bun:test` across `src/` and `tests/`
- Config: none required (Bun discovers `.test.ts` files natively)

**Secondary Runner (Web/SvelteKit):**
- Vitest 4.x — for SvelteKit component tests
- 11 test files in `src/web/tests/vitest/`
- Config: `src/web/vitest.config.ts`
- Environment: `happy-dom`
- Setup file: `src/web/tests/setup.ts`

**E2E:**
- Playwright 1.59.x — browser-based end-to-end tests
- Config: `src/web/playwright.config.ts`
- 10 spec files in `src/web/tests/e2e/`
- Opt-in via `FULCRUM_RUN_E2E=1` env var (not in default CI)

**A11y:**
- axe-core via `@axe-core/playwright` — accessibility audits
- 5 test files in `src/web/tests/a11y/`
- Run via: `bun run web:a11y` (from `src/web/`)
- Uses SSR rendering + axe-core for violations

**Assertion Library:**
- `expect` from `bun:test` (backend)
- `expect` from `vitest` (web Vitest tests)
- `expect` from `@playwright/test` (e2e)

**Run Commands:**
```bash
bun test                              # Run all bun:test tests (root)
bun run scripts/test-root.ts          # Discover + run all non-web tests
bun run ci                            # Full CI pipeline (typecheck + test + build + web)
cd src/web && bun run web:test        # Vitest web component tests
cd src/web && bun run web:e2e         # Playwright e2e (needs FULCRUM_RUN_E2E=1)
cd src/web && bun run web:a11y        # Playwright a11y audits
```

## Test File Organization

**Location — Mixed strategy:**
1. **Co-located** (primary for CLI/core): test files next to source
   - `src/cli/install.test.ts` alongside `src/cli/install.ts`
   - `src/router/rules-engine.test.ts` alongside `src/router/rules-engine.ts`
   - `src/inference/client.test.ts` alongside `src/inference/client.ts`

2. **Top-level `tests/`** (integration/cross-cutting): mirrors `src/` domain structure
   - `tests/connectors/github-issues.test.ts`
   - `tests/db/repositories/repos/`
   - `tests/symphony/spec-lock.test.ts`
   - `tests/trpc/`, `tests/auth/`, `tests/memory/`

3. **`__tests__/` dirs** (occasional): used within some modules
   - `src/inference/backends/__tests__/backends.test.ts`
   - `src/orchestration/__tests__/symphony-conformance.test.ts`
   - `src/tui/__tests__/`

4. **Web tests** (Vitest + Playwright):
   - Vitest: `src/web/tests/vitest/*.test.ts`
   - E2E: `src/web/tests/e2e/*.spec.ts`
   - A11y: `src/web/tests/a11y/*.test.ts`
   - Co-located Svelte tests: `src/web/src/lib/components/**/*.test.ts` (201 files)

**Naming:**
- Backend: `{module}.test.ts` (co-located) or `{domain}.test.ts` (tests/ dir)
- E2E: `{feature}.spec.ts`
- A11y: `{route}.test.ts`

**Test Discovery:**
- `scripts/test-root.ts` collects all `.test.ts`/`.spec.ts` from `scripts/`, `src/`, `tests/`
- Skips `node_modules`, `.svelte-kit`, `dist`, `coverage`, and `src/web/` (separate pipeline)
- Passes discovered files to `bun test --conditions=svelte`

## Test Structure

**bun:test Suite Organization (standard pattern):**
```typescript
import { describe, expect, test, beforeEach, afterEach } from "bun:test";

describe("ComponentName", () => {
  // Setup/teardown
  let scratch: string;
  beforeEach(async () => {
    scratch = mkdtempSync(join(tmpdir(), "fulcrum-test-"));
  });
  afterEach(async () => {
    rmSync(scratch, { recursive: true, force: true });
  });

  // Grouped by operation
  describe("create", () => {
    test("creates with required fields", () => { /* ... */ });
    test("stores and retrieves by id", () => { /* ... */ });
  });

  describe("delete", () => {
    test("removes entry", () => { /* ... */ });
  });
});
```

**Section Dividers:**
- Comment banners used to separate test groups:
  ```typescript
  // ---------------------------------------------------------------------------
  // 1. ~/.agents/ guard
  // ---------------------------------------------------------------------------
  ```

**Patterns:**
- Temp directories via `mkdtempSync` + `afterAll`/`afterEach` cleanup
- Synchronous setup preferred when possible
- `test()` preferred over `it()` in bun:test (though `it` also used in connector tests)

## Test Utilities

**Location:** `src/test-utils/`

**Barrel export:** `src/test-utils/index.ts`
```typescript
export { adminSession, type TestSession } from "./auth.ts";
export { createTestContainer, type TestContainer } from "./container.ts";
export { createTestOrm, type CreateTestOrmOptions, type TestOrm } from "./db.ts";
export { createTestCaller } from "./trpc.ts";
```

**`createTestOrm()`** (`src/test-utils/db.ts`):
- Spins up in-memory PGlite instance
- Runs all MikroORM migrations
- Seeds default data via `SeedService`
- Returns `{ orm, em, pglite, seed, close }` — MUST call `close()` in teardown

**`createTestContainer()`** (`src/test-utils/container.ts`):
- Creates needle-di `Container` with DB bindings
- Accepts raw `MikroORM` or `TestOrm` instance
- Attaches seed result for test session resolution

**`createTestCaller()`** (`src/test-utils/trpc.ts`):
- Creates tRPC caller with auth context
- Auto-resolves admin session from seed data
- Full `appRouter` caller for integration tests

**`adminSession()`** (`src/test-utils/auth.ts`):
- Generates a `TestSession` with admin privileges
- Uses `DEFAULT_ADMIN_EMAIL` and `DEFAULT_ORG_ID` from seed
- Configurable overrides for userId, orgId, sessionToken

**TUI Testing:** `src/tui/testing/fake-tty.ts`
- `FakeTTY` — headless terminal driver
- Captures output via `TuiOutput.write()`
- Injects synthetic keypresses
- `tty.plainText()` for ANSI-stripped assertions

**Web Testing Mocks:** `src/web/tests/mocks/`
- `app-environment.ts` — stubs `$app/environment` (browser, building, dev, version)
- `app-forms.ts` — stubs `$app/forms`
- `app-navigation.ts` �� stubs `$app/navigation`
- `app-state.ts` — stubs `$app/state`

## Mocking

**bun:test Mocking:**
```typescript
import { spyOn } from "bun:test";
import * as proc from "../utils/proc.ts";

// Spy on module function
const spy = spyOn(proc, "run").mockResolvedValue({ code: 0, stdout: "", stderr: "" });
```

**Vitest Mocking:**
```typescript
import { vi } from "vitest";
vi.mock("$app/environment", () => ({ browser: false, dev: false }));
```

**Inline Mocks (common pattern):**
- Connector tests inject mock `fetch`:
  ```typescript
  const connector = new GitHubIssuesConnector({
    token: "token",
    repo: "owner/repo",
    fetch: async (input, init) => {
      requests.push(new Request(input, init));
      return Response.json([/* mock data */]);
    },
  });
  ```

**Standalone Mini-Routers:**
- tRPC router tests create isolated routers with in-memory stores instead of importing `appRouter`
- Avoids pulling full dependency tree for focused unit tests
- Pattern in `src/trpc/routers/artifacts.test.ts`

**What to Mock:**
- External API calls (fetch injection)
- File system (temp dirs, not mocks)
- Auth sessions (via `adminSession()`)
- tRPC context (via `createTestCaller()`)

**What NOT to Mock:**
- Database — use PGlite in-memory instances
- Migrations — run real migrations against PGlite
- Zod schemas — validate against real schemas

## Fixtures and Factories

**Database Seeding:**
```typescript
const testOrm = await createTestOrm();
const container = createTestContainer(testOrm);
const caller = await createTestCaller(container);
// testOrm.seed contains { orgId, userId, sessionToken }
```

**Inline Factories:**
```typescript
function row(overrides: Partial<ArtifactRow> = {}): ArtifactRow {
  return {
    id: ARTIFACT_ID,
    orgId: ORG_ID,
    filename: "report.md",
    ...overrides,
  };
}
```

**Temp Directory Pattern:**
```typescript
const scratch = mkdtempSync(join(tmpdir(), "fulcrum-test-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
```

**Fixture Files:**
- `tests/scripts/license-audit.fixtures/` — file-based fixtures for license audit tests
- `src/web/tests/e2e/fixtures.ts` — Playwright page fixtures

## Coverage

**Requirements:** None enforced — currently at ~0% formal coverage tracking

**Planned:**
- 108 test issues planned across 10 phases (documented in `.planning/scratch/test-coverage-plan.md`)
- Test gaps identified in infrastructure, DB, tRPC, CLI, web domains

**No Coverage Tool Configured:**
- No `c8`, `istanbul`, or `@vitest/coverage-*` in dependencies
- No coverage thresholds in CI

## CI Pipeline

**Runner:** `scripts/ci.ts` — local CI script (no GitHub Actions)

**Steps (in order):**
| Step | Command | What it checks |
|------|---------|----------------|
| `install` | `bun install --frozen-lockfile` | Lockfile integrity |
| `typecheck` | `bun run --bun tsc --noEmit` | TypeScript compilation |
| `symphony:lock` | `bun test tests/symphony/spec-lock.test.ts` | Symphony spec lockfile |
| `symphony:conformance` | `bun test src/orchestration/__tests__/symphony-conformance.test.ts` | Symphony protocol conformance |
| `test` | `bun run scripts/test-root.ts` | All non-web tests |
| `license-audit` | `bun run scripts/license-audit.ts` | Dependency license compliance |
| `ci:codegen` | `bun run scripts/ci/codegen.ts` | Generated code freshness |
| `build:all` | `bun run scripts/build-all.ts` | Binary compilation |
| `web:install` | `bun install --frozen-lockfile` (in `src/web/`) | Web lockfile integrity |
| `web:check` | `bun run check` (in `src/web/`) | svelte-check TypeScript |
| `web:build` | `bun run build` (in `src/web/`) | SvelteKit production build |
| `web:test` | `bun run web:test` (in `src/web/`) | Vitest component tests |
| `ci:schemas` | `bun run scripts/ci-schemas.ts` | Schema validation |
| `skills:lint` | `bun run src/index.ts skills lint skills/` | Skills linting |
| `compress:check` | `bash scripts/compress-with-caveman.sh --check` | Compression check |
| `web:e2e` | (opt-in: `FULCRUM_RUN_E2E=1`) | Playwright e2e tests |

**Sandbox:** CI uses isolated `HOME` dir (`/tmp/fulcrum-ci-home-{pid}`) to prevent test pollution.

**Soft-fail steps:** `compress:check` can soft-fail with pending file count.

## Test Types

**Unit Tests:**
- Scope: individual functions, stores, utilities, Zod schemas
- Pattern: direct import + assert, no DB
- Examples: `src/flags/experiments.test.ts`, `src/data/csv.test.ts`, `src/filters/ast.test.ts`

**Integration Tests (DB-backed):**
- Scope: repository + migration + seed lifecycle
- Pattern: `createTestOrm()` → `createTestContainer()` → `createTestCaller()`
- Examples: `src/product-kernel/sprints.test.ts`, `tests/db/repositories/`

**tRPC Router Tests:**
- Two approaches:
  1. **Standalone mini-router** — isolated, no appRouter dependency (`src/trpc/routers/artifacts.test.ts`)
  2. **Full caller** — `createTestCaller()` with PGlite (`tests/trpc/`)

**TUI Tests:**
- Headless via `FakeTTY` — no real terminal needed
- Located in `src/tui/__tests__/`
- Inject keypresses, assert rendered output

**Web Component Tests (Vitest):**
- `@testing-library/svelte` for Svelte 5 components
- happy-dom environment
- Located in `src/web/tests/vitest/`
- Pattern:
  ```typescript
  import { cleanup, render, waitFor } from "@testing-library/svelte";
  import { afterEach, describe, expect, test } from "vitest";
  import DocEditor from "../../src/lib/components/editor/DocEditor.svelte";

  describe("DocEditor", () => {
    afterEach(cleanup);
    test("renders toolbar controls", async () => {
      const { getByLabelText } = render(DocEditor, { props: { content: { /* ... */ } } });
      await waitFor(() => expect(getByLabelText("Bold")).toBeTruthy());
    });
  });
  ```

**E2E Tests (Playwright):**
- Browser-based, Chromium only
- Dev server auto-started with isolated `FULCRUM_HOME`
- Located in `src/web/tests/e2e/*.spec.ts`
- Pattern:
  ```typescript
  import { expect, test } from "@playwright/test";
  test("home page loads with Fulcrum in title", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Fulcrum/i);
  });
  ```

**A11y Tests:**
- SSR render Svelte components → parse HTML → run axe-core
- Located in `src/web/tests/a11y/`
- Pattern:
  ```typescript
  import { auditRoute } from "./runs-helpers";
  test("no axe-core serious/critical violations on /runs", async () => {
    const { body } = render(Page, { props: { data: { /* ... */ } } });
    // axe-core audit against rendered HTML
  });
  ```

## Common Patterns

**Async Testing (bun:test):**
```typescript
test("async operation works", async () => {
  const result = await someAsyncFn();
  expect(result.status).toBe("active");
});
```

**Error Testing (bun:test):**
```typescript
test("throws for invalid input", () => {
  expect(() => assertNotAgentsPath(`${home}/.agents`, home)).toThrow("HARD RULE VIOLATION");
});

test("async rejection", async () => {
  await expect(connector.pull()).rejects.toThrow("connector disabled");
});
```

**Database Lifecycle Pattern:**
```typescript
async function freshDb(name: string) {
  const db = await openPglite(join(scratch, name));
  await runMigrations(db);
  return db;
}

describe("domain", () => {
  test("lifecycle", async () => {
    const db = await freshDb("test-name");
    try {
      // ... test logic
    } finally {
      // cleanup if needed
    }
  });
});
```

**Console Capture:**
```typescript
test("logs warning for missing input", async () => {
  const warnings: string[] = [];
  const origWarn = console.warn;
  console.warn = (...args: unknown[]) => { warnings.push(String(args[0])); };
  try {
    // ... test that triggers warning
    expect(warnings.some(w => w.includes("not found"))).toBe(true);
  } finally {
    console.warn = origWarn;
  }
});
```

---

*Testing analysis: 2026-05-04*
