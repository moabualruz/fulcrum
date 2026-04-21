# Fulcrum — Agent Guide

This file is the authoritative rule set for AI coding agents working in this repo.
It covers invariants, patterns, and constraints — not package descriptions (those are in [README.md](README.md)).

---

## Session Quickload

Read this section first. Use later sections as authoritative detail when touching
that surface.

**Repo shape:** TypeScript ESM pnpm workspace for a local-first agent control
plane. Core value: task/run state, policy, memory, worktrees, workflows,
worker adapters, CLI/MCP/install surfaces, and agent integration artifacts.

**Fast context order:**

1. `fulcrum action exec get_current_context`
2. `fulcrum action exec get_workspace_status --json '{"workspace_id":"...","project_id":"..."}'`
3. `fulcrum action exec recall_knowledge --json '{"query":"...","workspace_id":"...","project_id":"..."}'`
4. `fulcrum action exec search_code --json '{"text":"...","workspace_id":"...","project_id":"..."}'`
5. Then use `rg`, `sed`, and source reads.

**Lifecycle CLI gotcha:** `start_agent_run` action payload uses
`agent_role`, not `role`; include `context_type`.

```bash
fulcrum action exec start_agent_run --json '{"workspace_id":"ws_...","project_id":"proj_...","task_id":"task_...","agent_role":"software_engineer","context_type":"primary"}'
```

For explicit work, prefer `create_task` first so the queue does not accumulate
opaque `[auto] ... run` tasks. End every run with exactly one
`complete_agent_run` or `block_agent_run`.

**Command map:**

| Need | Command |
|------|---------|
| All tests | `pnpm test` |
| All builds | `pnpm build` |
| Import cycle check | `pnpm run check:cycles` |
| Install dry run | `pnpm run setup:dry` |
| Install verification | `pnpm run setup:check` |
| Single package tests | `cd packages/<pkg> && pnpm test` |
| Single package build | `cd packages/<pkg> && pnpm build` when package has build script |
| Fulcrum CLI from source | `pnpm run fulcrum -- <args>` or `./fulcrum <args>` |

**Package/file map for first search:**

| Surface | Start Here |
|---------|------------|
| SQLite schema, IDs, roles, runs, tasks, events, embeddings | `packages/core/src/` |
| L0/L1/L2 memory, vault, curator, recall, Kuzu | `packages/memory/src/` |
| Policy engine, invariants, secret scanning | `packages/policy/src/` |
| CLI commands, MCP tools, action registry, hooks, TUI | `packages/cli/src/` |
| Runtime install/uninstall artifacts for agent hosts | `agent-integration/` and `packages/agent-fanout/` |
| Worker adapters and spawn lifecycle | `packages/worker/src/` |
| Worktree allocation, artifacts, merge queue | `packages/worktrees/src/` |
| Workflow definitions and runner | `packages/workflows/src/` |
| Team templates and invocation state | `packages/teams/src/` |
| Planning domain docs/issues/plans/reviews | `packages/planning/src/` |
| Monitor HTTP/SSE/dashboard | `packages/monitor/src/` |
| External sync/Plane/conflicts | `packages/sync/src/` |

**Keep in short memory:**

- Import specifiers in source need `.js` for relative imports.
- Canonical shared types live in `packages/core/src/types.ts`; downstream packages re-export.
- First-class IDs must use `newId(<type>)`; never bare `ulid()`.
- Role checks must use capability helpers (`canInvokeTeams`, `canMerge`, `canWriteCode`, `canEditFiles`, etc.), never slug string comparisons.
- Task-by-ID queries must include `AND workspace_id = ?`.
- Persisted enum unions need matching SQLite `CHECK` constraints and guard-test entries.
- Memory writes are L0 vault first, then L1 SQLite, then async L2. Never sync-write L2.
- Vault self-write suppression depends on `upsertStateEntry()` before `writeFileSync()` and full 64-char body SHA-256.
- `checkPolicy` belongs before `startAgentRun`; `startAgentRun` does not enforce WIP/dependency policy itself.
- `wip_limit: 0` means fully blocked, not unlimited.
- Tests use real in-memory SQLite via `setDb` / `_configureDb` / `runMigrations`; do not mock DB.
- Vitest pool stays `forks`; `better-sqlite3` is not thread-safe.
- `@fulcrum/worker` owns subprocess spawning and adapter contracts. Other packages should not grow executor-specific behavior.
- Do not touch the `FULCRUM managed-block` at the bottom by hand.

**Current docs/workflow map:**

- User-facing guides: `docs/guides/`
- Active/recent execution plans and progress: `docs/plans/`
- Handoffs/pickup prompts: `docs/handover/`
- Agent-host reference research: `docs/reference/`
- Decisions/ADRs: `docs/decisions/`
- README package map and quick-start: `README.md`

**External library/API docs:** use Context7 before answering or coding against a
library, framework, SDK, API, CLI tool, or cloud service:

```bash
npx ctx7@latest library <OfficialName> "<full user question>"
npx ctx7@latest docs /org/project "<full user question>"
```

Pick the best `/org/project` match from the `library` result. If Context7 hits a
quota error, tell the user and suggest `npx ctx7@latest login` or
`CONTEXT7_API_KEY`.

---

## What This Repo Is (and Is Not)

**Fulcrum is control-plane-first.** Its center of gravity is state, policy, intent,
persistence, memory, and scheduling. It records work, enforces limits, stores memory
across three layers (L0/L1/L2), and emits events.

**Fulcrum also ships `@fulcrum/worker`** — a thin execution layer built around a
pluggable `AgentAdapter` contract. Two adapters ship in-box:

- `stub` — reads a canned `WorkerResult` JSON from `$FULCRUM_AGENT_STUB_DIR/<run_id>.json`,
  used in tests and dry-runs
- `subprocess` — runs a user-configured command, surfaces the `SpawnContext` via env
  vars, and parses a `WorkerResult` from stdout

Userland can register additional adapters (Claude CLI, Gemini CLI, a co-running Pi
runtime, or anything else) via `registerAgentAdapter(adapter)`. The control plane
itself still **never** hardcodes a specific LLM API, a specific agent CLI wire format,
or OS-level process management — those always live in userland adapters.

Integration with Pi as a co-runtime is still a valid and supported pattern, but it is
no longer the only pattern. The same `SpawnableRun` / `SpawnContext` contract covers
the built-in adapters, user-registered adapters, and Pi.

See [README.md#architecture](README.md#architecture) for the full package map and dependency graph.

---

## Package Ownership Boundaries

Each package owns exactly one concern. Never reach across boundaries:

| Package | Owns | Never does |
|---------|------|------------|
| `@fulcrum/core` | SQLite schema, domain functions, embedding registry, event stream | File I/O outside `.fulcrum/`, LLM calls |
| `@fulcrum/memory` | L0 vault files, L1 memory rows, L2 Kuzu graph | Core task/run state |
| `@fulcrum/monitor` | Metrics queries, HTTP server | Mutating any state |
| `@fulcrum/planning` | Epics, issues, PRDs, plans, reviews | Task run lifecycle |
| `@fulcrum/policy` | Rule evaluation, secret scanning, audit log | Enforcing outside its own engine |
| `@fulcrum/sync` | External push/pull (Plane), conflict state | Internal domain state mutations |
| `@fulcrum/teams` | Team template + instance lifecycle | Direct agent spawning |
| `@fulcrum/workflows` | Workflow definition + run state machine | Executing step side-effects directly |
| `@fulcrum/worker` | `AgentAdapter` registry, `spawnAgent` lifecycle, built-in `stub` + `subprocess` adapters | Direct LLM API calls; specific agent CLI wire formats (those live in userland adapters) |
| `@fulcrum/worktrees` | Worktree allocation, artifact tracking, merge queue | Git operations inside a worktree (adapters/Pi run those) |

If a function would need to cross a boundary, it belongs in the package being crossed into, not the one calling.

---

## Architectural Invariants — Never Violate These

### 1. L0 is the canonical commit point for memory

```
L0 (vault file) FIRST → L1 (SQLite INSERT) → L2 (Kuzu, async via setImmediate)
```

- Never write L1 without first succeeding at L0 (when vault exists and `skipVaultWrite` is not set)
- Never write L2 synchronously — it always goes through `setImmediate` / the queue
- L0 body SHA-256 must use the full 64-char hex digest — never truncate (truncation breaks echo-suppression in the watcher)

### 2. State entry must be written before the vault file rewrite

In `watcher.ts` and `write.ts`: `upsertStateEntry()` before `writeFileSync()`.
If reversed, the watcher fires on its own write and triggers a spurious EDIT event.

### 3. checkPolicy before startAgentRun — always

Policy is not checked inside `startAgentRun`. The caller is responsible. Tests that
skip `checkPolicy` are testing implementation, not the production path.

### 4. Only `chief_of_staff` can invoke teams

Enforced by `@fulcrum/policy` `SYSTEM_INVARIANTS` (`only_l1_invokes_teams`) and by the
capability helper `canInvokeTeams(role)` from `@fulcrum/core`. Do not add bypass logic
for any reason. Call `canInvokeTeams(role)` — never compare `role === 'chief_of_staff'`.

### 5. Only `integration_worker` can merge worktrees

Same invariant set (`only_integration_worker_merges`). Call `canMerge(role)` — never
compare against the role slug string. No exceptions.

### 6. Only `chief_of_staff` can perform direct file edits

Enforced by the `chief_of_staff_no_direct_writes` `SYSTEM_INVARIANT`. The policy engine
denies any `tool_use:Write`, `tool_use:Edit`, `tool_use:MultiEdit`, `tool_use:NotebookEdit`,
or `shell_exec:git *` action from a `chief_of_staff` agent. CoS delegates all code and
state mutations to subordinate roles. This invariant is **not** overridable.

### 7. Role boundary checks must use capability helpers, not string comparisons

All role-based branching must go through the capability helpers exported from
`@fulcrum/core`:

- `isL1(role)` — is this an L1 (team-invoking) role?
- `roleCapabilities(role)` — full capability object
- `canInvokeTeams(role)` / `canMerge(role)` / `canWriteCode(role)` / `canEditFiles(role)`

There is a guard test at `packages/core/src/tests/role-string-guard.test.ts` that walks
every `packages/*/src/**/*.ts` file and fails if any production code compares against a
role slug string (`'chief_of_staff'`, `'integration_worker'`, etc.). Exactly three files
are allowlisted: `packages/core/src/roles.ts`, `packages/core/src/types.ts`, and
`packages/core/src/status.ts`. If you add a new role check anywhere else, add a helper
in `roles.ts` and call that instead.

### 8. Use `newId()` for all first-class IDs

All first-class entity IDs (tasks, runs, memories, workspaces, teams, artifacts, etc.)
must be minted via `newId(<type>)` from `packages/core/src/ids.ts`. The function emits
a typed, prefixed ULID (e.g. `run_01H…`) and is the only approved ID source for the
domain layer.

A guard test at `packages/core/src/tests/ulid-guard.test.ts` blocks bare `ulid()` calls
outside a five-file allowlist (`core/ids.ts`, `memory/graph.ts`, `memory/ingest.ts`,
`sync/sync-manager.ts`, `monitor/metrics.ts`). If you add a new entity type, register
its prefix in `PREFIXES` in `packages/core/src/ids.ts` and call `newId(<type>)`.

### 9. Enum columns must have a DB CHECK constraint

Every TypeScript enum type union that is persisted to SQLite must also be enforced at
the DB level via a `CHECK` constraint in the migration. The guard test at
`packages/core/src/tests/check-constraints.test.ts` iterates every entry in
`GUARDED_COLUMNS` (currently 15 enum columns across tasks, runs, memories, artifacts,
workflows, etc.) and asserts that the `CHECK` values match the TS union exactly.

If you introduce a new persisted enum: add the `CHECK` in the migration, add the column
to `GUARDED_COLUMNS` in the guard test, and update the TS union — all in the same PR.

### 10. Task lookup must be scoped by workspace_id

Any query that fetches a task by ID must include `AND workspace_id = ?`. Cross-workspace
task leakage is a security invariant, not just a data integrity concern.

### 11. WIP limit 0 means fully blocked

`wip_limit: 0` for a role means zero runs allowed — not "unlimited". `checkPolicy` must
treat 0 as a hard block.

### 12. Memory dedup is content-hash based, not semantic

`isDuplicate()` hashes the raw content string. Do not add semantic (vector) dedup to the
write path — it would add LLM latency to every write.

---

## SQLite Patterns

**All DB access goes through `getDb()` — never open a second connection:**

```typescript
import { getDb } from '@fulcrum/core'
const db = getDb()
```

**Tests inject an in-memory DB — never call `getDb()` directly in tests:**

```typescript
import Database from 'better-sqlite3'
import { setDb, _configureDb, runMigrations } from '@fulcrum/core'

const db = new Database(':memory:')
_configureDb(db)
runMigrations(db)
setDb(db)
```

**JSON columns:** `tags`, `entities`, `provenance_refs` are stored as JSON strings.
Always `JSON.stringify()` on write and `JSON.parse()` on read. The mapper in `mappers.ts`
handles this for `memories` rows — don't duplicate the logic.

**Synchronous vs async:** `better-sqlite3` is synchronous. Do not wrap DB calls in
`await` unless the function itself is async for other reasons. Mixing sync DB calls with
async wrappers causes subtle ordering bugs.

**Vitest pool:** Tests must run with `pool: 'forks'` — `better-sqlite3` is not thread-safe.
Never change this to `threads`.

---

## Memory System Patterns

**Current:** memory v3 is the only memory path (PR 9.5 retired the
`FULCRUM_MEMORY_V3` opt-out flag). See
[`docs/architecture/memory-v3.md`](architecture/memory-v3.md) for the operator
reference — layer glossary, curator pipeline, feature flags, `/memory/stats`
schema, and end-to-end walkthrough.

The v2a invariants below (L0 canonical commit point, `MemoryKind` catalog, vault
watcher echo suppression) still apply to the v2a code paths that remain in the
tree during the PR 9 deprecation window. New code targets v3 primitives directly
(`ingestRawSource`, `createCuratedPage`, `runCurator`, `applyDecay`).

See [README.md#memory-system-three-layers](README.md#memory-system-three-layers) for the
v2a full architecture. Agent rules:

`MemoryKind` currently has **16** values (`fact`, `summary`, `symbol`, `decision`,
`procedure`, `error`, `diff`, `doc`, `code`, `task_goal`, `task_decision`, `task_failure`,
`task_outcome`, `tool_trace`, `reasoning_step`, `lesson`).

The canonical definition of `MemoryKind` now lives in `@fulcrum/core/src/types.ts` and
is re-exported from `@fulcrum/memory` — the memory package no longer owns the union.
This is the same pattern Round 3 applied to every shared domain type: canonical in
core, re-exported through other packages for ergonomics.

**Do not add new memory kinds without updating all four locations:**

1. `MemoryKind` union in `packages/core/src/types.ts` (canonical)
2. `CuratedKind` or `OperationalKind` type alias in `@fulcrum/memory` (determines vault directory)
3. `CURATED_KINDS` or `OPERATIONAL_KINDS` set (same file)
4. `SCHEMA_YAML_CONTENT` string in `packages/memory/src/vault/client.ts`

**Track 2 LLM extraction is gated on curated kinds only:**

```typescript
const TRACK2_KINDS = new Set(['decision', 'fact', 'lesson', 'error', 'task_outcome'])
```

Do not run LLM extraction on operational memories — they're high-volume and cost-sensitive.

**Kuzu Cypher patterns (v0.10.x):**

- Use `CAST($field AS TIMESTAMP)` — not `datetime()`
- Use `result.getAll()` — not `result.getNext()`
- Inline NOT EXISTS: `WHERE NOT EXISTS { MATCH (:Memory)-[:UPDATES]->(m) }` is supported
- Hot entity penalty: entities with `mention_count > 1000` get 0.1× weight multiplier in graph traversal

**Vault watcher echo suppression:**

The watcher ignores file changes where `sha256(body)` matches the `.state.json` entry.
This suppresses self-writes from `writeMemoryFile()`. Only body changes (not frontmatter)
trigger the comparison — frontmatter-only rewrites (e.g. updating `updated_at`) are
deliberately suppressed.

---

## Memory Tiers (v3 draft)

> **Draft status.** The v3 schema + types have landed
> (`packages/memory/src/schema.ts`, `packages/memory/src/l0/types.ts`) but no
> runtime path invokes them yet. Keep writing memories via the v2a surface
> (`writeMemory`, `ingestFile`, hooks) until PR 1 lights up L0 writes. Full
> spec: [`docs/plans/2026-04-18-002-memory-tiered-architecture-plan.md`](docs/plans/2026-04-18-002-memory-tiered-architecture-plan.md).

Memory v3 splits the single `memories` + `vault/memories/curated/` surface
into three tiers:

- **L0 — raw dumps.** `${vault}/raw/<source_type>/YYYY/MM/DD/<ULID>.md`.
  Verbatim, zero truncation, immutable. Index row in `l0_sources`.
  Source types: `bash_trace | tool_trace | file_patch | session_transcript | prompt_attachment | web_capture | edit_diff | correction`.
- **L1 — curated wiki.** `${vault}/curated/{entities,concepts,pages,synthesis}/<ULID>.md`.
  LLM-maintained markdown; every page carries `confidence`, `retention_tier`,
  `sources[]` (→ L0 ULIDs), `supersedes[]`, and `entities[]`. The `memories`
  table is the L1 index — extended with 4 lifecycle columns
  (`retention_tier`, `confidence_decay_at`, `superseded_by`,
  `consolidated_from_ids`). The `l1_pages` view projects v3-schema rows
  (`schema_version >= 3`) under their v3 column names; the view is read-only
  (writes still go to `memories`).
- **L2 — vector on L1.** `vec_memories` embeds curated L1 bodies, not raw
  L0 dumps. `vec_chunks` continues to embed code unchanged.

**Feature flag:** `FULCRUM_MEMORY_V3` was retired in PR 9.5. v3 is now the
only memory path — no flag, no fallback.

**Graph tables.** `graph_entities` and `graph_edges` were extended in place
with v3 columns (`aliases`, `confidence`, `first_seen`, `last_confirmed`,
`source_ids`) via `ALTER TABLE ADD COLUMN`. Plan-level names (`type`,
`attributes`, `from_id`, `to_id`, `rel_type`) map to the pre-existing
physical columns (`entity_type`, `properties`, `source_id`, `target_id`,
`relation`); see §Knowledge graph in the plan for the full mapping table.

**Migration mechanics.** Memory v3 follows the extension-package convention
established by `packages/teams/src/schema.ts` / `packages/workflows/src/schema.ts`:
TS function `runMigrationNNNName(db)`, idempotent DDL guarded by
`PRAGMA table_info`, ledger row via `INSERT OR IGNORE INTO schema_migrations`.
No `.sql` files — rollback SQL lives as comments above each forward block.
Number block `101..104` is reserved for the v3 chain.

---

## Policy Engine Patterns

**System invariants live in `packages/policy/src/engine.ts` as `SYSTEM_INVARIANTS`.**
They have priority 1000 and cannot be overridden by any custom rule. Never remove or
weaken them. The set currently has **four** rules:

1. `only_l1_invokes_teams` — only `chief_of_staff` may invoke a team
2. `only_integration_worker_merges` — only `integration_worker` may merge a worktree
3. `no_task_bypass` — every run must be tied to a real task
4. `chief_of_staff_no_direct_writes` — CoS cannot Write/Edit/MultiEdit/NotebookEdit or run `git *` via `shell_exec`

**`evaluatePolicy()` never throws for a denial** — it returns `{ allowed: false, reason }`.
It throws only for invalid configuration or unknown actor/resource types.

**Secret scanning must run before any external push** — `checkSecrets()` in the sync
adapter runs before every `push()` call. Do not skip it even for "internal" objects.

---

## Kuzu Native Module

`@fulcrum/memory` depends on `kuzu` — a Rust native addon. The root `.npmrc` contains:

```
onlyBuiltDependencies[]=kuzu
```

This is required for pnpm 10. If you add kuzu to a new package, add its name here too.
See [CONTRIBUTING.md#native-module-dependencies](CONTRIBUTING.md#native-module-dependencies).

---

## Testing Rules

**Every code path must have a test.** The suite is currently at **~980 tests** across
all packages and uses in-memory SQLite (see patterns above). New code lands with new
tests — no exceptions.

**Test file location:** `packages/<pkg>/src/tests/` — mirror the source file name:
`vault/watcher.ts` → `tests/vault-watcher.test.ts`

**Test isolation:** Each test should call `resetTestDb()` (or set a fresh db) in
`beforeEach`. Never share mutable state between tests.

**Do not mock the DB.** Mocked DB tests missed production migration failures in the past.
Use the real SQLite in-memory path.

**Embedding tests are opt-in** and gated on `FULCRUM_EMBEDDING_TESTS=1`. They download
~500 MB of ONNX models on first run. Never make them run by default.

---

## Commit and PR Rules

See [CONTRIBUTING.md#commit-message-style](CONTRIBUTING.md#commit-message-style) for
Conventional Commits format. Short rules:

- `feat`, `fix`, `docs`, `test`, `refactor`, `chore` — pick one
- Scope is the package name: `feat(memory)`, `fix(policy)`, `test(core)`
- Body explains **why**, not what
- One logical change per PR — don't bundle unrelated fixes

---

## File and Import Conventions

**Imports use `.js` extension in source files** (ESM + TypeScript `moduleResolution: bundler`):

```typescript
import { writeMemory } from './write.js'   // ✓
import { writeMemory } from './write'       // ✗
```

**Re-exports:** Each package has a single `src/index.ts` that defines the public API surface.
Do not import from internal paths in other packages — always go through the index.

**Canonical types live in `@fulcrum/core`.** Shared domain types (like `MemoryKind`,
`AgentRole`, `AgentRunStatus`, `TaskStatus`) are defined in `packages/core/src/types.ts`
and re-exported from downstream packages (`@fulcrum/memory`, `@fulcrum/policy`, etc.).
Do not duplicate a type in a downstream package — import from core and re-export if you
need it at the package boundary. This is the pattern Round 3 applied to `MemoryKind`.

**Types live in `types.ts`** at the package root (`src/types.ts`). Do not scatter type
definitions across implementation files.

---

## What NOT to Add

- **No network calls in core / memory / policy / planning** — those packages are local-first by design
- **No `process.spawn` / `child_process` outside `@fulcrum/worker`** — subprocess spawning is confined to the worker package and its adapters; nothing else in the monorepo may spawn a child process
- **No hardcoded workspace or project IDs** — always pass via input or config
- **No synchronous LLM calls on the write path** — embedding and extraction are async
- **No LLM API clients or CLI wire formats in `@fulcrum/worker` itself** — those belong in userland adapters registered via `registerAgentAdapter`
- **No global mutable state outside `getDb()` / `setDb()` and the `AgentAdapter` registry** — those are the only acceptable globals in this codebase

---

## SpawnableRun — The Fulcrum → Execution-Layer Contract

`SpawnableRun` is the typed handoff from Fulcrum's domain layer to **any** execution
layer — the built-in `@fulcrum/worker` `stub` / `subprocess` adapters, a user-registered
adapter (Claude CLI, Gemini CLI, etc.), or a co-running Pi runtime. It contains
everything the adapter needs to spawn an agent without re-querying the DB:

```typescript
const run = startAgentRun({
  workspace_id, task_id,
  role: 'software_engineer',
  pi_profile: 'claude-cli/claude-opus-4-6',
})

// Either side — built-in worker or userland adapter:
const spawnable = buildSpawnableRun(run, {
  goal: 'implement feature X',
  task_type: 'implement',
})
```

The execution layer then goes through the adapter contract defined in
`@fulcrum/worker/src/types.ts`:

- Each adapter implements `spawn(ctx: SpawnContext): Promise<WorkerResult>`
- `SpawnContext` carries `run_id`, `handoff`, `worktree_path`, `adapter_config`, and
  the full `SpawnableRun` blob — everything needed to dispatch work without touching
  the DB
- `WorkerResult` carries terminal status, artifacts, and any error info, and is
  translated back into `completeAgentRun` / `blockAgentRun` / `failAgentRun` by
  `spawnAgent` in `@fulcrum/worker/src/lifecycle.ts`

Changes to `AgentRun` shape that affect `SpawnableRun` — or to `SpawnContext` /
`WorkerResult` — are a breaking change for **every** downstream adapter, not just Pi.
Treat them as such.

---

## Tool Registry — Unified Handler Pattern

All 23 MCP tool implementations live in `packages/cli/src/tool-registry.ts` as a `Map<string, RegistryEntry>`. Every entry has:

```typescript
interface RegistryEntry {
  schema: ToolSchema | undefined     // undefined = internal tool (not served via MCP)
  capabilities: ToolCapabilities     // readOnly, destructive, hookEquivalent, minRole?
  handler: (args, deps) => Promise<unknown>
}
```

**Rules:**
- Add new tools to `TOOL_REGISTRY` in `tool-registry.ts` — never add handler logic directly to `index.ts`
- `buildDeps(workspace_id, project_id)` resolves DB + workspace context once at server startup. Do not call `currentProjectIds()` inside handlers.
- Handlers default `workspace_id`/`project_id` from `deps` when the caller omits them: `const ws = (args.workspace_id as string | undefined) ?? deps.workspace_id`
- Set `hookEquivalent: true` only for tools whose logic is already called in-process by a hook. Currently: `recall_memory`, `write_memory`, `get_current_context`.
- Set `minRole: 'chief_of_staff'` for tools that only L1 roles may call. Currently: `invoke_team`.
- `schema: undefined` marks internal tools visible to the MCP resource handler but not served in the tool list (currently: `get_task`).

**Capability lint:** `packages/cli/src/tests/tool-registry.test.ts` asserts that all 23 public entries have complete capabilities, `readOnly` matches `readOnlyHint`, `hookEquivalent` is set on exactly 3 tools, and `minRole` is set on exactly `invoke_team`.

**CLI access:** Every tool is also callable without a live MCP server:
```bash
fulcrum tool exec <tool-name> [--json <payload>]
fulcrum tool list [--json]
```

---

## MCP Tool Naming Conventions

Tool schemas live in `packages/cli/src/mcp-tools.ts`. When adding a new tool:

- **Names must be `snake_case`** — enforced by `mcp-tools-lint.test.ts`
- **Read tools must declare `readOnlyHint: true`** — any tool whose `name` starts with `list_`, `get_`, `recall_`, or `build_` is classified as read-only. Set `annotations: { readOnlyHint: true }` or CI will fail.
- **Write tools must NOT declare `readOnlyHint: true`** — tools starting with `create_`, `update_`, `delete_`, `write_`, `start_`, `complete_`, `block_`, or `invoke_` cannot claim to be read-only.
- **Idempotent reads should also set `idempotentHint: true`** — most `list_*` and `get_*` tools qualify.

The lint test is `packages/cli/src/tests/mcp-tools-lint.test.ts`. Run `pnpm test` in `packages/cli` to verify.

---

## Further Reading

| Topic | Location |
|-------|----------|
| Package descriptions and full API | [README.md](README.md) |
| Memory system deep-dive (L0/L1/L2) | [README.md#memory-system-three-layers](README.md#memory-system-three-layers) |
| Agent roles (all 24) | [README.md#agent-roles](README.md#agent-roles) |
| Configuration reference | [README.md#configuration](README.md#configuration) |
| Dev setup and test commands | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Design specs | [docs/superpowers/specs/](docs/superpowers/specs/) |
| Implementation plans (per-package, round 1..5) | [docs/superpowers/plans/](docs/superpowers/plans/) — see especially `2026-04-14-round-1..5-*.md` for the Round 1–5 gap-closure plans |
| Gap analysis history (5 rounds) | [docs/gap-analysis/](docs/gap-analysis/) — raw findings and validated gap lists that drove rounds 1–5 |
| User-facing guides | [docs/guides/](docs/guides/) — workflow authoring, worker adapters, telemetry, CLI reference |

<!-- BEGIN FULCRUM managed-block v1 -->
## Fulcrum canonical rules (auto-generated)

---
name: fulcrum-first
description: Prefer Fulcrum recall + code-search before filesystem grep. Nudge, not gate.
---

# Fulcrum-first

Before `Grep`/`Glob`/`Read`, try Fulcrum. Fulcrum holds prior decisions, task outcomes, code relations. Filesystem does not.

Questions "where is X", "why X done", "does X exist" — call in order:

1. `fulcrum action exec recall_knowledge` — NL query over L1 curated memory (L0 provenance).
2. `fulcrum action exec search_code` — symbol + structural search.

Fall to `Grep`/`Glob`/`Read` only if both empty. Filesystem tools stay available. Bias = default ordering, not block.

Opt out: `FULCRUM_NO_RECALL_NUDGE=1`.

---

---
name: lifecycle
description: Register every session as Fulcrum agent run. Start, heartbeat, complete or block.
---

# Lifecycle

Session start, before first task:

1. `fulcrum action exec get_current_context` — returns `workspace_id`, `project_id`.
2. `fulcrum action exec get_workspace_status` — running work, blockers, queue.
3. `fulcrum action exec start_agent_run` — pass role + task. Save `run_id`.

Long ops (>5 min):

4. `fulcrum action exec heartbeat_agent_run` every 3–5 min. No heartbeat 10 min = stale.

Task end, exactly one:

5. `fulcrum action exec complete_agent_run` — summary + artifact paths.
6. `fulcrum action exec block_agent_run` — reason if stuck on human/external.

Silent end without complete/block = run stays `running`; janitor marks stale.

---

---
name: role-boundaries
description: CoS orchestrates only, never writes code. Specialists implement. Only CoS invokes teams.
---

# Role boundaries

`chief_of_staff` (L1, orchestration only):

- No code writes, file edits, builds, test mods.
- Creates tasks, delegates to specialists, synthesizes results.
- Only role that may `invoke_team` or spawn sub-orchestration.

L2 specialists:

- No `invoke_team`. No sub-orchestration.
- Focus on assigned task. Report via `complete_agent_run` with summary + artifacts.

Specialist sees orchestration need → do not spawn team. `block_agent_run` with reason (request CoS coordination), or surface to user.
<!-- END FULCRUM managed-block v1 -->
