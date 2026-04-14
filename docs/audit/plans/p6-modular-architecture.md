# P6 — Modular Architecture

> Implements all issues from [F6 — Modular Architecture Audit](../findings/f6-modular-architecture.md).
> 16 issues. The architecture is structurally sound; the gaps are missing build
> artifacts, incomplete `exports` maps, no publishable packages, and a singleton
> `getDb()` that should be threaded as a port.

---

## Goal

Make `@fulcrum/core`, `@fulcrum/memory`, and `@fulcrum/worker` publishable to npm.
Add proper `exports` maps, a build step, Zod config schemas, and CI cycle guards.
Extract `@fulcrum/kernel` as a leaf package. Replace the `getDb()` singleton with
a `Db` port threaded via Context.

---

## Issue index

| ID | Title | Severity | Priority |
|----|-------|----------|----------|
| F6-ISSUE-01 | Extract `@fulcrum/kernel` leaf package | CRITICAL | P0 |
| F6-ISSUE-09 | Delete duplicate `writeMemory`/`recallMemory`/policy in `@fulcrum/core` | CRITICAL | P0 |
| F6-ISSUE-10 | Modular-monolith schema ownership | CRITICAL | P0 |
| F6-ISSUE-02 | Per-package `exports` map + subpath exports + `sideEffects: false` | HIGH | P1 |
| F6-ISSUE-03 | Build step emitting `dist/` | HIGH | P1 |
| F6-ISSUE-07 | CI cycle check + module boundary lint | HIGH | P1 |
| F6-ISSUE-11 | Thread `Db` port through Context; remove `getDb()` singleton | HIGH | P1 |
| F6-ISSUE-04 | Publish plan for library packages | MEDIUM | P2 |
| F6-ISSUE-05 | Zod config schemas + per-package config | MEDIUM | P2 |
| F6-ISSUE-06 | Plugin discovery via `"fulcrum"` manifest | MEDIUM | P2 |
| F6-ISSUE-08 | `@fulcrum/e2e` + contract test kit | MEDIUM | P2 |
| F6-ISSUE-12 | Per-package `bin` CLIs | MEDIUM | P2 |
| F6-ISSUE-13 | `test/dummy/` standalone host per package | MEDIUM | P2 |
| F6-ISSUE-14 | Barrel-file audit | LOW | P3 |
| F6-ISSUE-15 | READMEs for `@fulcrum/cli` and `@fulcrum/worker` | LOW | P3 |
| F6-ISSUE-16 | Unify `ulid`/`ulidx` | LOW | P3 |

---

## Package dependency graph (target state)

```
@fulcrum/kernel          ← leaf: types, constants, newId, error classes
       ↑
@fulcrum/core            ← schema, migrations, roles, policy, DB setup
       ↑                 ← also owns: task CRUD, workspace CRUD
@fulcrum/memory          ← write, recall, embed, chunk, rerank
@fulcrum/planning        ← workflow runner, step handlers
@fulcrum/policy          ← WIP enforcement, role guards
@fulcrum/teams           ← team templates, instances, scheduler
@fulcrum/worker          ← agent adapters, lifecycle, worktrees ref
@fulcrum/worktrees       ← git worktree management
@fulcrum/sync            ← export/import, changelog
@fulcrum/monitor         ← HTTP monitor server
@fulcrum/cli             ← CLI commands, MCP server (depends on all above)
```

No cycles. Each package depends only on packages above it in this list.

---

## Task breakdown

### Task 6.1 — Extract `@fulcrum/kernel` (F6-ISSUE-01) [CRITICAL]

**Goal:** Create a leaf package (`@fulcrum/kernel`) that has zero internal
dependencies. Everything that is currently in `@fulcrum/core` but needed
by ALL other packages moves here.

**Files to move to `@fulcrum/kernel`:**
- `packages/core/src/ids.ts` → `packages/kernel/src/ids.ts` (`newId`, `ulid`)
- `packages/core/src/types.ts` (pure type definitions only)
- `packages/core/src/errors.ts` (error classes)
- `packages/core/src/constants.ts` (e.g., `DEFAULT_WIP_LIMIT`)

**Steps:**

- [ ] Create `packages/kernel/package.json`:
  ```json
  {
    "name": "@fulcrum/kernel",
    "version": "0.1.0",
    "type": "module",
    "exports": { ".": "./src/index.ts" },
    "sideEffects": false,
    "dependencies": {}
  }
  ```

- [ ] Create `packages/kernel/src/index.ts` with re-exports of moved files

- [ ] Update `@fulcrum/core` and all other packages to import from `@fulcrum/kernel`
  instead of `../../core/src/ids`

- [ ] Run `pnpm test` to confirm no breakage

- [ ] Commit: `feat(kernel): extract @fulcrum/kernel leaf package`

---

### Task 6.2 — Delete duplicate implementations (F6-ISSUE-09) [CRITICAL]

**Current duplicates:**
- `@fulcrum/core/src/memory.ts` duplicates `@fulcrum/memory/src/write.ts` + `recall.ts`
- `@fulcrum/core/src/policy.ts` may duplicate `@fulcrum/policy/src/`

**Steps:**

- [ ] `grep -r "writeMemory\|recallMemory" packages/core/ --include="*.ts"`
  Identify the duplicate

- [ ] Replace with re-export from `@fulcrum/memory`:
  ```ts
  // packages/core/src/memory.ts — REMOVED
  // Use @fulcrum/memory directly
  export { writeMemory, recallMemory } from '@fulcrum/memory';
  ```
  (This is the same as P5-Task-5.1 — coordinate so it's done once)

- [ ] Same for policy: confirm `@fulcrum/policy` owns the canonical
  implementation; `@fulcrum/core` re-exports or doesn't import it

- [ ] Commit: `refactor(core): remove duplicate memory/policy — re-export from canonical packages`

---

### Task 6.3 — Schema ownership (F6-ISSUE-10) [CRITICAL]

**Goal:** Each table's CRUD lives in exactly one package. Document ownership.

**Ownership table:**

| Table | Owner Package |
|-------|---------------|
| `workspaces`, `projects` | `@fulcrum/core` |
| `tasks` | `@fulcrum/core` |
| `agent_runs`, `trace_events` | `@fulcrum/core` |
| `memories`, `vec_memories`, `memory_tags` | `@fulcrum/memory` |
| `team_templates`, `team_instances` | `@fulcrum/teams` |
| `worktrees`, `merge_queue` | `@fulcrum/worktrees` |
| `workflows`, `workflow_runs` | `@fulcrum/planning` |
| `agent_definitions` | `@fulcrum/core` |

**Steps:**

- [ ] Audit: for each table, `grep -r "FROM <table_name>\|INSERT INTO <table_name>"
  packages/ --include="*.ts"` — identify all writers

- [ ] For tables with multiple writers, consolidate writes into the owning package's
  service layer; other packages call through the service, not raw SQL

- [ ] Add a comment in each package's `README.md`: "This package owns tables: X, Y, Z"

- [ ] Commit: `docs(arch): document table ownership per package`

---

### Task 6.4 — `exports` maps + `sideEffects` (F6-ISSUE-02) [HIGH]

**Files:**
- Modify: `packages/*/package.json`

**Steps:**

- [ ] For each package, add proper `exports` map:
  ```json
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./types": {
      "import": "./dist/types.js",
      "types": "./dist/types.d.ts"
    }
  },
  "sideEffects": false
  ```

- [ ] Add `"files": ["dist"]` to prevent publishing source

- [ ] Commit: `feat(packages): proper exports maps + sideEffects:false`

---

### Task 6.5 — Build step (F6-ISSUE-03) [HIGH]

**Files:**
- Create: `packages/*/tsconfig.build.json`
- Modify: `packages/*/package.json` — add `"build"` script

**Steps:**

- [ ] Choose build tool: `tsup` (recommended — zero config, ESM + CJS + types)

- [ ] Add `pnpm add -D tsup` to each library package (`kernel`, `core`, `memory`,
  `worker`, `worktrees`, `teams`, `planning`, `policy`, `sync`)

- [ ] Add to each `package.json`:
  ```json
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts --clean"
  }
  ```

- [ ] Root `pnpm build` runs `pnpm -r build`

- [ ] Add to CI: `pnpm build` before tests

- [ ] Commit: `feat(build): tsup build step for all library packages`

---

### Task 6.6 — CI cycle check (F6-ISSUE-07) [HIGH]

**Files:**
- Create: `scripts/check-cycles.ts`
- Modify: `.github/workflows/ci.yml`

**Steps:**

- [ ] Install `madge` for cycle detection: `pnpm add -D madge`

- [ ] Add script:
  ```ts
  const result = await madge('packages/', { detectiveOptions: { ts: { mixedImports: true } } });
  const cycles = result.circular();
  if (cycles.length > 0) {
    console.error('Circular dependencies detected:', cycles);
    process.exit(1);
  }
  ```

- [ ] Allow the one known cycle (`core` ↔ `teams` via lazy import) by adding
  an allowlist if needed

- [ ] Add to CI as a separate step: `pnpm check:cycles`

- [ ] Commit: `feat(ci): cycle detection with madge`

---

### Task 6.7 — Thread `Db` port (F6-ISSUE-11) [HIGH]

**This is the highest-risk task in P6.** Replace the `getDb()` singleton with
dependency injection.

**Current state:**
```ts
// packages/core/src/db.ts
let _db: Database | null = null;
export function getDb(): Database {
  if (!_db) _db = new Database(path);
  return _db;
}
```

**Target state:**
```ts
// Every function that needs DB receives it as first parameter or via Context
export function createTask(db: Database, input: CreateTaskInput): Task { ... }
```

**Strategy:** Incremental. Don't big-bang replace. Pick one module per PR.

**Steps:**

- [ ] Start with `@fulcrum/memory/src/write.ts` — it already accepts `db` parameter
  (verify). Add test that passes a test DB.

- [ ] Move `@fulcrum/core/src/tasks.ts` to accept `db` parameter

- [ ] Update callers (CLI, MCP handler) to pass `db` explicitly:
  ```ts
  const db = openDb(dbPath);
  createTask(db, input);
  ```

- [ ] Remove `getDb()` calls one module at a time

- [ ] Add integration tests that use in-memory SQLite:
  ```ts
  const db = new Database(':memory:');
  runMigrations(db);
  ```

- [ ] Final PR: delete `getDb()` from `packages/core/src/db.ts`

- [ ] Commit per module: `refactor(core): thread Db port in tasks.ts`

---

### Task 6.8 — Zod config schemas (F6-ISSUE-05) [MEDIUM]

**Files:**
- Create: `packages/core/src/config.ts`

**Steps:**

- [ ] Write Zod schemas for all config shapes:
  ```ts
  export const FulcrumConfigSchema = z.object({
    workspace_id: z.string(),
    project_id: z.string(),
    db_path: z.string().default('.fulcrum/fulcrum.db'),
    monitor_port: z.number().default(4721),
    mcp_port: z.number().optional(),
  });
  ```

- [ ] Validate `.fulcrum.json` on every `openDb()` call with helpful errors

- [ ] Export `FulcrumConfig` type for use by adapters/CLI

- [ ] Commit: `feat(core): Zod config schema for .fulcrum.json`

---

### Task 6.9 — Plugin discovery (F6-ISSUE-06) [MEDIUM]

**Files:**
- Modify: `packages/cli/src/index.ts` — add plugin loader
- Create: `docs/guides/plugin-authoring.md`

**Steps:**

- [ ] Define plugin manifest in `package.json`:
  ```json
  "fulcrum": {
    "type": "plugin",
    "hooks": "./dist/hooks.js",
    "skills": "./skills/",
    "agents": "./agents/"
  }
  ```

- [ ] On CLI startup, scan `node_modules` for packages with `"fulcrum"` manifest key

- [ ] Load hooks, skills, agents from each discovered plugin

- [ ] Write test: create a minimal fake plugin package, assert it's discovered

- [ ] Commit: `feat(cli): plugin discovery via "fulcrum" manifest key`

---

### Task 6.10 — `@fulcrum/e2e` workspace (F6-ISSUE-08) [MEDIUM]

**Files:**
- Create: `packages/e2e/` workspace

**Steps:**

- [ ] Create `packages/e2e/package.json`:
  ```json
  {
    "name": "@fulcrum/e2e",
    "version": "0.1.0",
    "private": true,
    "scripts": { "test": "vitest" },
    "devDependencies": { "vitest": "..." }
  }
  ```

- [ ] Move `tests/e2e/claude-session.test.ts` (from P0-Task-0.3) into this package

- [ ] Add contract tests between packages:
  - `@fulcrum/memory` API contract (write → recall round-trip)
  - `@fulcrum/core` + `@fulcrum/teams` integration (task → team → complete)

- [ ] Commit: `feat(e2e): @fulcrum/e2e workspace with contract tests`

---

### Task 6.11 — Unify `ulid`/`ulidx` (F6-ISSUE-16) [LOW]

- [ ] `grep -r '"ulid"\|"ulidx"' packages/ --include="package.json"` to find both usages

- [ ] Pick one (recommend `ulidx` — ESM-native, maintained)

- [ ] Update all `import` statements to use the chosen package

- [ ] Remove the other from all `package.json` files

- [ ] Commit: `chore: unify ulid library — use ulidx everywhere`

---

### Task 6.12 — Barrel-file audit + per-package READMEs (F6-ISSUE-14, -15) [LOW]

- [ ] Audit `index.ts` files in each package — remove re-exports of internal
  implementation details that shouldn't be public API

- [ ] Add `README.md` to `packages/cli/` and `packages/worker/` (both missing)

- [ ] Commit: `docs(packages): cli and worker READMEs + barrel-file cleanup`

---

## Deeper Research

1. **`tsup` vs `tsc` + `rollup`** — `tsup` is simpler but `tsc` + `rollup` gives
   more control. For a monorepo, `tsup` is typically the right call. But verify
   that `tsup` correctly handles the `better-sqlite3` native module (it's a CJS
   module that needs special handling). Check `tsup` docs for `noExternal` option.

2. **`Db` port threading scope** — the `getDb()` singleton is used in ~40 call sites
   across 8 packages. The migration is risky. Confirm whether to do it all at once
   (risky, less churn) or incrementally per module (safer, more PRs). The F6 audit
   recommends incremental with 3 PRs.

3. **Plugin discovery in existing CLI tools** — VSCode uses `package.json` `"contributes"`.
   Obsidian uses `main` + `manifest.json`. Fulcrum's choice of `"fulcrum"` key is
   novel. Confirm no npm packages accidentally have a `"fulcrum"` key already.

4. **`madge` vs `dependency-cruiser`** — both detect cycles but `dependency-cruiser`
   is more configurable and can enforce import boundaries (e.g., "cli may import worker,
   but worker may NOT import cli"). Consider using `dependency-cruiser` for Task 6.6.

---

## Acceptance criteria

- `@fulcrum/kernel` exists as a leaf package with zero internal deps
- `pnpm build` succeeds for all 9 library packages
- `pnpm check:cycles` exits 0 (no circular dependencies)
- `getDb()` singleton deleted; all callers receive `db` via DI
- Each package has a valid `exports` map
- `@fulcrum/e2e` workspace runs integration + contract tests
- `pnpm test` green across all packages
