# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

#### CLI
- **`fulcrum doctor`** — environment and configuration health check command. Runs 8 checks (Node.js ≥ 20, `.fulcrum.json`, data directory, `better-sqlite3` native module, database liveness, `@modelcontextprotocol/sdk`, environment variables, agent integration files) and prints a PASS/WARN/FAIL report. Exits 1 when any check fails. Supports `--json` for machine-readable output.
- **`fulcrum serve mcp-http`** — HTTP-transport MCP server using `StreamableHTTPServerTransport`. Each request gets a fresh `McpServer` + stateful transport (per-request session ID). Default port 4722. Suitable for network-accessible MCP access without stdio.
- **`recall_memory` MCP tool** — `max_chars` optional parameter (default 8000) truncates each returned memory for token-budget control. `project_id` is now optional; omit to search across the whole workspace.

#### Core APIs
- **`withTransaction<T>(fn)`** — SQLite IMMEDIATE transaction wrapper in `@fulcrum/core/db/client`. Uses `.immediate()` locking (BEGIN IMMEDIATE) to prevent read-upgrade deadlocks under WAL mode. Rollback is automatic on any thrown error.
- **`checkDbHealth()`** — liveness probe that runs `SELECT 1` and returns `{ ok: true, latencyMs: N }` or `{ ok: false, error: string }`. Used by `fulcrum doctor` and the monitor health endpoint.
- **`decayMemories(workspace_id?)`** in `@fulcrum/core/janitor` — multiplicative freshness decay for low-importance memories not recently accessed. Formula: `importance * DECAY_FACTOR^weeksElapsed` (floor `DECAY_FLOOR`). Runs inside `runJanitorCycle` and can be disabled with `runDecay: false`.
- **`buildA2ACard(def, executorUriOverride?)`** — builds an A2A-protocol `AgentCard` JSON from an `AgentDefinition`. Maps known capability strings (`code_generation`, `code_review`, `planning`, `research`, `memory`, `task_management`, `orchestration`) to typed `A2ASkill` descriptors. Falls back to a generic role skill for unrecognised capabilities.
- **`AgentRoleDescriptor`** type alias — `AgentRoleDescriptor = AgentProfile` for vocabulary consistency with A2A spec; fully backward-compatible.
- **Memory `content_type` routing** — `Memory` interface gains `content_type: 'text' | 'code'` field (migration 033, default `'text'`). `writeMemory` auto-selects the text or code embedder based on `content_type` when no explicit embedding is provided.
- **Memory decay constants** in `@fulcrum/core/constants` — `MEMORY_DECAY_FACTOR`, `MEMORY_DECAY_THRESHOLD`, `MEMORY_DECAY_MIN_DAYS_SINCE_ACCESS`, `MEMORY_DECAY_FLOOR`.
- **DB pragma hardening** — `synchronous = NORMAL` and `cache_size = -8000` (8 MB) added to `_configureDb`. WAL mode + NORMAL sync is crash-safe while delivering measurably better write throughput than FULL.

#### Memory package
- **`buildRepoMap` / `scanAndBuildRepoMap`** in `@fulcrum/memory/repo-map` — aider-style repository map. Walks a directory tree (skips `node_modules`, `.git`, `dist`, `build`, `.next`, `coverage`, worktree dirs), detects language from extension, and extracts top-level symbols (functions, classes, methods, arrow functions, consts) using an injectable tree-sitter parser. Returns a `RepoMap` with per-file symbol tables and a compact summary string. No WASM required in tests — parser is fully injectable.

#### Agent integration
- **`agent-integration/codex/`** — OpenAI Codex CLI integration (`AGENTS.md` context file auto-loaded by Codex CLI; `mcp-config.json` pointing at `fulcrum serve mcp`).
- **`agent-integration/opencode/`** — opencode integration (`opencode.md` context file; `config.json` with `mcp.fulcrum` entry pointing at `fulcrum serve mcp`).

#### Monitor server
- **Pagination** on list endpoints (`/tasks`, `/agents`, `/artifacts`, `/memory-trace`, `/teams`) — `?limit=N&cursor=OFFSET` query params; response includes `{ data, pagination: { total, limit, offset, next_cursor } }`. Limit capped at 200. `next_cursor` is null when all results are exhausted.

#### Core APIs (continued)
- **`consolidateMemories(workspace_id?)`** in `@fulcrum/core/janitor` — background memory deduplication. Compares embeddings within a workspace using cosine similarity; pairs above `MEMORY_CONSOLIDATION_THRESHOLD = 0.92` are merged (higher-importance survives). Batch-limited to `MEMORY_CONSOLIDATION_BATCH_SIZE = 200` memories per cycle. Runs in `runJanitorCycle` (opt-out with `runConsolidate: false`).
- **Tool name validation** in `createAgentDefinition` / `updateAgentDefinition` — `tools_allow` and `tools_deny` entries are validated against `/^[a-zA-Z_][a-zA-Z0-9_-]*$/`. Throws `FulcrumError { code: 'invalid_input' }` on the first bad name.

#### Documentation
- **`packages/cli/README.md`** — CLI command tree, 13 MCP tools table, auto-init, plugin discovery, hook system.
- **`packages/worker/README.md`** — `AgentAdapter` contract, built-in adapters, subprocess + stub usage.
- **`docs/guides/skill-authoring.md`** — Complete guide to writing Fulcrum skills: frontmatter schema, body format, naming conventions, trigger phrase best practices, policy vs procedure skills, scripted pattern / `gen-claude-md.ts` integration.

### Changed
- `_configureDb` adds `synchronous = NORMAL` and `cache_size = -8000` pragmas (additive — no behavior regression).
- `runJanitorCycle` runs `decayMemories` and `consolidateMemories` by default (opt-out with `runDecay: false` / `runConsolidate: false`).
- `fulcrum doctor` `checkDbLiveness` check added to the standard check list.
- All packages now use `ulidx` (standardised, ESM-compatible); `ulid` dependency removed from core, memory, planning, policy.
- `docs/gap-analysis/` renamed to `docs/history/`.

---

## [0.1.0] — 2026-04-14

Five rounds of gap-analysis + fixes against the Python spec. Test count grew from 91 to **980 passing across 11 packages**. 10 new migrations (020–029), 3 new guard test suites, and real execution paths for workers, workflows, worktrees, and merge queue.

### Added

#### Packages and runners
- **`@fulcrum/worker`** — pluggable `AgentAdapter` pattern with built-in `stub` and `subprocess` adapters. `spawnAgent` lifecycle with policy gate, heartbeat streaming, and span instrumentation. `registerAgentAdapter` extension point for userland Claude/Gemini/PI adapters. (H-2)
- **Workflow runner** — `runWorkflow` in `@fulcrum/workflows` with retries (default 3, exponential backoff), per-step timeouts (default 600s), state persistence, and bounded iteration loop. (H-1)
- **29 workflow step handlers** — `create_task`, `create_issue`, `create_epic`, `write_artifact`, `write_memory`, `read_memory`, `read_artifact`, `review_artifact`, `invoke_team`, `spawn_agent`, `run_script`, `call_mcp_tool` (stub), `wait_for_task`, `wait_for_review`, `wait_for_artifact`, `branch`, `loop`, `halt`, `escalate`, `prompt_user`, `read_project`, `evaluate_policy`, `gate`, `validate_schema`, `parallel`, `complete`, `run_tool`, `search_code`, `search_web`. (H-5)

#### Worktrees and merge queue
- **Real git subprocess integration** in `@fulcrum/worktrees`:
  - `allocateWorktree` runs `git worktree add <path> -b <branch> <base>` under `<project_root>/.fulcrum-worktrees/<worktree_id>`
  - Idempotent `.gitignore` management
  - Non-git project fallback to sequential write mode
  - DB rollback on git failure
  - `deallocateWorktree` runs `git worktree remove --force` (H-3)
- **Real merge queue execution** — `processMergeQueue` runs `git merge --no-ff` with conflict detection (`git merge --abort` on conflict). FIFO by `updated_at`. Artifact gates: requires `review_report` + `test_report` with status=`final` before merging. Conflict path: creates `merge_conflict_report` artifact, sets worktree status=`conflict`. Policy gated: only `canMerge(role)` may dequeue. (H-4)
- **Worktree TTL cleanup** — `cleanupAbandonedWorktrees` called from janitor cycle. Reaps rows with status in (`discarded`, `merged`) older than 24h. (H-10)

#### Telemetry and observability
- **Telemetry spans** — `startSpan` / `endSpan` / `getTrace` stored in `trace_events` table; auto-instrumentation in workflow runner, worker lifecycle, janitor cycle, MCP tool handler. Spans carry parent/child relationships for trace reconstruction. (K-5, G-12)
- **OpenTelemetry OTLP exporter** (opt-in) — activated by `OTEL_EXPORTER_OTLP_ENDPOINT`. Dual-emits Fulcrum spans to local DB + any OTLP backend (Datadog / Honeycomb / Jaeger / Grafana Tempo). `gen_ai.*` semantic conventions for agent and workflow spans. (J-7)

#### CLI
- **9 new CLI subcommand groups** — `task`, `issue`, `epic`, `board`, `queue`, `sync`, `team`, `workflow`, `agent`. All support `--json` for machine-readable output. (J-6)
- **`@fulcrum/cli` raw JSON-RPC MCP server** — `fulcrum serve mcp` runs a stdio MCP server exposing 13 control-plane tools: `list_tasks`, `create_task`, `update_task`, `recall_memory`, `write_memory`, `list_agent_profiles`, `get_agent_run_status`, `start_agent_run`, `heartbeat_agent_run`, `complete_agent_run`, `block_agent_run`, `build_cos_context`, `get_workspace_status`. No `@modelcontextprotocol/sdk` dependency.
- **Auto-init** — every `fulcrum` command now auto-initializes `$CWD` as a Fulcrum project on first run (creates `.fulcrum/fulcrum.db`, default workspace + project with deterministic IDs from `sha256(abs_path)[:12]`, and `.fulcrum.json`).
- **Global installer** — `pnpm run setup` installs the CLI symlink, registers `fulcrum` as a user-scope Claude MCP server, merges the PreToolUse hook into `~/.claude/settings.json`, writes a Fulcrum section into `~/.claude/CLAUDE.md`, installs the Gemini extension into `~/.gemini/extensions/fulcrum/`, and runs `pi install` for the PI cockpit. Per-runtime variants: `setup:claude` / `setup:gemini` / `setup:pi`.
- **Hook system** — `fulcrum hook claude|gemini|pi` reads a tool-call event from stdin, normalizes field names across all three runtimes (including PI's `runId` capture), logs a `hook_executed` event, and enforces the `chief_of_staff_no_direct_writes` policy invariant. (R2-5, K-2)

#### Agent integration files
- `agent-integration/claude/` — `.mcp.json`, `CLAUDE.md`, `settings-hooks-snippet.json`
- `agent-integration/gemini/` — `gemini-extension.json`, `GEMINI.md`
- `agent-integration/pi/` — `fulcrum.extension.json`, `fulcrum.d.ts`, `PI.md`, `cockpit/` (full PI extension: widget, dashboard, setup wizard, 11 slash commands, 11 native tools, policy hook)
- `agent-integration/roles/` — 6 role prompt MDs (`chief_of_staff`, `software_engineer`, `integration_worker`, `code_reviewer`, `security_reviewer`, `tech_lead`)

#### Monitor server
- **Monitor control endpoints** — `POST /tasks`, `PATCH /tasks/:id`, `POST /runs`, `POST /runs/:id/{heartbeat,complete,block}`, `POST /memory/recall`, `POST /memory/write`, `POST /cos-context`, `POST /policy/check`. `GET /tasks`, `/workspaces`, `/projects`. (G-1 follow-through)

#### Core APIs and constants
- **Central role capability system** at `packages/core/src/roles.ts` — `roleCapabilities`, `isL1`, `canInvokeTeams`, `canMerge`, `canWriteCode`, `canEditFiles`. Replaces scattered hardcoded role string comparisons. (H-11)
- **Advisory lock API** — `acquireLock`, `releaseLock`, `listLocks`, `cleanupExpiredLocks` in `packages/core/src/locks.ts`. Janitor calls `cleanupExpiredLocks` every cycle. Exclusive-only per spec §18.1 (documented in the module header). (G-5, H-7)
- **Named constants module** at `packages/core/src/constants.ts` — `DEFAULT_HEARTBEAT_TIMEOUT_SEC`, `DEFAULT_ESCALATION_TIMEOUT_SEC`, `DEFAULT_WIP_LIMIT`, `DEFAULT_MONITOR_PORT`, `DEFAULT_EMBED_DIM`, `DEFAULT_LOCK_TTL_SEC`, `JANITOR_INTERVAL_SEC`, `MEMORY_RANK_WEIGHTS`. (G-9)
- **ID prefixes** for `subtask`, `cycle`, `milestone`, `comment`, `status_event`, `lock`, `span`, `policy_event`, `team_instance`. Now 26 total registered prefixes. (G-15, K-4, R4-5)
- **Run event journal** — `agent_runs.events` is appended on every lifecycle transition (`started`, `heartbeat`, `completed`, `blocked`, `escalated`) via `appendRunEvent` helper. (G-7)
- **§10.7 weighted hybrid memory ranking** — `semantic*0.4 + lexical*0.3 + recency*0.2 + confidence*0.1` with exponential recency decay (~21-day half-life). Reranker score replaces the semantic component when invoked. (G-10)
- **MemoryKind expanded to 16 values** — 13 canonical + `tool_trace` / `reasoning_step` / `lesson`. Single source of truth in `@fulcrum/core`; `@fulcrum/memory` re-exports from core. (J-4)

#### Schema additions
- **`projects` table**: `type` (git/non_git/submodule/logical), `status` (active/archived/paused), `write_mode` (worktree/in_place/sequential), `git_url`, `parent_project_id`, `description`. (G-2, H-19)
- **`memories.task_id`** column + `'task'` value added to `MemoryScope` enum. (G-4, H-6)
- **10 new migrations (020..029)** — project column extensions, `memories.task_id`, `trace_events` table, `advisory_locks` rebuild, `handoff_mode` CHECK restore, `memory_scope` CHECK update, `projects.description`, `MemoryKind` CHECK, missing CHECK constraints (`tasks.status`, `agent_runs.role`, `agent_runs.status`, `workspaces.status`, `handoffs.priority`, `handoffs.scope`), `worktrees.base_branch`, `worktrees.status` `conflict` value.

#### Defensive guard tests
- **CHECK-drift guard** (`packages/core/src/tests/check-constraints.test.ts`) — iterates 14 enum columns and asserts DB CHECK matches TS type union. Catches migration rebuilds that silently drop CHECK constraints.
- **Bare-ulid guard** (`packages/core/src/tests/ulid-guard.test.ts`) — greps all production `.ts` files and fails if any call `ulid()` directly outside a 5-file allowlist. Forces ID generation through `newId(<type>)`.
- **Role-string guard** (`packages/core/src/tests/role-string-guard.test.ts`) — greps all production `.ts` files and fails if any do `=== 'role_slug'` comparisons outside a 3-file allowlist. Forces role boundary checks through `isL1` / `canInvokeTeams` / `canMerge` / etc.

### Changed

- **`recallMemory`** — `project_id` is now optional; when omitted, scoped to the whole workspace instead of failing. (G-3)
- **`HandoffMode`** — enum values aligned to Python spec: `brief | contextual | artifact_first_brief | branched_session`. Earlier value set (`sync | async | review | escalate`) was a bug from Round 1 Task 14 caught and fixed in Round 2. (R1-REG-1)
- **`HandoffPacket.done_criteria`** tightened from `string | undefined` to `string[]`; `HandoffMode` changed from `string` to typed literal union. (G-13)
- **Embedding model** — `initEmbedding()` now called at `fulcrum serve mcp/monitor/all` startup (warmup), not lazy-initialized on first query. (G-14)
- **Monitor server** — hardcoded port `7331` replaced with `DEFAULT_MONITOR_PORT = 4721` from the constants module. (G-9)
- **`listAgentProfiles`** — reads role descriptions from `agent-integration/roles/<role>.md` at runtime (parses the `## Purpose` section). Falls back to hardcoded descriptions for roles without a file. (G-11)
- **Policy role checks** — `SYSTEM_INVARIANTS` in `@fulcrum/policy` now use `isL1()` / `canMerge()` / `canInvokeTeams()` from the central role capability system instead of hardcoded string comparisons. (H-11)
- **`ensureWorkspace` / `ensureProject`** helpers in the monitor server and CLI `ensureProjectInitialized` now delegate to `@fulcrum/core` `createWorkspace` / `createProject` instead of raw SQL. (G-1 follow-through)
- **`packages/core/src/memory.ts writeMemory`** — now the canonical memory write path. `cos-parser.ts` delegates here instead of maintaining its own hand-rolled INSERT. (K-1, K-3)
- **`@fulcrum/cli`** — gained vitest infrastructure. 21 tests cover hook normalization, CLI dispatch, and group smoke tests.
- **`AgentRunStatus` TS type** — added missing `'stale'` value that the janitor was already writing but wasn't in the type. (R3-5 side-find)
- **`MemoryKind` (packages/memory)** — now re-exports from `@fulcrum/core` instead of maintaining a local declaration. (J-4)

### Fixed

- **R1-REG-1** — `HandoffMode` type values were wrong and the DB CHECK had been silently dropped by MIGRATION_013. Fixed in MIGRATION_022 which restores the CHECK to the correct `brief`/`contextual`/`artifact_first_brief`/`branched_session` set.
- **G-1** — workspaces/projects CRUD were previously reached via raw SQL in CLI and monitor; now delegated to `packages/core/src/{workspaces,projects}.ts` so FK / enum validation lives in one place.
- **G-5** — `advisory_locks` table existed but had no API; now fully implemented.
- **G-6** — `chief_of_staff_no_direct_writes` policy invariant added. L1 roles are denied `tool_use:Write|Edit|MultiEdit|NotebookEdit` and any `shell_exec:git ...` at the policy engine level.
- **G-7** — agent run event journal was defined in schema but never written. Now appended on every lifecycle transition.
- **J-1** — `packages/memory/src/write.ts` generated `memory_id` via bare `ulid()` instead of `newId('memory')` — memory rows were persisted without the `mem_` prefix. Fixed.
- **J-2, J-3** — `tasks.status` and `agent_runs.role` CHECK constraints were dropped by MIGRATION_002 and never replaced. MIGRATION_025 rebuilds both tables with correct CHECKs.
- **J-5** — `memories.kind` CHECK had been silently failing in MIGRATION_005 (duplicate column error). MIGRATION_026 is the first migration to actually enforce the enum at the DB level.
- **K-1, K-3** — `packages/core/src/cos-parser.ts` bypassed `newId('memory')` AND its INSERT column list had drifted from the current `memories` schema. Delegated to `writeMemory()` instead.
- **K-2** — `NormalizedHookEvent` silently dropped PI `runId`. Now captured; test asserts round-trip.
- **K-4** — `packages/policy/src/audit.ts` used a custom `pevt_` prefix via `'pevt_' + ulid()`. `policy_event` now registered in the central PREFIXES map and uses `newId('policy_event')`.
- **K-4 sweep (10 sites)** — `packages/planning/{epics,issues,plans,prds,reviews}.ts`, `policy/engine.ts`, `workflows/workflows.ts`, `worktrees/worktrees.ts`, `teams/teams.ts` (×2) all routed through `newId(<type>)` instead of hand-rolled prefix concatenation.
- **P5-001..003** — three hardcoded role string comparisons (in `worktrees.ts`, `monitor/server.ts`, `cli/index.ts`) replaced with capability helper calls.
- **MIGRATION_027** — added missing CHECK constraints that had never been defined: `agent_runs.status`, `workspaces.status`, `handoffs.priority`, `handoffs.scope`.

### Removed

- **`fulcrum init` subcommand** — replaced by auto-init that runs on every fulcrum command. The explicit init step was redundant.

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

[Unreleased]: https://github.com/moabualruz/fulcrum/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/moabualruz/fulcrum/compare/v0.0.1...v0.1.0
[0.0.1]: https://github.com/moabualruz/fulcrum/releases/tag/v0.0.1
