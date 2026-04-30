# Product Kernel Implementation Plan

Status: needs-triage
Source: docs/superpowers/plans/2026-04-30-product-kernel.md
Companions: PLAYBOOK.md, RESEARCH-DESIGN.md

> **For agentic workers:** REQUIRED SUB-SKILLS: `subagent-orchestration` + `subagent-driven-development` + `tdd`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Fulcrum's shared product kernel for projects, docs, tasks, memory, agent runs, artifacts, deterministic retrieval, and future web/SaaS surfaces.

**Architecture:** Use a Postgres-compatible domain kernel with PGlite for local default and PostgreSQL for team/SaaS. Keep Markdown/frontmatter canonical, write all state changes to an event log, derive FTS/read models from source tables, and expose UI state through a framework-agnostic store wrapped for Svelte.

**Tech Stack:** Bun TypeScript, PGlite, PostgreSQL, SQL migrations, SvelteKit, shadcn-svelte, CodeMirror 6, zustand/vanilla, Postgres FTS, Postgres LISTEN/NOTIFY, optional Graphile Worker/PostgREST/pg_graphql behind gates.

---

## Required Pre-Read

- `AGENTS.md`
- `HANDOVER.md`
- `docs/superpowers/specs/2026-04-30-product-kernel-research-design.md`
- `src/components/ledger.ts`
- `src/cli/component.ts`
- `src/index.ts`
- `package.json`

## Best-In-Class Defaults

| Area | Default | Second choice | Third choice | Switch gate |
|---|---|---|---|---|
| Database kernel | PGlite local + PostgreSQL server | Convex | SQLite + FTS5 + Bun API | PGlite cannot ship reliably in Bun binary, Postgres setup too heavy, or SQL compatibility breaks core tests. |
| API | Bun service + SQL functions/views | PostgREST | pg_graphql | If CRUD endpoints duplicate database views/permissions, add PostgREST. If graph clients need typed traversal, add pg_graphql. |
| Queue | Postgres/PGlite `jobs` table | Graphile Worker | BullMQ/Redis | If retries/cron/concurrency exceed simple queue tests, adopt Graphile Worker. Redis only if Postgres queue becomes bottleneck. |
| UI | SvelteKit + shadcn-svelte | Vue + shadcn-vue | Solid + Kobalte/solid-ui | If SvelteKit/Bun or shadcn-svelte blocks build/accessibility after spike, switch before product UI work continues. |
| Editor | CodeMirror 6 Markdown | Plain textarea + preview | Milkdown | If CodeMirror fails mobile/IME/large-doc gates, use textarea. Milkdown only after byte-stable Markdown round-trip proof. |
| State | zustand/vanilla + Svelte wrapper | TanStack Store | Svelte stores/runes | If Svelte wrapper causes SSR leaks or subscription friction, switch to TanStack Store. |
| Charts | Apache ECharts | Layer Cake / LayerChart | Custom SVG | If ECharts bundle/interactivity is too heavy for dashboards, switch to Svelte-native charts. |
| Drag/drop | dnd-kit Svelte | SortableJS | native move buttons | If dnd-kit Svelte fails board accessibility or stability, switch to SortableJS for reorder-only boards. |

## Failure Gates

Run gates before building dependent product code:

```bash
bun test src/product-kernel/compat.test.ts
bun test src/product-kernel/markdown.test.ts
bun test src/product-kernel/state.test.ts
bun run --bun tsc --noEmit
bun run ci
```

Gate policy:

- `pass`: continue with default tool.
- `warn`: keep default only if limitation is documented in the relevant task.
- `fail`: stop dependent tasks and switch to the next tool in the fallback table.

No embeddings, RAG, semantic search, local model, or remote model dependency can be added by this plan.

## TDD Enforcement

Iron law for this plan:

```text
NO PRODUCT BEHAVIOR CODE WITHOUT A FAILING TEST FIRST.
```

For every task that creates or changes runtime behavior:

1. Write the smallest meaningful test for the next behavior.
2. Run that exact test and verify it fails for the expected reason.
3. Only then write production code.
4. Run the same test and verify it passes.
5. Run the task gate.
6. Report the RED command/output and GREEN command/output.

If production behavior code is written before the RED test evidence exists, delete that production code and restart the task from the test. Tests written after implementation do not satisfy this plan.

Allowed pre-test setup:

- Installing dependencies needed to load the test runner or import the intended package.
- Creating empty directories.
- Creating compile-only skeleton exports that throw `new Error("not implemented")` only when static imports require a module to exist. Skeletons must contain no SQL, no I/O, no state mutation, no branching, and no return values that could satisfy a test.
- Reading docs/config.

Not allowed before RED:

- Implementing exported functions/classes.
- Creating migrations that make the test pass.
- Wiring CLI commands.
- Creating Svelte routes/components with runtime behavior.
- Returning dummy values from skeletons to make a test pass.

Task 2 is a tooling compatibility spike: it must not add product UI behavior. If it adds any route/component behavior, move that work to Task 11 and write RED tests first. Task 12 is documentation-only and uses review/CI gates instead of TDD.

## File Map

Create:

- `src/product-kernel/ids.ts` - ULID generation and deterministic test IDs.
- `src/product-kernel/paths.ts` - Fulcrum state paths for local product DB and artifact bodies.
- `src/product-kernel/db/types.ts` - database driver interfaces.
- `src/product-kernel/db/pglite.ts` - local PGlite driver.
- `src/product-kernel/db/postgres.ts` - PostgreSQL server driver.
- `src/product-kernel/db/migrate.ts` - migration runner.
- `src/product-kernel/db/migrations/0001_product_kernel.sql` - base schema.
- `src/product-kernel/db/migrations/0002_search.sql` - FTS/search read model.
- `src/product-kernel/db/migrations/0003_jobs.sql` - local queue.
- `src/product-kernel/store/repositories.ts` - repository functions for orgs/projects/repos/docs/tasks/events/edges.
- `src/product-kernel/search.ts` - deterministic retrieval.
- `src/product-kernel/markdown.ts` - Markdown/frontmatter parse and serialize.
- `src/product-kernel/events.ts` - event append and notification bridge.
- `src/product-kernel/jobs.ts` - queue primitives.
- `src/product-kernel/context.ts` - deterministic context assembly.
- `src/product-kernel/compat.test.ts`
- `src/product-kernel/markdown.test.ts`
- `src/product-kernel/search.test.ts`
- `src/product-kernel/events.test.ts`
- `src/product-kernel/jobs.test.ts`
- `src/product-kernel/context.test.ts`
- `src/web/src/lib/product-queries.test.ts`
- `src/web/src/lib/state/fulcrum-store.test.ts`
- `src/cli/product.ts` - CLI entry for early product-kernel commands.
- `src/web/` - SvelteKit app after compatibility gate passes.

Modify:

- `package.json` - add gated dependencies only after compatibility spike.
- `src/index.ts` - add `fulcrum product` command after CLI tests exist.
- `src/cli/doctor.ts` - report product-kernel database health after schema exists.
- `src/cli/uninstall.ts` - purge product-kernel state only with existing purge policy.
- `HANDOVER.md` - keep product-kernel status current.

## Parallel Execution

Wave 1 can run in parallel:

- Task 1 database compatibility spike.
- Task 2 UI compatibility spike.
- Task 3 Markdown/editor compatibility spike.
- Task 4 state-store compatibility spike.

Wave 2 starts only after Wave 1 gates:

- Task 5 migrations/schema.
- Task 6 repositories/events.
- Task 7 search/context.
- Task 8 queue/runs.

Wave 3 starts after schema/search/events:

- Task 9 CLI surface.
- Task 10 doctor/uninstall.
- Task 11 web shell.

## Task 1: Database Compatibility Spike

**Files:**
- Create: `src/product-kernel/db/types.ts`
- Create: `src/product-kernel/db/pglite.ts`
- Create: `src/product-kernel/db/postgres.ts`
- Create: `src/product-kernel/compat.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Add database dependencies**

Run:

```bash
bun add @electric-sql/pglite pg
bun add -d @types/pg
```

Expected: dependencies recorded in `package.json` and lockfile.

- [ ] **Step 2: Write compatibility test before driver code**

Create `src/product-kernel/compat.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { openPglite } from "./db/pglite.ts";
import { openPostgres } from "./db/postgres.ts";
import type { ProductDb } from "./db/types.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-product-kernel-"));

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

async function assertCoreSql(db: ProductDb) {
  await db.exec("CREATE TABLE pk_probe (id text PRIMARY KEY, body text NOT NULL)");
  await db.query("INSERT INTO pk_probe (id, body) VALUES ($1, $2)", ["one", "hello world"]);
  const rows = await db.query<{ id: string; body: string }>("SELECT id, body FROM pk_probe WHERE id = $1", ["one"]);
  expect(rows).toEqual([{ id: "one", body: "hello world" }]);
}

describe("product kernel database compatibility", () => {
  test("PGlite supports core SQL contract", async () => {
    const db = await openPglite(join(scratch, "pgdata"));
    try {
      await assertCoreSql(db);
    } finally {
      await db.close();
    }
  });

  test.skipIf(!process.env.DATABASE_URL)("PostgreSQL supports core SQL contract", async () => {
    const db = openPostgres(process.env.DATABASE_URL!);
    try {
      await assertCoreSql(db);
    } finally {
      await db.close();
    }
  });
});
```

- [ ] **Step 3: Run RED compatibility test**

Run:

```bash
bun test src/product-kernel/compat.test.ts
```

Expected RED: fails because driver functions are compile-only skeletons that throw `not implemented`, or because the driver contract exists but does not execute SQL. A missing-module import error is not enough; create throwing skeleton exports and rerun until the test fails on missing behavior.

- [ ] **Step 4: Define driver contract**

Create `src/product-kernel/db/types.ts`:

```ts
export type SqlValue = string | number | boolean | null | Uint8Array;

export interface ProductDb {
  query<T = Record<string, unknown>>(sql: string, params?: readonly SqlValue[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
  engine: "pglite" | "postgres";
}
```

- [ ] **Step 5: Implement PGlite driver**

Create `src/product-kernel/db/pglite.ts`:

```ts
import { PGlite } from "@electric-sql/pglite";
import type { ProductDb, SqlValue } from "./types.ts";

export async function openPglite(dataDir: string): Promise<ProductDb> {
  const db = new PGlite(dataDir);
  return {
    engine: "pglite",
    async query<T>(sql: string, params: readonly SqlValue[] = []) {
      const result = await db.query(sql, params as unknown[]);
      return result.rows as T[];
    },
    async exec(sql: string) {
      await db.exec(sql);
    },
    async close() {
      await db.close();
    },
  };
}
```

- [ ] **Step 6: Implement PostgreSQL driver**

Create `src/product-kernel/db/postgres.ts`:

```ts
import pg from "pg";
import type { ProductDb, SqlValue } from "./types.ts";

export function openPostgres(connectionString: string): ProductDb {
  const pool = new pg.Pool({ connectionString });
  return {
    engine: "postgres",
    async query<T>(sql: string, params: readonly SqlValue[] = []) {
      const result = await pool.query(sql, params as unknown[]);
      return result.rows as T[];
    },
    async exec(sql: string) {
      await pool.query(sql);
    },
    async close() {
      await pool.end();
    },
  };
}
```

- [ ] **Step 7: Run GREEN compatibility test**

Run:

```bash
bun test src/product-kernel/compat.test.ts
```

Expected: PGlite test passes. PostgreSQL test skips when `DATABASE_URL` is unset and passes when set.

- [ ] **Step 8: Failure gate**

If PGlite test fails because Bun cannot load or persist PGlite reliably, stop this plan and run a Convex spike. If PostgreSQL test fails against a valid `DATABASE_URL`, fix SQL compatibility before continuing.

## Task 2: UI Compatibility Spike

**Files:**
- Create: `src/web/README.md`
- Modify: `package.json`

- [ ] **Step 1: Add Svelte tooling**

Run:

```bash
bun add -d svelte @sveltejs/kit @sveltejs/adapter-node @sveltejs/vite-plugin-svelte vite typescript
bun add lucide-svelte clsx tailwind-merge
```

Expected: dependencies install without React packages.

- [ ] **Step 2: Add shadcn-svelte only after Svelte install passes**

Run:

```bash
bunx shadcn-svelte@latest init
```

Choose SvelteKit, TypeScript, Tailwind, and project-local component output under `src/web/lib/components/ui`.

- [ ] **Step 3: Record spike result**

Create `src/web/README.md`:

```md
# Fulcrum Web

Framework: SvelteKit.
UI source: shadcn-svelte copied components.
Rule: do not add React. Do not adopt third-party app UI as product base.
```

- [ ] **Step 4: Run build gate**

Run:

```bash
bun run --bun tsc --noEmit
```

Expected: TypeScript passes.

- [ ] **Step 5: Confirm no product UI behavior was added**

Run:

```bash
rg -n "export const load|<script|product-kernel|agent_runs|tasks|documents" src/web
```

Expected: no product route/component behavior exists in Task 2. No-output/exit-1 from `rg` is acceptable because it means no matches. If this command finds product behavior, delete/move that behavior to Task 11 and add RED tests there first.

- [ ] **Step 6: Failure gate**

If SvelteKit/shadcn-svelte cannot build under Bun after one focused fix pass, stop UI work and spike Vue + shadcn-vue.

## Task 3: Markdown And Frontmatter Kernel

**Files:**
- Create: `src/product-kernel/markdown.ts`
- Create: `src/product-kernel/markdown.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Add parser dependency**

Run:

```bash
bun add yaml
```

Use a direct parser first. Add gray-matter only if direct parsing fails preserve requirements.

- [ ] **Step 2: Write tests for byte-safe round-trip**

Create `src/product-kernel/markdown.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { parseKernelMarkdown, serializeKernelMarkdown } from "./markdown.ts";

const fixture = `---
id: 01JTEST0000000000000000000
kind: decision
labels:
  - architecture
  - backend
status: accepted
---

# Title

Body with **Markdown** and a link to [Fulcrum](../README.md).
`;

describe("kernel markdown", () => {
  test("parses YAML frontmatter and body", () => {
    const parsed = parseKernelMarkdown(fixture);
    expect(parsed.frontmatter.id).toBe("01JTEST0000000000000000000");
    expect(parsed.frontmatter.labels).toEqual(["architecture", "backend"]);
    expect(parsed.body).toContain("# Title");
  });

  test("serializes without changing body text", () => {
    const parsed = parseKernelMarkdown(fixture);
    const serialized = serializeKernelMarkdown(parsed);
    expect(serialized).toBe(fixture);
  });
});
```

- [ ] **Step 3: Run RED parser test**

Run:

```bash
bun test src/product-kernel/markdown.test.ts
```

Expected RED: fails because `parseKernelMarkdown` / `serializeKernelMarkdown` are compile-only skeletons that throw `not implemented` or return no parsed frontmatter/body. A missing-module import error is not enough; create throwing skeleton exports and rerun until the test fails on missing behavior.

- [ ] **Step 4: Implement parser**

Create `src/product-kernel/markdown.ts`:

```ts
import { parse, stringify } from "yaml";

export interface KernelMarkdown {
  frontmatter: Record<string, unknown>;
  body: string;
}

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n?/;

export function parseKernelMarkdown(input: string): KernelMarkdown {
  const match = input.match(FRONTMATTER);
  if (!match) return { frontmatter: {}, body: input };
  return {
    frontmatter: (parse(match[1] ?? "") ?? {}) as Record<string, unknown>,
    body: input.slice(match[0].length),
  };
}

export function serializeKernelMarkdown(doc: KernelMarkdown): string {
  const yaml = stringify(doc.frontmatter).trimEnd();
  return `---\n${yaml}\n---\n\n${doc.body}`;
}
```

- [ ] **Step 5: Run GREEN parser gate**

Run:

```bash
bun test src/product-kernel/markdown.test.ts
```

Expected: tests pass.

- [ ] **Step 6: Failure gate**

If key order, comments, unknown keys, or body content cannot be preserved for real fixtures, replace serializer with a frontmatter patcher that updates only known keys and preserves original text spans.

## Task 4: State Store Compatibility

**Files:**
- Create: `src/product-kernel/state/store.ts`
- Create: `src/product-kernel/state.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Add state dependency**

Run:

```bash
bun add zustand
```

- [ ] **Step 2: Write store tests**

Create `src/product-kernel/state.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { createFulcrumStore } from "./state/store.ts";

describe("fulcrum state store", () => {
  test("subscribes to project changes", () => {
    const store = createFulcrumStore();
    const seen: string[] = [];
    const unsubscribe = store.subscribe((state) => {
      seen.push(state.activeProjectId ?? "none");
    });
    store.getState().setActiveProject("01JPROJECT0000000000000000");
    unsubscribe();
    expect(seen).toContain("01JPROJECT0000000000000000");
  });
});
```

- [ ] **Step 3: Run RED store test**

Run:

```bash
bun test src/product-kernel/state.test.ts
```

Expected RED: fails because `createFulcrumStore` is a compile-only skeleton that throws `not implemented` or does not publish state updates. A missing-module import error is not enough; create a throwing skeleton export and rerun until the test fails on missing behavior.

- [ ] **Step 4: Implement vanilla store**

Create `src/product-kernel/state/store.ts`:

```ts
import { createStore } from "zustand/vanilla";

export interface FulcrumState {
  activeProjectId: string | null;
  setActiveProject(id: string | null): void;
}

export function createFulcrumStore() {
  return createStore<FulcrumState>()((set) => ({
    activeProjectId: null,
    setActiveProject: (id) => set({ activeProjectId: id }),
  }));
}
```

- [ ] **Step 5: Run GREEN state gate**

Run:

```bash
bun test src/product-kernel/state.test.ts
```

Expected: test passes.

- [ ] **Step 6: Failure gate**

If Zustand vanilla cannot be wrapped cleanly for Svelte without SSR leakage in Task 11, switch store implementation to TanStack Store behind the same `createFulcrumStore` API.

## Task 5: Product Schema Migrations

**Files:**
- Create: `src/product-kernel/db/migrate.ts`
- Create: `src/product-kernel/db/migrations/0001_product_kernel.sql`
- Create: `src/product-kernel/db/migrations/0002_search.sql`
- Create: `src/product-kernel/db/migrations/0003_jobs.sql`
- Create: `src/product-kernel/db/migrate.test.ts`

- [ ] **Step 1: Write migration test**

Create `src/product-kernel/db/migrate.test.ts` with a PGlite database, run migrations, and assert these tables exist: `orgs`, `projects`, `documents`, `tasks`, `edges`, `events`, `search_documents`, `jobs`.

- [ ] **Step 2: Run RED migration test**

Run:

```bash
bun test src/product-kernel/db/migrate.test.ts
```

Expected RED: fails because the migration runner is a compile-only skeleton that throws `not implemented`, or because running migrations leaves required tables absent. A missing-module import error is not enough; create throwing skeleton exports and rerun until the test fails on missing behavior.

- [ ] **Step 3: Create base schema**

Create `0001_product_kernel.sql` with org/user/project/repo/doc/task/memory/run/artifact/edge/event tables. Use `text` ULID primary keys and `timestamptz`.

- [ ] **Step 4: Create search schema**

Create `0002_search.sql`:

```sql
CREATE TABLE IF NOT EXISTS search_documents (
  id text PRIMARY KEY,
  org_id text NOT NULL,
  project_id text,
  source_kind text NOT NULL,
  source_id text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  labels text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(body, '')), 'B')
  ) STORED,
  UNIQUE (source_kind, source_id)
);

CREATE INDEX IF NOT EXISTS search_documents_vector_idx ON search_documents USING gin (search_vector);
CREATE INDEX IF NOT EXISTS search_documents_scope_idx ON search_documents (org_id, project_id, source_kind);
```

- [ ] **Step 5: Create jobs schema**

Create `0003_jobs.sql`:

```sql
CREATE TABLE IF NOT EXISTS jobs (
  id text PRIMARY KEY,
  org_id text NOT NULL,
  project_id text,
  queue text NOT NULL,
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_by text,
  locked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jobs_claim_idx ON jobs (queue, status, available_at, created_at);
```

- [ ] **Step 6: Run GREEN migration gate**

Run:

```bash
bun test src/product-kernel/db/migrate.test.ts
```

Expected: all required tables exist on PGlite. PostgreSQL compatibility runs when `DATABASE_URL` is set.

## Task 6: Repositories And Event Log

**Files:**
- Create: `src/product-kernel/store/repositories.ts`
- Create: `src/product-kernel/events.ts`
- Create: `src/product-kernel/events.test.ts`

- [ ] **Step 1: Write event test**

Test creating a project and task writes both source rows and `events` rows.

- [ ] **Step 2: Run RED event test**

Run:

```bash
bun test src/product-kernel/events.test.ts
```

Expected RED: fails because repository/event functions are compile-only skeletons that throw `not implemented` or do not write `events`. A missing-module import error is not enough; create throwing skeleton exports and rerun until the test fails on missing behavior.

- [ ] **Step 3: Implement repository functions**

Implement `createLocalOrg`, `createProject`, `createTask`, `appendEvent`, and `listEventsForProject`.

- [ ] **Step 4: Run GREEN event gate**

Run:

```bash
bun test src/product-kernel/events.test.ts
```

Expected: event rows are created in stable order with exact actor and subject fields.

## Task 7: Search And Context Assembly

**Files:**
- Create: `src/product-kernel/search.ts`
- Create: `src/product-kernel/context.ts`
- Create: `src/product-kernel/search.test.ts`
- Create: `src/product-kernel/context.test.ts`

- [ ] **Step 1: Write search test**

Seed project docs, tasks, and memory. Search for a unique term. Assert results include kind, source ID, title, deterministic score fields, and stable order.

- [ ] **Step 2: Write context test**

Seed a task linked to a doc and memory through `edges`. Assemble context twice with same inputs. Assert byte-identical Markdown output.

- [ ] **Step 3: Run RED retrieval tests**

Run:

```bash
bun test src/product-kernel/search.test.ts src/product-kernel/context.test.ts
```

Expected RED: fails because search/context functions are compile-only skeletons that throw `not implemented`, return no results, or produce non-deterministic/incorrect output. A missing-module import error is not enough; create throwing skeleton exports and rerun until the test fails on missing behavior.

- [ ] **Step 4: Implement search**

Use Postgres FTS on `search_documents.search_vector` with structured filters. Do not use embeddings, semantic expansion, or model calls.

- [ ] **Step 5: Implement context assembly**

Order context sections as: task, explicit docs, explicit memory, search hits, recent decisions, artifacts. Sort ties by `updated_at desc`, then `id asc`.

- [ ] **Step 6: Run GREEN retrieval gate**

Run:

```bash
bun test src/product-kernel/search.test.ts src/product-kernel/context.test.ts
```

Expected: deterministic results and byte-identical context assemblies.

## Task 8: Queue And Agent Run Kernel

**Files:**
- Create: `src/product-kernel/jobs.ts`
- Create: `src/product-kernel/jobs.test.ts`

- [ ] **Step 1: Write queue test**

Seed three jobs. Claim one job. Assert status changes to `running`, `locked_by` is set, and a second claim does not return the same job.

- [ ] **Step 2: Run RED queue test**

Run:

```bash
bun test src/product-kernel/jobs.test.ts
```

Expected RED: fails because queue functions are compile-only skeletons that throw `not implemented` or duplicate claims are possible. A missing-module import error is not enough; create throwing skeleton exports and rerun until the test fails on missing behavior.

- [ ] **Step 3: Implement queue functions**

Implement `enqueueJob`, `claimJob`, `completeJob`, `failJob`, and `cancelJob`.

- [ ] **Step 4: PostgreSQL gate**

For PostgreSQL driver, `claimJob` must use `FOR UPDATE SKIP LOCKED`.

- [ ] **Step 5: PGlite gate**

For PGlite/local mode, `claimJob` can use a transaction with single-process ownership. Document this limitation in code comments.

- [ ] **Step 6: Run GREEN queue gate**

Run:

```bash
bun test src/product-kernel/jobs.test.ts
```

Expected: no duplicate claims in local tests.

## Task 9: Early CLI Surface

**Files:**
- Create: `src/cli/product.ts`
- Create: `src/cli/product.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write CLI tests**

Cover:

```bash
fulcrum product init --json
fulcrum product projects list --json
fulcrum product search "term" --json
fulcrum product context assemble --task <id>
```

- [ ] **Step 2: Run RED CLI tests**

Run:

```bash
bun test src/cli/product.test.ts
```

Expected RED: fails because `fulcrum product` dispatch and product CLI handlers are compile-only skeletons, return the wrong exit/output, or are not wired. A missing-module import error is not enough; create throwing skeleton exports and rerun until the test fails on missing behavior.

- [ ] **Step 3: Add dispatcher**

Modify `src/index.ts` to dispatch `product` to `src/cli/product.ts`.

- [ ] **Step 4: Implement minimum commands**

Implement only init, project list, search, and context assembly. Do not add full task/docs CRUD until schema/search/context gates pass.

- [ ] **Step 5: Run GREEN CLI gate**

Run:

```bash
bun test src/cli/product.test.ts
bun run src/index.ts product init --json
```

Expected: JSON output parses with `jq`.

## Task 10: Doctor And Uninstall Integration

**Files:**
- Modify: `src/cli/doctor.ts`
- Modify: `src/cli/doctor.test.ts`
- Modify: `src/cli/uninstall.ts`
- Modify: `src/cli/uninstall.test.ts`
- Modify: `HANDOVER.md`

- [ ] **Step 1: Write RED doctor/uninstall tests**

Modify `src/cli/doctor.test.ts` and `src/cli/uninstall.test.ts` first. Add assertions that doctor reports product-kernel engine/schema/row counts/latest event timestamp and that default uninstall preserves product state while `--purge` removes only managed product state.

- [ ] **Step 2: Run RED doctor/uninstall tests**

Run:

```bash
bun test src/cli/doctor.test.ts src/cli/uninstall.test.ts
```

Expected RED: fails because product-kernel doctor/uninstall behavior is missing from existing commands or compile-only skeletons throw `not implemented`. The test must fail on missing product-kernel behavior, not on syntax/import errors.

- [ ] **Step 3: Doctor reports product DB**

Add product-kernel section with engine, schema version, row counts, and latest event timestamp.

- [ ] **Step 4: Uninstall preserves product state by default**

Default uninstall keeps product DB. `--purge` removes product DB/artifacts under `~/.fulcrum/state/product` or project product state paths.

- [ ] **Step 5: Run GREEN doctor/uninstall tests**

Run:

```bash
bun test src/cli/doctor.test.ts src/cli/uninstall.test.ts
```

Expected: default uninstall preserves product state; purge removes only managed product state.

## Task 11: Web Shell And State Bridge

**Files:**
- Create: `src/web/`
- Create: `src/web/src/lib/state/fulcrum-store.ts`
- Create: `src/web/src/lib/state/fulcrum-store.test.ts`
- Create: `src/web/src/lib/product-queries.ts`
- Create: `src/web/src/lib/product-queries.test.ts`
- Create: `src/web/src/routes/+layout.svelte`
- Create: `src/web/src/routes/+page.svelte`
- Create: `src/web/src/routes/projects/+page.svelte`
- Create: `src/web/src/routes/docs/+page.svelte`
- Create: `src/web/src/routes/boards/+page.svelte`
- Create: `src/web/src/routes/runs/+page.svelte`

- [ ] **Step 1: Write RED web state/query tests**

Create tests for:

- `src/web/src/lib/state/fulcrum-store.test.ts` - Svelte-readable wrapper reflects `createFulcrumStore` changes.
- `src/web/src/lib/product-queries.test.ts` - project/docs/board/run view query helpers read from product-kernel repositories instead of static data.

- [ ] **Step 2: Run RED web tests**

Run:

```bash
bun test src/web/src/lib/state/fulcrum-store.test.ts src/web/src/lib/product-queries.test.ts
```

Expected RED: fails because web state/query helpers are compile-only skeletons that throw `not implemented` or return static/fake data. A missing-module import error is not enough; create throwing skeleton exports and rerun until the test fails on missing behavior.

- [ ] **Step 3: Create web shell after UI gate passes**

Use SvelteKit and shadcn-svelte copied components. Do not add React.

- [ ] **Step 4: Add state bridge**

Expose the `createFulcrumStore` state through a Svelte-readable subscription wrapper.

- [ ] **Step 5: Add first views**

Add project list, docs list, a read-only board view backed by real task query, and a read-only run monitor backed by `agent_runs`.

- [ ] **Step 6: Run GREEN web gate**

Run:

```bash
bun run --bun tsc --noEmit
bun run ci
```

Expected: existing CLI/build/tests still pass.

## Task 12: Documentation And Handover

**Files:**
- Modify: `README.md`
- Modify: `HANDOVER.md`
- Create or modify: `docs/product-kernel.md`

- [ ] **Step 1: Document operator modes**

Document local PGlite mode, PostgreSQL mode, `DATABASE_URL`, and state paths.

- [ ] **Step 2: Document deterministic retrieval**

Document no embeddings/RAG/model dependency, FTS filters, backlinks, edges, and stable context assembly order.

- [ ] **Step 3: Document failure gates**

Copy the failure gate table from this plan into product docs after implementation confirms it.

- [ ] **Step 4: Final verification**

Run:

```bash
bun run ci
git status --short
```

Expected: CI green. Working tree contains only intended product-kernel changes.

## Completion Criteria

- PGlite local DB works without external database install.
- PostgreSQL server mode works when `DATABASE_URL` is set.
- Schema migrations are idempotent.
- Markdown/frontmatter round-trip passes.
- Search and context assembly are deterministic.
- Events are written for state changes.
- Queue claims do not duplicate jobs.
- Early CLI commands output JSON.
- Doctor reports product-kernel health.
- Uninstall preserves state by default and purges only on `--purge`.
- Web shell uses Svelte/shadcn-svelte and no React.
- `bun run ci` passes.
