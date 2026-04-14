# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

---

## [0.0.1] — 2025-04-13

### Added

**`@fulcrum/core`** — initial release of the local-first agent control plane.

#### Domain functions (14 total)
- `listTasks`, `createTask`, `updateTask` — task lifecycle with optimistic locking
- `startAgentRun`, `heartbeatAgentRun`, `getAgentRunStatus`, `completeAgentRun`, `blockAgentRun`, `escalateRun` — agent run lifecycle
- `checkPolicy` — WIP limit enforcement (global + per-role) and dependency checks
- `writeMemory`, `recallMemory` — hybrid memory with FTS5 + optional vector ANN + BGE reranker
- `getWorkspaceStatus`, `buildCosContext`, `listAgentProfiles` — status and chief-of-staff context

#### Infrastructure
- SQLite schema with WAL mode, foreign keys, FTS5 virtual tables, and `sqlite-vec` for optional vector search
- `runMigrations` — idempotent schema migrations
- `loadConfig` — `.fulcrum.json` file + env var overrides
- `startJanitor` — background timer with overlapping-cycle protection
- `LocalEmbeddingProvider` and `LocalRerankerProvider` with promise-cache warmup

#### Hardened validation and isolation
- Policy checks validate per-role WIP limits are non-negative
- `checkPolicy` task lookup is workspace-scoped (prevents cross-workspace leakage)
- `startAgentRun` validates `workspace_id` matches the task's actual workspace
- `blockAgentRun` and `escalateRun` validate non-empty reason strings
- FTS5 fallback catches any `SQLITE_ERROR` (not just keyword-matched messages)

#### Test suite
- 91 tests, 0 failures (2 skipped behind `FULCRUM_EMBEDDING_TESTS=1`)
- In-memory SQLite injection via `setDb()` for fast, isolated tests

---

### `@fulcrum/memory` — Three-Layer Memory Stack

#### L0 — Git-backed vault (`~/.fulcrum/vault/`)
- Human-readable markdown memories with YAML frontmatter; curated kinds committed to git, operational kinds gitignored
- Vault watcher (chokidar) detects human edits: validates schema, updates `content_hash`/`updated_at`, triggers L1+L2 sync
- Git branch workflow: per-task `memory/<task_id>` branches merge to main with `--no-ff`
- `reconcileMergedBranch()`: post-merge L1+L2 reconciliation via explicit merge commit SHA resolution

#### L1 — SQLite FTS5 (wired to L0)
- `writeMemory()` writes L0 first (canonical commit point), then syncs L1 synchronously
- `insertMemoryDirect()`: idempotent L0→L1 rebuild preserving original memory IDs
- SHA-256 content deduplication; drift verification mode

#### L2 — Kuzu embedded graph + HNSW (opt-in)
- 13 node/edge table types; Memory and Entity nodes; 14 edge types (Memory→Entity, Entity→Entity, Memory→Memory)
- 6-stage retrieval pipeline: HNSW vector seed → 1-hop graph expansion → 2-hop entity expansion → superseded filter → fused scoring → MMR diversification
- Workspace affinity scoring (+1.0 same, +0.3 related, −0.6 contradiction penalty)
- Hot entity penalty (mention_count > 1000 → 0.1× edge weight)

#### Extraction pipeline
- Track 1 (sync, rule-based): ID prefix rules, file path detection, wikilinks → `MENTIONS`/`PRODUCED_IN` edges
- Track 2 (async, LLM-backed): queued for semantic extraction on curated kinds

#### Setup
- `fulcrum memory init` / `runMemoryInit()`: interactive vault + L2 setup wizard
- `fulcrum memory accelerate` / `activateL2()`: enable L2 on existing vault
- `fulcrum memory rebuild [--target l1|l2|both] [--verify]`: idempotent index rebuild from L0 files

---

### `@fulcrum/monitor`
- Daily, project, and agent metrics aggregation from SQLite task/run data
- Burndown data computation (planned vs. completed over time)
- HTTP server exposing `/metrics`, `/health` endpoints for external monitoring

### `@fulcrum/planning`
- Epic and issue management with status lifecycle (draft → active → closed)
- PRD (Product Requirements Document) creation and versioning
- Plan linking: associate issues to implementation plans
- Task relation graph: `blocks`, `blocked_by`, `relates_to`, `duplicates` edges
- Code review workflows: request, update, approve/reject with reviewer assignment

### `@fulcrum/policy`
- `SYSTEM_INVARIANTS`: always-on workspace rules (WIP cap, no orphaned runs, role allowlists)
- Custom policy rules: per-workspace, per-role, per-action rule evaluation
- `checkSecrets` / `redactSecrets`: pattern-based secret detection and redaction in agent outputs
- Append-only audit log: every policy evaluation recorded with actor, outcome, and context

### `@fulcrum/sync`
- Plane API client: authenticated requests to Plane project management REST API
- Plane adapter: maps Fulcrum `Task`/`Issue` fields to Plane cycle/issue model and back
- Sync manager: bidirectional sync with configurable direction (fulcrum→plane, plane→fulcrum, both)
- Conflict detection: tracks `SyncState` per item, flags diverged fields for resolution

### `@fulcrum/teams`
- `TeamTemplate`: defines team composition (role slots, size constraints, communication mode)
- `TeamSlot`: typed role + model + latency/budget/quality class constraints
- `canStartTeam(template, workspaceStatus)`: scheduler gate — checks WIP headroom before spawning
- Team policy: `CommunicationMode`, `WorktreePolicy`, `BudgetClass`, `LatencyClass`, `QualityClass`

### `@fulcrum/workflows`
- `WorkflowDefinition`: named, versioned step graphs with typed transitions and entry points
- `WorkflowStepDef`: step type (task, decision, parallel, wait), handler reference, retry policy
- Workflow registry: lookup by `(name, version)`, list available definitions
- Workflow engine: advance a `WorkflowRun` through steps, evaluate transitions, handle failures

### `@fulcrum/worktrees`
- `Worktree`: per-task isolated git workspace with status lifecycle (pending → active → merged/abandoned)
- `Artifact`: typed output files (diff, report, build-output, test-results) attached to worktrees or runs
- `Review`: code review request with status (pending → approved/rejected/changes_requested), reviewer tracking
- Handoff mode: `auto` (merge on approval) vs `manual` (human review gate)

[Unreleased]: https://github.com/moabualruz/fulcrum/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/moabualruz/fulcrum/releases/tag/v0.0.1
