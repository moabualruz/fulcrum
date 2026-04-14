# Fulcrum — Agent Guide

This file is the authoritative rule set for AI coding agents working in this repo.
It covers invariants, patterns, and constraints — not package descriptions (those are in [README.md](README.md)).

---

## What This Repo Is (and Is Not)

**Fulcrum is the control plane — state, policy, and intent only.**

It records work, enforces limits, stores memory, and emits events.
It does **not** spawn agent processes, make LLM API calls, or manage OS-level processes.

**Pi is the execution layer** (separate repo). Pi resolves `AgentRole → pi_profile`, calls
`startAgentRun()` to register intent, spawns the process, and calls `completeAgentRun()` when done.

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
| `@fulcrum/worktrees` | Worktree allocation, artifact tracking, merge queue | Git operations (those are in Pi) |

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

Enforced by `@fulcrum/policy` `SYSTEM_INVARIANTS`. Do not add bypass logic for any reason.

### 5. Only `integration_worker` can merge worktrees

Same invariant set. No exceptions.

### 6. Task lookup must be scoped by workspace_id

Any query that fetches a task by ID must include `AND workspace_id = ?`. Cross-workspace
task leakage is a security invariant, not just a data integrity concern.

### 7. WIP limit 0 means fully blocked

`wip_limit: 0` for a role means zero runs allowed — not "unlimited". `checkPolicy` must
treat 0 as a hard block.

### 8. Memory dedup is content-hash based, not semantic

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

See [README.md#memory-system-three-layers](README.md#memory-system-three-layers) for the
full architecture. Agent rules:

**Do not add new memory kinds without updating all four locations:**

1. `MemoryKind` union in `packages/memory/src/types.ts`
2. `CuratedKind` or `OperationalKind` type alias (determines vault directory)
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

## Policy Engine Patterns

**System invariants live in `packages/policy/src/engine.ts` as `SYSTEM_INVARIANTS`.**
They have priority 1000 and cannot be overridden by any custom rule. Never remove or
weaken them.

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

**Every code path must have a test.** Tests use in-memory SQLite (see patterns above).

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

**Types live in `types.ts`** at the package root (`src/types.ts`). Do not scatter type
definitions across implementation files.

---

## What NOT to Add

- **No network calls in core** — Fulcrum is local-first by design
- **No process.spawn / child_process** — that's Pi's job
- **No hardcoded workspace or project IDs** — always pass via input or config
- **No synchronous LLM calls on the write path** — embedding and extraction are async
- **No global mutable state outside `getDb()` / `setDb()`** — the DB singleton is the
  only acceptable global in this codebase

---

## SpawnableRun — The Fulcrum → Pi Contract

`SpawnableRun` is the typed handoff from Fulcrum to Pi. It contains everything Pi needs
to spawn an agent without re-querying the DB:

```typescript
const run = startAgentRun({
  workspace_id, task_id,
  role: 'software_engineer',
  pi_profile: 'claude-cli/claude-opus-4-6',
})

// Pi side (not in this repo):
const spawnable = buildSpawnableRun(run, {
  goal: 'implement feature X',
  task_type: 'implement',
})
// → pi.executor.spawn(spawnable)
```

Changes to `AgentRun` shape that affect `SpawnableRun` are a breaking change for Pi.
Treat them as such.

---

## Further Reading

| Topic | Location |
|-------|----------|
| Package descriptions and full API | [README.md](README.md) |
| Memory system deep-dive (L0/L1/L2) | [README.md#memory-system-three-layers](README.md#memory-system-three-layers) |
| Agent roles (all 23) | [README.md#agent-roles](README.md#agent-roles) |
| Configuration reference | [README.md#configuration](README.md#configuration) |
| Dev setup and test commands | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Design specs | [docs/superpowers/specs/](docs/superpowers/specs/) |
| Implementation plans | [docs/superpowers/plans/](docs/superpowers/plans/) |
