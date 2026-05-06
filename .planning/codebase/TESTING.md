# Testing Patterns

**Analysis Date:** 2026-05-06

## Test Framework

**Runner:**
- Bun test for root unit, integration, service, CLI, DB, and most Svelte SSR tests.
- Vitest 4.1.5 for selected web component/unit coverage under `src/web/tests/vitest/**/*.test.ts`.
- Playwright 1.59.1 for web browser smoke, accessibility, and full e2e tests under `src/web/tests/`.
- Config: root `bunfig.toml`, root `scripts/test-root.ts`, web `src/web/vitest.config.ts`, web `src/web/playwright.config.ts`.

**Assertion Library:**
- Bun assertions via `expect` from `bun:test`: `src/services/TaskService.test.ts`, `tests/db/migrator-service.test.ts`.
- Vitest assertions for web vitest suites configured by `src/web/vitest.config.ts`.
- Playwright assertions via `expect` from `@playwright/test`: `src/web/tests/e2e/phase08-surface-delivery.spec.ts`.

**Run Commands:**
```bash
bun run ci                                # Full local CI gate
bun test                                  # Raw Bun test runner
bun run scripts/test-root.ts              # Root test discovery excluding src/web and tests/a11y
bun run scripts/test-root.ts --coverage   # Root coverage gate
(cd src/web && bun run check)             # SvelteKit + svelte-check
(cd src/web && bun run test)              # Bun Svelte lib tests
(cd src/web && bun run web:test)          # Vitest web tests
(cd src/web && bun run web:test -- --coverage) # Vitest coverage
(cd src/web && bun run web:a11y)          # Playwright accessibility subset
(cd src/web && bun run web:e2e:smoke)     # Playwright smoke
FULCRUM_RUN_E2E=1 bun run ci              # Include full Playwright e2e in CI script
```

## Test File Organization

**Location:**
- Co-located root unit tests live beside implementation: `src/router/rules-engine.test.ts`, `src/services/TaskService.test.ts`, `src/cli/doctor.test.ts`.
- Cross-domain root tests live under `tests/<domain>/`: `tests/db/migrator-service.test.ts`, `tests/api/rest-parity.test.ts`, `tests/orchestration/dispatch-loop.test.ts`.
- Web route server/component tests live beside routes with framework names stripped from test names: `src/web/src/routes/boards/page.server.test.ts`, `src/web/src/routes/boards/page.svelte.test.ts`.
- Web Playwright tests live under `src/web/tests/e2e/` and `src/web/tests/a11y/`.
- Vitest tests are selected by `src/web/vitest.config.ts` include pattern `tests/vitest/**/*.test.ts`.

**Naming:**
- Use `.test.ts` for Bun and Vitest.
- Use `.spec.ts` for Playwright.
- For SvelteKit route tests, name by route artifact: `page.server.test.ts`, `page.svelte.test.ts`, `server.test.ts`.
- Keep phase/parity names when tests encode milestone gates: `src/api/__tests__/phase08-api-parity.test.ts`, `tests/parity/p13-three-surfaces.test.ts`.

**Structure:**
```text
src/<domain>/*.test.ts                 # Co-located root tests
tests/<domain>/*.test.ts               # Cross-domain root tests
src/web/src/routes/**/page.server.test.ts
src/web/src/routes/**/page.svelte.test.ts
src/web/tests/e2e/*.spec.ts
src/web/tests/a11y/*.test.ts
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, expect, test, beforeEach, afterEach } from "bun:test";

describe("/boards +page.server.ts load()", () => {
  beforeEach(() => {
    scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-boards-"));
    process.env["FULCRUM_HOME"] = scratch;
  });

  afterEach(() => {
    delete process.env["FULCRUM_HOME"];
    rmSync(scratch, { recursive: true, force: true });
  });

  test("project search-param narrows tasks to that project", async () => {
    const ids = await seedTasks();
    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load(fakeLoadEvent({ project: ids.alphaProjectId }));
    const payload = await streamedData<BoardPayload>(result);
    expect(payload.tasks).toHaveLength(2);
  });
});
```

**Patterns:**
- Use `describe()` around domain/route behavior and `test()` or `it()` for behavior names: `src/router/rules-engine-hot-reload.test.ts`, `src/web/src/routes/boards/page.server.test.ts`.
- Use `beforeEach`/`afterEach` for isolated temp homes, PGlite stores, and environment mutation: `src/web/src/routes/runs/page.server.test.ts`.
- Use `beforeAll`/`afterAll` for heavier shared setup such as ORM instances or dynamic Svelte SSR imports: `tests/db/migrator-service.test.ts`, `src/web/src/routes/boards/page.svelte.test.ts`.
- Use cache-busted dynamic imports when testing SvelteKit server modules that read environment/module state: `src/web/src/routes/boards/page.server.test.ts`.
- Use explicit data seeding helpers rather than hidden global fixtures for product DB tests: `seedTasks()` in `src/web/src/routes/boards/page.server.test.ts`.

## Mocking

**Framework:** Bun `mock`/`mock.module`, Bun `vi` compatibility, Vitest mocks, Playwright fixtures.

**Patterns:**
```typescript
import { mock } from "bun:test";

mock.module("$app/navigation", () => ({
  goto: async () => {},
  invalidateAll: async () => {},
}));
```

```typescript
import { vi } from "bun:test";

const mockEm = {
  getRepository: vi.fn(() => makeMockRepo(tasks, () => mockEmBox.em)),
  transactional: vi.fn(async (cb) => {
    await cb(txEm);
  }),
} as unknown as EntityManager;
```

**What to Mock:**
- Mock SvelteKit virtual modules for SSR component tests: `$app/state`, `$app/navigation`, `$app/forms` in `src/web/src/routes/boards/page.svelte.test.ts`.
- Mock repository/EntityManager surfaces for pure service behavior: `makeMockRepo()` and `makeMockEm()` in `src/services/TaskService.test.ts`.
- Mock process HOME/config roots with temp directories for CLI behavior: `src/cli/doctor.test.ts`.
- Use Playwright fixtures for browser-level seeded product data: `src/web/tests/e2e/_fixtures.spec.ts`.

**What NOT to Mock:**
- Do not mock PGlite for migration/schema/product DB contract tests; use in-memory PGlite and real migrations: `tests/db/migrator-service.test.ts`, `src/web/src/routes/boards/page.server.test.ts`.
- Do not mock public API route registration when testing OpenAPI/parity contracts: `tests/api/openapi-memory.test.ts`, `tests/api/rest-parity.test.ts`.
- Do not mock Svelte SSR output when asserting rendered markup; use `svelte/server` `render()` with Bun preload from `bunfig.toml`.

## Fixtures and Factories

**Test Data:**
```typescript
function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: crypto.randomUUID(),
    org: { id: "org-1" } as never,
    title: "Test Task",
    status: "todo",
    dependencies: { blocks: [], blocked_by: [] },
    customFields: {},
    ...overrides,
  } as unknown as Task;
}
```

```typescript
async function seedTasks(): Promise<SeededIds> {
  const db = await openPglite(join(dbDir, "main"));
  await runMigrations(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  const alpha = await createProject(db, { orgId: org.id, slug: "alpha", name: "Alpha" });
  const task = await createTask(db, { orgId: org.id, projectId: alpha.id, title: "Alpha pending" });
  await db.close();
  return { orgId: org.id, alphaProjectId: alpha.id, taskAlphaPendingId: task.id };
}
```

**Location:**
- Keep simple factories in the test file that uses them: `makeTask()` in `src/services/TaskService.test.ts`.
- Keep route seed helpers in the route test file unless shared by multiple route suites: `seedTasks()` in `src/web/src/routes/boards/page.server.test.ts`.
- Use shared product-kernel repository helpers for DB fixtures: `createLocalOrg()`, `createProject()`, `createTask()` from `src/product-kernel/store/repositories.ts`.
- Playwright browser fixtures live under `src/web/tests/e2e/`, including fixture validation in `src/web/tests/e2e/_fixtures.spec.ts`.

## Coverage

**Requirements:** Root Bun coverage threshold is 80% via `bunfig.toml`; web Vitest coverage threshold is 80% lines for configured include set in `src/web/vitest.config.ts`.

**View Coverage:**
```bash
bun run scripts/test-root.ts --coverage
(cd src/web && bun run web:test -- --coverage)
```

CI runs both coverage gates through `scripts/ci.ts`: `coverage:root` and `coverage:web`. `.planning/STATE.md` records Phase 9 completion with root coverage passed and web coverage lines 92.41%.

## Test Types

**Unit Tests:**
- Pure domain/service logic with mocks: `src/services/TaskService.test.ts`, `tests/notifications/rule-engine.test.ts`, `src/router/rules-engine.test.ts`.
- CLI and config behavior with temp HOME roots: `src/cli/doctor.test.ts`, `src/cli/install.test.ts`.

**Integration Tests:**
- PGlite/MikroORM migrations and DB schema contracts: `tests/db/migrator-service.test.ts`, `tests/db/migrations/*.test.ts`.
- Web route server actions against seeded local product DB: `src/web/src/routes/boards/page.server.test.ts`, `src/web/src/routes/runs/page.server.test.ts`.
- API parity/OpenAPI tests: `tests/api/rest-parity.test.ts`, `tests/api/hono-setup.test.ts`.

**E2E Tests:**
- Playwright smoke is always in CI through `web:e2e:smoke`: `src/web/tests/e2e/_smoke.spec.ts`.
- Full Playwright e2e runs with `FULCRUM_RUN_E2E=1`: `src/web/playwright.config.ts`, `scripts/ci.ts`.
- Accessibility uses Playwright + axe: `src/web/package.json` script `web:a11y`, tests under `src/web/tests/a11y/`.

## Common Patterns

**Async Testing:**
```typescript
await expect(service.migrate()).resolves.toBeUndefined();
await expect(
  svc.bulkUpdate({ orgId: "org-1", userId: "user-1", em: null }, ids, { status: "done" }),
).rejects.toMatchObject({ code: "BAD_REQUEST" });
```

Use `await streamedData<T>(result)` for SvelteKit streamed load promises: `src/web/src/routes/boards/page.server.test.ts`.

**Error Testing:**
```typescript
let caught: unknown;
try {
  await mod.load(fakeLoadEvent({ id: "missing" }));
} catch (e) {
  caught = e;
}
expect(caught).toBeDefined();
```

Use `rejects.toMatchObject()` for domain/framework errors where possible: `src/services/TaskService.test.ts`. Use explicit `try/catch` when framework helpers throw non-Error response objects: `src/web/src/routes/runs/[id]/page.server.test.ts`.

---

*Testing analysis: 2026-05-06*
