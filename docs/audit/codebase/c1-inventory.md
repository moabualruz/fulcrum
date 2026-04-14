# C1 — Fulcrum Codebase Inventory

**Generated:** 2026-04-14 | **Scope:** Production code only (excludes `/pi-python-ref`, reference materials)  
**Format:** Comprehensive catalog of Fulcrum's current state — no opinions, facts only.

---

## 1. Workspace Layout

### Root Configuration

**Root `package.json`**
- Type: `module` (ESM)
- Private workspace (not published to npm)
- Monorepo: 11 packages under `packages/`
- Workspace config: `pnpm-workspace.yaml` (single glob: `packages/*`)
- Build dependencies: `tsx@^4.21.0` (dev only, for scripts)
- Key scripts:
  - `pnpm test`: run all package tests
  - `pnpm build`: build all packages (no-op currently; all src is TS, evaluated at runtime via tsx)
  - `fulcrum`: invoke CLI via tsx
  - `setup`, `setup:claude`, `setup:gemini`, `setup:pi`: install tools globally
  - `install-bin`: symlink fulcrum to `$HOME/.local/bin/fulcrum`
- Peer dependencies (optional): `@mariozechner/pi-*` (PI coding agent + TUI)
- pnpm overrides: force build for `better-sqlite3`, `esbuild`, `onnxruntime-node`, `koffi`, `protobufjs`, `kuzu`
- Extension entry: `./packages/extension/index.ts` (for PI)

**pnpm-workspace.yaml**
```yaml
packages:
  - 'packages/*'
```

**.fulcrum.json** (project config)
```json
{
  "workspace_id": "ws_pi-stack-plan_2f091539c497",
  "project_id": "proj_pi-stack-plan_2f091539c497",
  "monitor_port": 4721
}
```

**fulcrum** (wrapper script, `/home/mkh/workspace/pi-stack-plan/fulcrum`)
```bash
#!/usr/bin/env sh
DIR=$(dirname "$(readlink -f "$0")")
exec "$DIR/node_modules/.bin/tsx" "$DIR/packages/cli/src/index.ts" "$@"
```

### Top-Level Docs

- **README.md**: Full user guide (~1000 lines); covers memory stack, CLI, agent roles, workflow authoring
- **CHANGELOG.md**: Version 0.0.1 entry with Round 1-5 summary
- **AGENTS.md**: Invariants for AI agents; references CONTRIBUTING.md and 24 role files
- **CONTRIBUTING.md**: Contributor guidelines
- **SECURITY.md**: Security policy
- **LICENSE**: MIT
- **CODE_OF_CONDUCT.md**: Community guidelines

### Directory Structure

```
/home/mkh/workspace/pi-stack-plan/
├── packages/              # 11 packages
│   ├── core/             # @fulcrum/core (62 src files)
│   ├── memory/           # @fulcrum/memory (29 src files)
│   ├── monitor/          # @fulcrum/monitor (5 src files)
│   ├── planning/         # @fulcrum/planning (8 src files)
│   ├── policy/           # @fulcrum/policy (5 src files)
│   ├── sync/             # @fulcrum/sync (7 src files)
│   ├── teams/            # @fulcrum/teams (5 src files)
│   ├── workflows/        # @fulcrum/workflows (8 src files)
│   ├── worker/           # @fulcrum/worker (6 src files)
│   ├── worktrees/        # @fulcrum/worktrees (4 src files)
│   └── cli/              # @fulcrum/cli (1 src file: 2211 lines)
├── agent-integration/     # Agent runtime hookups + roles + skills
│   ├── claude/           # Claude Code MCP + hooks
│   ├── gemini/           # Gemini CLI extension
│   ├── pi/               # PI coding agent cockpit
│   ├── roles/            # 25 role prompt MDs
│   ├── skills/           # 13 Claude Skill MDs
│   └── install.ts        # Global installer (~800 lines)
├── docs/
│   ├── audit/
│   │   └── codebase/     # This file
│   ├── gap-analysis/     # Phase 1-4 validated findings (reference, not inventory)
│   ├── guides/           # Installation, CLI reference, workflow authoring, worker adapters, telemetry
│   ├── superpowers/      # Plans and specs for future work (reference)
│   └── README.md
├── .fulcrum/             # Local project state (git-ignored)
├── .fulcrum.json         # Project workspace/project/monitor config
├── fulcrum               # Wrapper script (executable)
└── pnpm-workspace.yaml   # Workspace manifest
```

---

## 2. Packages (11 Total)

### Summary Table

| Package | Files | Tests | Dependencies | Purpose |
|---------|-------|-------|--------------|---------|
| @fulcrum/core | 62 | 32 | better-sqlite3, sqlite-vec, @huggingface/transformers, @opentelemetry/* | Core persistence, orchestration, embeddings, telemetry |
| @fulcrum/memory | 29 | 21 | @fulcrum/core, kuzu, gray-matter, simple-git, chokidar | Three-layer memory (vault L0, FTS5 L1, Kuzu L2) |
| @fulcrum/monitor | 5 | 3 | @fulcrum/core, hono, @hono/node-server | HTTP dashboard + metrics |
| @fulcrum/planning | 8 | 7 | @fulcrum/core, ulid | Epics, issues, PRDs, plans, code reviews |
| @fulcrum/policy | 5 | 4 | @fulcrum/core, @fulcrum/teams, minimatch | Secret guard, audit logging, policy engine |
| @fulcrum/sync | 7 | 1 | @fulcrum/core, @fulcrum/policy | Plane sync adapter, conflict detection |
| @fulcrum/teams | 5 | 2 | @fulcrum/core, ulidx | Agent team orchestration, role slots, policies |
| @fulcrum/workflows | 8 | 2 | @fulcrum/core, (opt: @fulcrum/planning, @fulcrum/teams, @fulcrum/worker), ulidx | Workflow engine, step handlers, runner |
| @fulcrum/worker | 6 | 1 | @fulcrum/core | Pluggable agent executor, lifecycle, spawning |
| @fulcrum/worktrees | 4 | 1 | @fulcrum/core, ulidx | Git worktree lifecycle, artifacts, reviews |
| @fulcrum/cli | 1 | 3 | All others | CLI: 14 command groups, 2211 lines, MCP/monitor servers, hook handlers |

### 2.1 @fulcrum/core

**Version:** 0.0.1 | **Type:** ESM | **Private:** yes

**Package.json**
- Main: `./src/index.ts`
- Dependencies (5):
  - `better-sqlite3@^12.0.0` (SQLite binding)
  - `sqlite-vec@^0.1.6` (vector search)
  - `@huggingface/transformers@^3.0.0` (embeddings)
  - `ulid@^2.3.0` (ID generation)
  - `@opentelemetry/*@^1.x` (4 deps: api, sdk-trace-node, resources, semantic-conventions, exporter-trace-otlp-http)
- Peer: `@fulcrum/teams` (optional, lazy-loaded in exports)
- Dev: types for better-sqlite3, typescript, vitest

**Public API (from `src/index.ts`)**

*Types (re-exported from `types.ts`)*
- `Task`, `TaskStatus`, `TaskRelation` (relation types)
- `AgentRun`, `AgentRunStatus`, `RunStatus`, `RunArtifacts`, `SpawnableRun`
- `AgentRole`, `RoleCapabilities`, `AgentProfile`
- `Workspace`, `WorkspaceStatus`, `WorkspaceStatusResult`
- `Memory`, `MemoryScope`, `MemoryKind`
- `ProjectStatus`, `ProjectType`, `WriteMode`
- `StatusCategory`, `TaskRelationType`
- `ArtifactType`, `EventType`, `FulcrumEvent`
- `EmbeddingProviderConfig`, `FulcrumConfig`, `PolicyCheckResult`
- `HandoffPacket`, `CreateHandoffInput`, `HandoffPriority`, `HandoffScope`, `HandoffMode`
- `TelemetrySpan`
- `AgentProfileRow`, `CreateAgentProfileInput`, `UpdateAgentProfileInput`
- Error class: `FulcrumError`

*Config*
- `loadConfig()`, `defaultConfig`

*Database*
- `getDb()`, `setDb()`, `closeDb()`, `_configureDb()`
- `runMigrations(db: Database.Database)`

*Tasks*
- `listTasks(input)`, `createTask(input)`, `updateTask(input)`

*Workspaces*
- `createWorkspace(input)`, `getWorkspace(id)`, `listWorkspaces()`, `updateWorkspace(input)`
- Types: `CreateWorkspaceInput`, `UpdateWorkspaceInput`

*Projects*
- `createProject(input)`, `getProject(id)`, `listProjects(input)`, `updateProject(input)`
- Types: `Project`, `CreateProjectInput`, `UpdateProjectInput`, `ListProjectsInput`

*Runs*
- `startAgentRun(input)`, `heartbeatAgentRun(input)`, `getAgentRunStatus(run_id)`, `completeAgentRun(input)`, `blockAgentRun(input)`, `escalateRun(input)`, `buildSpawnableRun(input)`

*Policy*
- `checkPolicy(input): Promise<PolicyCheckResult>`

*Janitor*
- `runJanitorCycle()`, `startJanitor(interval_ms?)`

*Memory*
- `writeMemory(input)`, `recallMemory(input)`

*Embedding*
- `initEmbedding(config)`, `getTextEmbedder()`, `getCodeEmbedder()`, `getReranker()`, `resetProviders()`

*Status & Context*
- `getWorkspaceStatus(workspace_id)`, `buildCosContext(input)`, `listAgentProfiles()`

*IDs*
- `newId(prefix: string)`, `nextDisplayId(project_id, entity_type)`

*Status Category*
- `statusCategory(status: string): StatusCategory`

*Handoffs*
- `createHandoff(input)`, `getHandoff(id)`, `listHandoffs(query)`, `claimHandoff(id)`, `completeHandoff(id)`

*Events*
- `emitEvent(input): Promise<void>`
- Type: `EmitEventInput`

*CoS (Chain of Thought) Context*
- `buildWorldState(input): Promise<CoSWorldState>`
- Type: `BuildWorldStateInput`, `CoSWorldState`

*CoS Parser*
- `parseCoSResponse(response_text): CoSResponse`, `applyCoSResponse(input)`
- Type: `CoSResponse`

*Locks (Advisory locks)*
- `acquireLock(input)`, `releaseLock(id)`, `listLocks(workspace_id)`, `cleanupExpiredLocks()`
- Types: `Lock`, `AcquireLockInput`, `AcquireLockResult`

*Telemetry*
- `startSpan(input)`, `endSpan(input)`, `getTrace()`
- `initOtel()`, `shutdownOtel()`, `getOtelTracer()`
- Types: `StartSpanInput`, `EndSpanInput`

*Constants*
- Exported verbatim from `constants.ts`

*Roles*
- `L1_ROLES: AgentRole[]`, `isL1(role)`, `roleCapabilities(role)`, `canInvokeTeams(role)`, `canMerge(role)`, `canWriteCode(role)`, `canEditFiles(role)`
- Type: `RoleCapabilities`

*Agent Profiles (dynamic)*
- `createAgentProfile(input)`, `getAgentProfile(id)`, `listAgentProfileRows()`, `updateAgentProfile(input)`, `deleteAgentProfile(id)`

*Team Ops (lazy getter)*
- `getTeamOps(): Promise<Record<string, unknown>>` — dynamically imports `@fulcrum/teams` to avoid circular dependency

**Source Files (62 total)**

Domain modules (non-test):
- `index.ts` — public API surface
- `types.ts` — all type definitions
- `config.ts` — loadConfig, defaultConfig
- `constants.ts` — SQL status enums, ID prefixes, role lists
- `tasks.ts` — createTask, listTasks, updateTask
- `runs.ts` — startAgentRun, heartbeat, complete, block, escalate
- `workspaces.ts` — workspace CRUD
- `projects.ts` — project CRUD
- `memory.ts` — writeMemory, recallMemory (delegates to memory package)
- `handoffs.ts` — handoff lifecycle
- `events.ts` — emitEvent
- `policy.ts` — checkPolicy
- `status.ts` — getWorkspaceStatus, buildCosContext, listAgentProfiles
- `status-category.ts` — status → category mapping
- `ids.ts` — newId, nextDisplayId
- `roles.ts` — role capabilities, L1 list
- `agent-profiles.ts` — dynamic agent profiles table CRUD
- `cos-parser.ts` — parseCoSResponse, applyCoSResponse
- `cos-context.ts` — buildWorldState
- `janitor.ts` — cleanup task runner
- `locks.ts` — advisory locks (advisory.txt spec §18.1)

Database modules:
- `db/client.ts` — getDb, setDb, closeDb, _configureDb
- `db/migrations.ts` — 16 migrations (001-016)

Embedding modules:
- `embedding/types.ts` — EmbeddingProvider interface
- `embedding/registry.ts` — provider factory
- `embedding/local.ts` — HuggingFace transformer wrapper
- `embedding/reranker.ts` — reranking logic

Telemetry modules:
- `telemetry/otel.ts` — OpenTelemetry setup
- `telemetry/spans.ts` — span helpers

Test files (32):
- `tests/agent-profiles.test.ts`, `agent-state-projection.test.ts`, `check-constraints.test.ts`
- `tests/config.test.ts`, `constants.test.ts`, `cos-context.test.ts`, `cos-parser.test.ts`
- `tests/db.test.ts`, `embedding.test.ts`, `events.test.ts`
- `tests/handoffs.test.ts`, `ids.test.ts`, `integration.test.ts`, `janitor.test.ts`, `locks.test.ts`
- `tests/memory.test.ts`, `migrations.test.ts`, `otel.test.ts`, `policy.test.ts`
- `tests/projects.test.ts`, `roles.test.ts`, `role-string-guard.test.ts`, `runs.test.ts`
- `tests/status-category.test.ts`, `status.test.ts`, `tasks.*.test.ts` (3 files: main, labels, assigned_run)
- `tests/telemetry.test.ts`, `types.test.ts`, `ulid-guard.test.ts`, `workspaces.test.ts`
- Helper: `tests/helpers.ts`
- **Total passing tests: 221** (from test run output)

**Database Schema (16 Migrations)**

**Core tables (M001)**
- `schema_migrations`: tracking table
- `workspaces`: workspace_id (PK), name, created_at
- `projects`: project_id (PK), workspace_id (FK), name, created_at
- `tasks`: task_id (PK), workspace_id (FK), project_id (FK), title, description, status, depends_on, assigned_to, note, version, created_at, updated_at
- `agent_runs`: run_id (PK), task_id (FK), workspace_id (FK), role, status, current_step, progress_pct, output_summary, artifacts, git_branch, git_commit, events, version, started_at, updated_at, completed_at
- `memories`: memory_id (PK), workspace_id (FK), project_id (FK), content, tags, confidence, embedding, created_at, updated_at, last_accessed_at, access_count
- `advisory_locks`: lock_id (PK), workspace_id (FK), resource_path, run_id, acquired_at, expires_at (UNIQUE on workspace + path)
- FTS5 tables: `tasks_fts`, `memories_fts` (with triggers)
- Indexes: workspace, project, status, locks

**Extensions (M002)**
- Workspace: status (DEFAULT 'active')
- Projects: project_type, root_path, default_branch, parent_project_id, write_mode (DEFAULT 'sequential'), status
- Tasks: display_id, issue_id, status_category, priority, estimate_type/value, done_criteria, claimed_at, completed_at (recreated to drop CHECK constraint)
- Agent runs: project_id, display_id, agent_id, pi_profile, status_category, current_path, heartbeat_at, blocker, worktree_id, finished_at (recreated to remove role enum)
- Memories: scope, kind, title, summary, canonical_text, entities, event_time, content_hash, symbol_path, task_id, issue_id, artifact_id, provenance_refs
- Display ID sequences: entity_type, project_id, last_value
- Events: evt_id (PK), workspace_id, project_id, evt_type, ts, object_type/id, actor_type/id, payload, severity, trace_id, span_id, correlation_id (with indexes)
- Task relations: task_id, target_task_id, relation_type (PK on all 3)
- Task labels: task_id, label (PK on both)

**Planning (M003)**
- Epics: epic_id (PK), workspace_id, project_id, display_id, title, description, status (CHECK), status_category, priority, milestone_id, version, created_at, updated_at
- Issues: issue_id (PK), workspace_id, project_id, epic_id (FK), parent_issue_id (self-FK), display_id, title, description, status (CHECK), status_category, priority, assignee_agent_id, estimate_type/value, version, created_at, updated_at
- Issue labels: issue_id, label (PK)
- PRDs: prd_id (PK), workspace_id, project_id, display_id, title, description, status (CHECK), status_category, file_path, linked_epic_id, version, created_at, updated_at
- Plans: plan_id (PK), workspace_id, project_id, display_id, title, description, status (CHECK), status_category, prd_id (FK), file_path, version, created_at, updated_at
- Plan–Issue join: plan_id, issue_id (PK)
- PRD–Plan join: prd_id, plan_id (PK)
- FTS5 tables + triggers: epics_fts, issues_fts, prds_fts, plans_fts

**Policy (M004)**
- Policy rules: rule_id (PK), scope (CHECK), scope_id, name, description, action (CHECK), matchers, enabled, priority, created_at, updated_at
- Policy events: evt_id (PK), rule_id, workspace_id, action, matched, actor_id, resource_type/id, payload, ts

**Memory enrichment (M005)**
- Memory entities: memory_id, entity_type, entity_id, relation_type (PK)
- Code chunks: chunk_id (PK), workspace_id, project_id, file_path, language, chunk_strategy (CHECK), source_type (CHECK), content, start_line, end_line, symbol_path, embedding, content_hash, indexed_at
- Indexes on memories: scope, kind, file_path, content_hash, event_time

**Teams (M006)**
- Team templates: template_id (PK), name (UNIQUE), description, slots, policy, created_at, updated_at
- Team instances: instance_id (PK), template_id (FK), workspace_id (FK), project_id (FK), display_id, status (CHECK), status_category, purpose, task_id (FK), created_by_agent_id, resolved_slots, version, created_at, updated_at
- Team members: instance_id, slot_id, agent_id (PK)

**Workflows (M007)**
- Workflow runs: wf_id (PK), workspace_id, project_id, display_id, workflow_name, workflow_version, status (CHECK), status_category, task_id, issue_id, steps, current_step_id, handoff_refs, artifact_refs, error, version, created_at, updated_at, started_at, completed_at

**Worktrees (M008)**
- Artifacts: artifact_id (PK), workspace_id, project_id, display_id, artifact_type, title, file_path, owner_type/id, status (CHECK), content_hash, created_at, updated_at (with FTS5 index)
- Reviews: review_id (PK), workspace_id, project_id, display_id, target_type (CHECK), target_id, status (CHECK), reviewer_agent_id, summary, file_path, created_at, updated_at
- Worktrees: worktree_id (PK), workspace_id, project_id, status (CHECK), branch_name, path, base_branch, task_id (FK), run_id (FK), created_at, updated_at, merged_at, discarded_at
- Artifact contracts: contract_id (PK), task_id (FK), required/optional_artifacts, final_summary_artifact, review_inputs, merge_readiness_rules, created_at, updated_at
- Handoffs: handoff_id (PK), workspace_id, project_id, from_agent_id, to_agent_id, task_id, issue_id, goal, task_type, priority (CHECK), scope (CHECK), inputs, constraints, done_criteria, artifact_contract_id, handoff_mode (CHECK), created_at
- Agentrun–artifact join: run_id, artifact_id (PK)
- Review–artifact join: review_id, artifact_id (PK)
- Task–memory join: task_id, memory_id (PK)
- Artifact–memory join: artifact_id, memory_id (PK)

**Monitor (M009)**
- Analytics daily: id (PK), workspace_id, project_id, date, issue_created/closed, task_created/completed/blocked, run_started/finished/failed, memory_writes/recalls (UNIQUE on workspace + project + date)
- Analytics cycle: id, workspace_id, project_id, cycle_id, committed/completed, scope_added, rolled_over, avg_cycle_time_h
- Analytics project: id, workspace_id, project_id, date, wip_count, throughput, lead_time_h, blocked_h (UNIQUE on workspace + project + date)
- Analytics agent: id, workspace_id, agent_id, date, runs_started/completed/blocked/failed, avg_duration_min, handoff_count (UNIQUE on workspace + agent + date)
- Analytics team: id, workspace_id, instance_id, date, tasks_completed, avg_slot_duration_min, concurrency_peak (UNIQUE on workspace + instance_id + date)

**Sync (M010)**
- Sync states: sync_id (PK), object_type, object_id, workspace_id, sync_target, external_id, last_synced_at, sync_status (CHECK), last_sync_hash, last_sync_error, direction (CHECK), conflict_state (CHECK), created_at, updated_at (UNIQUE on object_id + sync_target)
- Sync conflicts: conflict_id (PK), sync_id (FK), local/remote_hash, detected_at, resolution (CHECK), resolved_at, resolved_by
- Sync queue: queue_id (PK), sync_id (FK), operation (CHECK), priority, scheduled_at, attempts, last_error, created_at (indexes on scheduled_at, priority)

**Graph (M011)**
- Graph entities: entity_id (PK), workspace_id, name, entity_type, properties, valid_from, valid_until, created_at, updated_at (indexes on workspace + type)
- Graph edges: edge_id (PK), workspace_id, source_id (FK), target_id (FK), relation, weight, properties, valid_from, valid_until, created_at (indexes on source/target)
- Graph episodes: episode_id (PK), workspace_id, entity_id (FK), content, episode_type, valid_from, valid_until, created_at (index on entity)

**Incremental Additions (M012-M016)**
- M012: `memories.freshness REAL DEFAULT 1.0`
- M013: `handoffs` table redesign (add status, claimed_at)
- M014: idempotent ALTERs for direction, conflict_state on sync_states (for old DBs)
- M015: idempotent ALTER for pi_profile on agent_runs
- M016: idempotent ALTER for config_path on workspaces

**CHECK Constraints (Database Invariants)**

See `tests/check-constraints.test.ts` for validation. Key constraints:

- `tasks.status` — one of: 'queued', 'in_progress', 'completed', 'blocked'
- `agent_runs.status` — one of: 'running', 'completed', 'blocked', 'stale', 'escalated'
- `agent_runs.role` — any role string (NOT enum; allows dynamic roles)
- `workspaces.status` — 'active' (or extended via migration)
- `projects.project_type` — user-defined (no CHECK)
- `projects.write_mode` — 'sequential' (or variants)
- Epics/issues: status ∈ {backlog, in_progress, done, cancelled, ready, in_review, etc.}
- Epics/issues: status_category ∈ {backlog, active, blocked, done}
- Epics/issues: priority ∈ {critical, high, medium, low, none}
- PRDs: status ∈ {draft, review, approved, archived}
- Plans: status ∈ {draft, active, completed, archived}
- Policy rules: scope ∈ {system, user, workspace, project, team_agent, workflow_step}; action ∈ {allow, deny, audit_only}
- Team instances: status ∈ {created, ready, spawning, running, waiting, blocked, completed, failed, cancelled}
- Worktrees: status ∈ {allocated, dirty, ready_for_merge, merged, discarded, conflict}
- Artifacts: status ∈ {draft, final, archived}
- Reviews: status ∈ {pending, changes_requested, approved, rejected}; target_type ∈ {task, artifact, worktree}
- Handoffs: priority ∈ {critical, high, medium, low, normal}; scope ∈ {task, subtask, team}; status ∈ {pending, claimed, completed, cancelled}
- Sync states: sync_status ∈ {never_synced, queued, syncing, synced, conflicted, failed, disabled}; direction ∈ {local_to_remote, remote_to_local, bidirectional}; conflict_state ∈ {none, detected, resolving, resolved, unresolvable}
- Code chunks: chunk_strategy ∈ {syntax, semantic, token}; source_type ∈ {code, prose}
- Workflow runs: status ∈ {created, ready, running, waiting_input, waiting_dependency, blocked, failed, completed, cancelled}

**Test Statistics**
- 32 test files: 221 passing tests
- Key areas: DB migrations, embedding, config, IDs, roles (capability guards), CoS parsing, tasks, runs, memory, handoffs, locks, policy, agent profiles

---

### 2.2 @fulcrum/memory

**Version:** 0.0.1 | **Type:** ESM | **Private:** yes

**Package.json**
- Main: `./src/index.ts`
- Dependencies (6):
  - `@fulcrum/core` (workspace)
  - `ulid@^2.3.0`
  - `gray-matter@^4.0.3` (YAML front-matter parsing)
  - `simple-git@^3.22.0` (git operations)
  - `chokidar@^3.6.0` (file watcher)
  - `kuzu@^0.10.0` (graph database)
- Dev: better-sqlite3 (for tests), types, vitest

**Public API (from `src/index.ts`)**

*Types*
- `MemoryScope`, `MemoryKind`, `RecallMode`
- `WriteMemoryInput`, `RecallMemoryInput`, `CompactMemory`, `FullMemory`
- `MemoryEntity`, `LinkMemoryToEntityInput`
- `CodeChunk`, `IngestFileInput`, `IngestResult`, `IngestProjectInput`

*Scoring (pure functions)*
- `computeImportance(memory)`, `computeFreshness(memory)`, `rrfScore(...)`

*Dedup*
- `contentHash(content)`, `isDuplicate(hash1, hash2)`

*Write*
- `writeMemory(input)`, `insertMemoryDirect(input)`

*Entities*
- `linkMemoryToEntity(input)`, `getMemoryEntities(memory_id)`

*Recall*
- `recallMemory(input)`, `getMemory(memory_id)`, `getMemoriesForTask(task_id)`

*Ingestion*
- `ingestFile(input)`, `ingestProject(input)`

*Graph types*
- `GraphEntity`, `GraphEdge`, `GraphEpisode`
- `AddEntityInput`, `AddEdgeInput`, `AddEpisodeInput`, `GetNeighborsInput`, `SearchEntitiesInput`

*Graph operations*
- `addEntity(input)`, `getEntity(entity_id)`, `searchEntities(input)`
- `addEdge(input)`, `getNeighbors(input)`
- `addEpisode(input)`, `getEpisodes(input)`

*Vault (L0: git-backed file store)*
- `getVaultPath()`, `vaultExists()`, `initVault()`, `writeMemoryFile(input)`, `readMemoryFile(path)`, `listMemoryFiles()`
- `appendToLog(entry)`, `rebuildIndex()`
- `readState(key)`, `writeState(key, value)`, `upsertStateEntry(entry)`, `removeStateEntry(key)`
- `createVaultGit(): VaultGit`
- `serializeToFile(memory, path)`, `parseFromFile(path)`
- `startVaultWatcher(options): VaultWatcherOptions`
- Types: `VaultStateEntry`, `VaultState`, `VaultGit`, `LogEntry`

*Kuzu (L2: graph + vector)*
- `KuzuClient`, `getKuzuClient()`, `setKuzuClient(client)`
- `upsertMemoryToKuzu(memory)`, `removeMemoryFromKuzu(memory_id)`
- `queryMemoriesL2(input)`: L2QueryInput → ScoredMemoryId[]
- Type: `ResolvedEntity`

*Extractors*
- `extractStructured(content)`: ExtractedMention[]

*Setup/Rebuild*
- `rebuildFromVault(options): Promise<RebuildResult>`
- `reconcileMergedBranch()`
- `runMemoryInit(): Promise<void>` (setup wizard)
- `activateL2(): Promise<void>` (enable Kuzu)
- Types: `RebuildOptions`, `RebuildResult`

**Source Files (29 total)**

Core:
- `index.ts` — public API
- `types.ts` — all type definitions
- `write.ts` — writeMemory, insertMemoryDirect
- `recall.ts` — recallMemory, getMemory, getMemoriesForTask
- `scoring.ts` — importance, freshness, rrf_score
- `dedup.ts` — contentHash, isDuplicate
- `entities.ts` — linkMemoryToEntity, getMemoryEntities
- `ingest.ts` — ingestFile, ingestProject
- `extractors/structured.ts` — extractStructured

Vault (L0):
- `vault/client.ts` — vault file operations
- `vault/index-builder.ts` — appendToLog, rebuildIndex
- `vault/state.ts` — state KV store
- `vault/git.ts` — git operations
- `vault/formatter.ts` — serialize/parse memory files
- `vault/watcher.ts` — file system monitoring

Kuzu (L2):
- `kuzu/client.ts` — KuzuClient setup/teardown
- `kuzu/upsert.ts` — upsertMemoryToKuzu, removeMemoryFromKuzu
- `kuzu/query.ts` — queryMemoriesL2
- `kuzu/entity-store.ts` — entity resolution

Setup:
- `setup/rebuild.ts` — rebuildFromVault, reconcileMergedBranch
- `setup/wizard.ts` — runMemoryInit
- `setup/activate.ts` — activateL2

Tests (21 files: 175 passing):
- `tests/vault-*.test.ts` (5 files: client, state, git, formatter, watcher)
- `tests/ingest-*.test.ts` (3 files: file, project, extraction)
- `tests/kuzu-*.test.ts` (3 files: client, upsert, query)
- `tests/scoring.test.ts`, `dedup.test.ts`, `entities.test.ts`, `recall.test.ts`, `write.test.ts`
- `tests/merge-reconcile.test.ts`, others

---

### 2.3 @fulcrum/monitor

**Version:** 0.0.1 | **Type:** ESM | **Private:** yes

**Package.json**
- Main: `./src/index.ts`
- Dependencies (4):
  - `@fulcrum/core`
  - `ulidx@^2.3.0`
  - `hono@^4.4.0` (HTTP framework)
  - `@hono/node-server@^1.12.0` (Node.js adapter)
- Dev: better-sqlite3, types, vitest

**Public API**
- Everything from: `types.ts`, `schema.ts`, `metrics.ts`, `server.ts`
- Main export: `startMonitorServer(config): MonitorServer`

**Source Files (5 total)**

- `index.ts` — re-exports all
- `types.ts` — MonitorServer, MonitorServerConfig
- `schema.ts` — analytic schemas
- `metrics.ts` — getMetrics, getBurndown, getPerRoleMetrics, getMemoryMetrics, getForecasting
- `server.ts` — HTTP server (Hono routes, see §6 below)

**Tests (3 files: 10 passing)**

---

### 2.4 @fulcrum/planning

**Version:** 0.0.1 | **Type:** ESM | **Private:** yes

**Package.json**
- Main: `./src/index.ts`
- Dependencies (2):
  - `@fulcrum/core`
  - `ulid@^2.3.0`
- Dev: better-sqlite3, types, vitest

**Public API**
- Types: all from `types.ts`
- Epics: `createEpic(input)`, `updateEpic(input)`, `listEpics(query)`
- Issues: `createIssue(input)`, `updateIssue(input)`, `listIssues(query)`
- PRDs: `createPRD(input)`, `updatePRD(input)`, `listPRDs(query)`
- Plans: `createPlan(input)`, `updatePlan(input)`, `listPlans(query)`, `linkIssueToPlan(input)`
- Relations: `addTaskRelation(input)`, `removeTaskRelation(input)`, `getBlockers(task_id)`, `getTaskRelations(task_id)`
- Reviews: `createReview(input)`, `updateReview(input)`, `getReview(id)`, `listReviews(query)`

**Source Files (8 total)**

- `index.ts`, `types.ts`
- `epics.ts`, `issues.ts`, `prds.ts`, `plans.ts`, `relations.ts`, `reviews.ts`

**Tests (7 files: 35 passing)**

---

### 2.5 @fulcrum/policy

**Version:** 0.0.1 | **Type:** ESM | **Private:** yes

**Package.json**
- Main: `./src/index.ts`
- Dependencies (3):
  - `@fulcrum/core`
  - `@fulcrum/teams`
  - `minimatch@^10.2.5` (glob pattern matching)
  - `ulid@^2.3.0`
- Dev: better-sqlite3, types, vitest

**Public API**
- Types: all from `types.ts`
- Secret guard: `checkSecrets(input)`, `redactSecrets(text)`
- Policy engine: `SYSTEM_INVARIANTS`, `evaluatePolicy(input)`, `createPolicyRule(input)`, `listPolicyRules(query)`
- Audit: `logPolicyEvent(input)`, `getAuditLog(query)`

**Source Files (5 total)**

- `index.ts`, `types.ts`
- `secret-guard.ts` — secret detection + redaction
- `engine.ts` — policy evaluation
- `audit.ts` — event logging

**Tests (4 files: 95 passing)**

---

### 2.6 @fulcrum/sync

**Version:** 0.0.1 | **Type:** ESM | **Private:** yes

**Package.json**
- Main: `./src/index.ts`
- Dependencies (3):
  - `@fulcrum/core`
  - `@fulcrum/policy`
  - `ulidx@^2.3.0`
- Dev: better-sqlite3, types, vitest

**Public API**
- All from: `types.ts`, `schema.ts`, `plane/client.ts`, `plane/adapter.ts`, `sync-manager.ts`, `sync.ts`
- Plane integration, conflict detection, bidirectional sync

**Source Files (7 total)**

- `index.ts`, `types.ts`, `schema.ts`
- `plane/client.ts`, `plane/adapter.ts`
- `sync-manager.ts`, `sync.ts`

**Tests (1 file: 15 passing)**

---

### 2.7 @fulcrum/teams

**Version:** 0.0.1 | **Type:** ESM | **Private:** yes

**Package.json**
- Main: `./src/index.ts`
- Dependencies (2):
  - `@fulcrum/core`
  - `ulidx@^2.0.0`
- Dev: better-sqlite3, types, vitest

**Public API**
- All from: `types.ts`, `schema.ts`, `teams.ts`
- Scheduler: `canStartTeam(instance_id): boolean`

**Source Files (5 total)**

- `index.ts`, `types.ts`, `schema.ts`, `teams.ts`, `scheduler.ts`

**Tests (2 files: 8 passing)**

---

### 2.8 @fulcrum/workflows

**Version:** 0.0.1 | **Type:** ESM | **Private:** yes

**Package.json**
- Main: `./src/index.ts`
- Dependencies (2 required, 3 optional peer):
  - `@fulcrum/core`
  - `ulidx@^2.0.0`
  - *Peer (optional):* `@fulcrum/planning`, `@fulcrum/teams`, `@fulcrum/worker`

**Public API**
- All from: `types.ts`, `schema.ts`, `registry.ts`, `engine.ts`, `workflows.ts`
- Runner: `runWorkflow(input)`
- Step executor: `executeStep(input)`, `getStepHandler(name)`, `listStepHandlers()`

**Source Files (8 total)**

- `index.ts`, `types.ts`, `schema.ts`
- `registry.ts`, `engine.ts`, `workflows.ts`, `runner.ts`, `step-executor.ts`

**Tests (2 files: 25 passing)**
- `tests/runner.test.ts` (10 tests)
- `tests/workflows.test.ts` (15 tests)

---

### 2.9 @fulcrum/worker

**Version:** 0.0.1 | **Type:** ESM | **Private:** yes

**Package.json**
- Main: `./src/index.ts`
- Dependencies (1):
  - `@fulcrum/core`
- Dev: better-sqlite3, types, vitest

**Public API**
- Lifecycle: `spawnAgent(input): Promise<WorkerResult>`
- Adapter management: `registerAgentAdapter(name, adapter)`, `getAgentAdapter(name)`, `listAgentAdapters()`
- Built-in adapters: `stubAdapter`, `subprocessAdapter`
- Types: `AgentAdapter`, `SpawnContext`, `SpawnAgentInput`, `WorkerResult`

**Source Files (6 total)**

- `index.ts`, `types.ts`
- `lifecycle.ts`, `adapter.ts`, `stub.ts`, `subprocess.ts`

**Tests (1 file: 8 passing)**

---

### 2.10 @fulcrum/worktrees

**Version:** 0.0.1 | **Type:** ESM | **Private:** yes

**Package.json**
- Main: `./src/index.ts`
- Dependencies (2):
  - `@fulcrum/core`
  - `ulidx@^2.3.0`
- Dev: better-sqlite3, types, vitest

**Public API**
- All from: `types.ts`, `schema.ts`, `worktrees.ts`

**Source Files (4 total)**

- `index.ts`, `types.ts`, `schema.ts`, `worktrees.ts`

**Tests (1 file: 41 passing)**

---

### 2.11 @fulcrum/cli

**Version:** 0.0.1 | **Type:** ESM | **Private:** yes | **Bin:** `fulcrum`

**Package.json**
- Main: `./src/index.ts`
- Bin: `{ "fulcrum": "./src/index.ts" }` (executable entry)
- Dependencies (11):
  - All workspace packages (core, memory, monitor, planning, policy, sync, teams, worker, workflows, worktrees)
  - `tsx@^4.0.0`
- Dev: types, vitest

**Source Files (1 total)**

- `index.ts` — 2211 lines; entire CLI in one file

**Public API**
- CLI invoked via `fulcrum <group> <command> [options]`
- Helper functions: `outputRows(rows, columns)`, `outputObject(obj)`
- **14 command groups:**
  1. **memory** — init, accelerate, rebuild, status
  2. **serve** — mcp, monitor, all
  3. **hook** — claude, gemini, pi (agent integration entry points)
  4. **workspaces** — list, create
  5. **projects** — list, create
  6. **task** — list, get, create, update
  7. **issue** — list, create, get, update
  8. **epic** — list, create, get
  9. **board** — show
  10. **queue** — merge list, merge process; review list
  11. **sync** — status, push, pull
  12. **team** — list, create, invoke, instances
  13. **workflow** — list, start, run, status, resume
  14. **agent** — list, status, spawn

**MCP Tools (served by `fulcrum serve mcp`)**

Standard JSON-RPC 2.0 stdio server with ~13 tools:

- `task_create` — create a task
- `task_update` — update task status/note
- `task_list` — query tasks
- `memory_write` — write to memory
- `memory_recall` — search memories
- `run_agent` — spawn an agent run
- `build_cos_context` — generate context
- `emit_event` — emit event
- `create_team_instance` — spawn team
- `create_agent_profile` — dynamic agent registration
- `list_agent_profiles` — query profiles
- *and others*

**Tests (3 files: 28 passing)**
- `tests/hook-normalization.test.ts` (13 tests)
- `tests/cli-coverage.test.ts` (8 tests)
- `tests/hook-pre-post.test.ts` (7 tests)

---

## 3. @fulcrum/core Deep Dive

### 3.1 Module List (62 files)

**Domain modules (25 files)**

| File | Purpose |
|------|---------|
| `index.ts` | Public API surface |
| `types.ts` | All type definitions |
| `config.ts` | Config loading + validation |
| `constants.ts` | SQL enums, ID prefixes, role lists |
| `ids.ts` | newId, nextDisplayId generators |
| `tasks.ts` | Task CRUD + relations |
| `runs.ts` | Agent run lifecycle |
| `workspaces.ts` | Workspace CRUD |
| `projects.ts` | Project CRUD |
| `memory.ts` | Delegation to @fulcrum/memory |
| `handoffs.ts` | Handoff lifecycle |
| `events.ts` | Event emission |
| `policy.ts` | Policy check delegation |
| `status.ts` | Workspace status + CoS context |
| `status-category.ts` | Status → category mapping |
| `roles.ts` | Role capabilities, L1 list |
| `agent-profiles.ts` | Dynamic agent profiles table |
| `cos-parser.ts` | Parse + apply CoS responses |
| `cos-context.ts` | Build world state |
| `janitor.ts` | Cleanup task runner |
| `locks.ts` | Advisory locks |

**Database (2 files)**
| File | Purpose |
|------|---------|
| `db/client.ts` | DB connection management |
| `db/migrations.ts` | 16 migrations |

**Embedding (4 files)**
| File | Purpose |
|------|---------|
| `embedding/types.ts` | EmbeddingProvider interface |
| `embedding/registry.ts` | Provider factory + init |
| `embedding/local.ts` | HuggingFace transformer wrapper |
| `embedding/reranker.ts` | Reranking logic |

**Telemetry (2 files)**
| File | Purpose |
|------|---------|
| `telemetry/otel.ts` | OpenTelemetry setup |
| `telemetry/spans.ts` | Span helpers |

**Tests (32 files, 221 passing)**

---

### 3.2 Public API Summary

**See §2.1 above for full detail.**

---

### 3.3 DB Schema Summary

**16 tables (from migrations 001–016)**

Core:
- workspaces, projects, tasks, agent_runs, memories, advisory_locks

Planning:
- epics, issues, prds, plans, plan_issues, prd_plans, issue_labels

Metadata:
- display_id_sequences, events, task_relations, task_labels, memory_entities

Policy:
- policy_rules, policy_events

Teams:
- team_templates, team_instances, team_members

Workflows:
- workflow_runs

Worktrees:
- artifacts, artifact_contracts, reviews, worktrees, handoffs, agentrun_artifacts, review_targets, task_memory_links, artifact_memory_links

Sync:
- sync_states, sync_conflicts, sync_queue

Graph:
- graph_entities, graph_edges, graph_episodes

Analytics:
- analytics_daily, analytics_cycle, analytics_project, analytics_agent, analytics_team

Virtual tables (FTS5):
- tasks_fts, memories_fts, epics_fts, issues_fts, prds_fts, plans_fts, artifacts_fts
- vec_memories, vec_chunks (optional, sqlite-vec)

**Check constraints:** See §2.1 above for complete list.

**Migrations:** 16 total (001 initial → 016 workspace config)

---

### 3.4 Migrations (All 16)

| # | Name | Tables Added | Key Fields |
|---|------|--------------|------------|
| 001 | initial | workspaces, projects, tasks, agent_runs, memories, advisory_locks, tasks_fts, memories_fts | Core entities + FTS |
| 002 | extensions | (alters) | Add project metadata, task/run enrichment, events, task_relations, task_labels, display_id_sequences |
| 003 | planning | epics, issues, prds, plans, plan_issues, prd_plans, issue_labels, *_fts tables | Planning domain |
| 004 | policy | policy_rules, policy_events | Policy engine + audit |
| 005 | memory_enrichment | (alters), memory_entities, code_chunks | Memory entity linking + code RAG |
| 006 | teams | team_templates, team_instances, team_members | Team orchestration |
| 007 | workflows | workflow_runs | Workflow engine |
| 008 | worktrees | artifacts, artifact_contracts, reviews, worktrees, handoffs, *_links tables | Worktrees + handoffs + artifacts |
| 009 | monitor | analytics_daily, analytics_cycle, analytics_project, analytics_agent, analytics_team | Analytics schemas |
| 010 | sync | sync_states, sync_conflicts, sync_queue | Bidirectional sync |
| 011 | graph | graph_entities, graph_edges, graph_episodes | Knowledge graph (L2) |
| 012 | memory_freshness | (alters memories) | Add freshness column |
| 013 | handoff_status | (recreate handoffs) | Add status + claimed_at |
| 014 | sync_direction | (idempotent alters) | Add direction, conflict_state to sync_states (guard for old DBs) |
| 015 | pi_profile | (idempotent alter) | Add pi_profile to agent_runs (guard for old DBs) |
| 016 | workspace_config | (idempotent alter) | Add config_path to workspaces (guard for old DBs) |

---

## 4. Agent Integration Surface

### 4.1 Claude Integration

**Files in `agent-integration/claude/`**

- `.mcp.json` — Claude MCP server config
- `CLAUDE.md` — Prompt for Claude Code (context, instructions, invariants)
- `settings-hooks-snippet.json` — PreToolUse hook template for `~/.claude/settings.json`

**What happens:**
- `pnpm setup:claude` installs MCP server + merges hook + appends CLAUDE.md to `~/.claude/CLAUDE.md`
- MCP server runs `fulcrum serve mcp` (stdio JSON-RPC 2.0)
- PreToolUse hook runs `fulcrum hook claude` (normalizes tool call, checks policy)

---

### 4.2 Gemini Integration

**Files in `agent-integration/gemini/`**

- `GEMINI.md` — Gemini CLI prompt
- `gemini-extension.json` — Gemini extension manifest

**What happens:**
- `pnpm setup:gemini` copies files to `~/.gemini/extensions/fulcrum/`
- BeforeTool hook runs `fulcrum hook gemini`

---

### 4.3 PI Integration

**Files in `agent-integration/pi/`**

- `PI.md` — PI coding agent prompt
- `fulcrum.extension.json` — Extension manifest
- `fulcrum.d.ts` — TypeScript type definitions for cockpit API
- `cockpit/` — PI cockpit widget source
  - `package.json` — cockpit package
  - `README.md` — cockpit documentation
  - `index.ts` — widget implementation (exposes `run()`, `getTools()`, `getCommands()`)

**Cockpit features:**
- Widgets for memory recall, task list, team status, agent status
- Commands: check, reset, validate, summarize
- Tools: memory operations, task management, team invocation
- TUI integration with PI coding agent

**What happens:**
- `pnpm setup:pi` runs `pi install agent-integration/pi/cockpit`
- BeforeTool hook runs `fulcrum hook pi`

---

### 4.4 Roles (25 MDs)

All in `agent-integration/roles/`:

1. **chief_of_staff.md** — Orchestrator (L1)
2. **software_engineer.md** — Implementation (L2)
3. **code_reviewer.md** — Code review (L2)
4. **security_reviewer.md** — Security review
5. **tech_lead.md** — Technical leadership
6. **integration_worker.md** — CI/CD + merge queue
7. **context_gatherer.md** — Information gathering
8. **prd_planner.md** — PRD authoring
9. **implementation_planner.md** — Plan creation
10. **issue_decomposer.md** — Issue breakdown
11. **research_worker.md** — Research/investigation
12. **refactor_worker.md** — Code refactoring
13. **browser_worker.md** — Web research
14. **data_engineer.md** — Data pipelines
15. **ml_engineer.md** — ML/AI work
16. **devops_engineer.md** — Infrastructure
17. **architecture_reviewer.md** — Architecture review
18. **qa_engineer.md** — Testing
19. **analyst.md** — Analysis/strategy
20. **product_manager.md** — Product planning
21. **documentation_writer.md** — Documentation
22. **memory_curator.md** — Memory management
23. **orchestrator.md** — Team orchestration
24. **custom.md** — Custom role template
25. **README.md** — Role guide

Each MD includes:
- Purpose (one-liner)
- Capabilities (what can this role do)
- Example tasks
- Key constraints

---

### 4.5 Skills (13 MDs)

All in `agent-integration/skills/`:

1. **block-when-stuck.md** — Detect + escalate when blocked
2. **chief-of-staff-response-format.md** — CoS response formatting guide
3. **complete-agent-run.md** — Complete run + write final memory
4. **heartbeat-during-long-operations.md** — Long-running operation heartbeats
5. **integration-worker-merge-gate.md** — Merge queue gate logic
6. **invoke-team-only-from-cos.md** — Team invocation rules
7. **recall-before-writing.md** — Recall context before writing memories
8. **run-workflow-not-freestyle.md** — Use workflows, not freestyle
9. **secret-hygiene.md** — Secret detection + redaction
10. **start-every-task.md** — Always start_agent_run before work
11. **workspace-status-on-session-start.md** — Initial context building
12. **write-memory-on-completion.md** — Memory hooks
13. **index.md** — Skills index/guide

Each skill is a prompt/instruction for AI agents using Fulcrum tools.

---

### 4.6 install.ts Pipeline

**File: `agent-integration/install.ts` (~800 lines)**

**Steps (in order):**

1. **CLI bin** — symlink `fulcrum` to `~/.local/bin/fulcrum` (with PATH warning)
2. **Claude Code: MCP server** — `claude mcp add --scope user fulcrum -- fulcrum serve mcp`
3. **Claude Code: PreToolUse hook** — merge hook JSON into `~/.claude/settings.json`
4. **Claude Code: global CLAUDE.md** — append `agent-integration/claude/CLAUDE.md` to `~/.claude/CLAUDE.md`
5. **Claude Code: skills** — copy `agent-integration/skills/*.md` to `~/.claude/skills/fulcrum/`
6. **Gemini extension** — mkdir + copy files to `~/.gemini/extensions/fulcrum/`
7. **PI cockpit** — run `pi install agent-integration/pi/cockpit`

**Options:**
- `pnpm setup all` — all runtimes
- `pnpm setup:claude`, `:gemini`, `:pi` — individual runtimes
- `pnpm setup:check` — non-destructive status check
- `pnpm setup:dry` — print actions without applying
- `--dry-run` flag — simulate without changes
- `--verbose` flag — extra diagnostics

**Outcome:**
- Global fulcrum CLI at `~/.local/bin/fulcrum`
- Claude Code configured with MCP server + hooks
- Gemini configured with extension
- PI configured with cockpit widget + tools

---

## 5. CLI Surface (@fulcrum/cli)

**File: `packages/cli/src/index.ts` (2211 lines)**

**Entry point:** `#!/usr/bin/env tsx` → `fulcrum <group> <command> [options]`

### 5.1 Usage Output

```
CONTROL PLANE
  memory init            Initialize L0 vault + L1 SQLite (+ optional L2)
  memory accelerate      Enable L2 (Kuzu graph + HNSW vector search)
  memory rebuild         Rebuild L1 from L0 vault files
  memory status          Show vault path and layer status

  serve mcp              Start MCP server (stdio JSON-RPC 2.0) — 13 control tools
  serve monitor          Start HTTP monitor + control API (default port 4721)
  serve all              Start both MCP and monitor servers

  hook claude            PreToolUse hook for Claude Code (stdin → policy check)
  hook gemini            BeforeTool hook for Gemini CLI
  hook pi                BeforeTool hook for PI coding agent

DOMAIN
  workspaces list
  workspaces create --name <name> [--id <id>]

  projects list [--workspace-id <id>]
  projects create --name <name> --workspace-id <id> [--type <type>] [--id <id>]

  task list [--workspace-id <id>] [--project-id <id>] [--status <status>] [--limit <n>]
  task get --id <task_id>
  task create --title <title> [--workspace-id <id>] [--project-id <id>] [--description <d>]
  task update --id <task_id> [--status <s>] [--note <n>] [--assigned-to <role>]

  issue list, create, get, update
  epic list, create, get
  board show [--workspace-id <id>] [--project-id <id>]

  queue merge list [--workspace-id <id>]
  queue merge process --workspace-id <id> --actor-role integration_worker
  queue review list [--workspace-id <id>]

  sync status, push, pull [--workspace-id <id>]

TEAMS + WORKFLOWS + AGENTS
  team list, create, invoke, instances
  workflow list, start, run, status, resume
  agent list, status, spawn
```

### 5.2 Command Groups (14 total)

| Group | Commands | Purpose |
|-------|----------|---------|
| memory | init, accelerate, rebuild, status | Setup vault, activate L2, check status |
| serve | mcp, monitor, all | Start servers |
| hook | claude, gemini, pi | Agent integration hooks |
| workspaces | list, create | Workspace CRUD |
| projects | list, create | Project CRUD |
| task | list, get, create, update | Task CRUD + management |
| issue | list, create, get, update | Issue CRUD |
| epic | list, create, get | Epic CRUD |
| board | show | Board view (Kanban) |
| queue | merge list/process, review list | Merge queue + review queue |
| sync | status, push, pull | Bidirectional sync (Plane) |
| team | list, create, invoke, instances | Team management |
| workflow | list, start, run, status, resume | Workflow execution |
| agent | list, status, spawn | Agent runs |

### 5.3 Output Helpers

- `outputRows(rows, columns?)` — JSON or tab-separated table
- `outputObject(obj)` — JSON or key-value format
- Behavior depends on `--json` flag

### 5.4 Auto-initialization Flow

Every `fulcrum` command:
1. Loads `.fulcrum.json` (from cwd or parents)
2. If not present, auto-creates in `.fulcrum/`:
   - `fulcrum.db` (SQLite)
   - `.fulcrum.json` config with workspace + project IDs (deterministic from path)
   - Default workspace + project

No explicit `init` step needed; first command initializes the project.

---

## 6. Monitor Server Routes

**File: `packages/monitor/src/server.ts` (658 lines)**

**HTTP API (Hono app on port 4721 by default)**

### Read Endpoints

| Method | Path | Query | Purpose |
|--------|------|-------|---------|
| GET | `/status` | — | Server health + workspace_id |
| GET | `/metrics` | workspace_id, project_id, start_date, end_date | Daily/project metrics |
| GET | `/burndown` | workspace_id, project_id, start_date, end_date | Burndown chart data |
| GET | `/events/stream` | workspace_id | Server-Sent Events (streaming) |
| GET | `/board` | workspace_id | Kanban board state (task counts per status_category) |
| GET | `/agents` | workspace_id | All agent runs (last 50) |
| GET | `/agents/:id` | workspace_id | Single agent run detail |
| GET | `/merge-queue` | workspace_id | Worktrees ready for merge |
| GET | `/review-queue` | workspace_id | Reviews pending |
| GET | `/artifacts` | workspace_id | All artifacts (last 50) |
| GET | `/memory-trace` | workspace_id | All memories (last 50) |
| GET | `/analytics/summary` | workspace_id | Task/run/memory/event counts |
| GET | `/analytics/per-role` | workspace_id | Metrics by agent role |
| GET | `/analytics/memory` | workspace_id | Memory layer stats |
| GET | `/analytics/forecast` | workspace_id, horizon_days | Throughput forecast |
| GET | `/policy/events` | workspace_id | Policy audit log (last 50) |
| GET | `/sync/state` | workspace_id | Sync status for all objects |
| GET | `/teams` | workspace_id | Team instances (last 50) |
| GET | `/replay/:run_id` | workspace_id | Event replay for run |
| GET | `/tasks` | workspace_id, project_id, status, limit | Task list with filters |
| GET | `/workspaces` | — | All workspaces (last 50) |
| GET | `/projects` | workspace_id (opt) | Projects, optionally filtered |

### Write Endpoints

| Method | Path | Body | Purpose |
|--------|------|------|---------|
| POST | `/tasks` | {title, project_id, workspace_id, description?, priority?, assigned_to?, done_criteria?} | Create task |
| PATCH | `/tasks/:id` | {status?, note?, assigned_to?} | Update task |
| POST | `/runs` | {task_id?, agent_role, workspace_id, project_id?, worktree_path?, pi_run_id?} | Start agent run |
| POST | `/runs/:id/heartbeat` | {workspace_id?, current_step?, progress_pct?} | Heartbeat |
| POST | `/runs/:id/complete` | {workspace_id?, output_summary?, artifact_paths?} | Complete run |
| POST | `/runs/:id/block` | {workspace_id?, reason} | Block run (requires reason) |
| POST | `/memory/recall` | {query, workspace_id, project_id?, task_id?, limit?} | Recall memories |
| POST | `/memory/write` | {content, workspace_id, project_id, title?, tags?, scope?, kind?} | Write memory |
| POST | `/cos-context` | {goal?, project_id, workspace_id, max_tasks?, max_events?} | Build CoS context |
| POST | `/policy/check` | {action, resource, actor_id?, workspace_id?, actor_type?} | Check policy (team invite gating) |

### Behavior

- Default port: 4721 (from `.fulcrum.json` or `config.host:port`)
- Default workspace_id: from config (used if not in query)
- Auto-creates workspace/project if missing (for tool integration)
- Streaming SSE at `/events/stream` with polling fallback (2s interval)
- Error responses: JSON `{"error": "..."}` with HTTP status

---

## 7. Tests (1004 Total)

### Per-Package Breakdown

| Package | Files | Passing | Skipped | Coverage Areas |
|---------|-------|---------|---------|-----------------|
| core | 32 | 221 | 0 | Migrations, DB, tasks, runs, roles, CoS, memory, events, handoffs, locks, profiles |
| memory | 21 | 175 | 0 | Vault, FTS, Kuzu, ingestion, state, git, watcher, merge reconcile |
| cli | 3 | 28 | 0 | Hook normalization, CLI coverage, pre/post hooks |
| monitor | 3 | 10 | 0 | Metrics, dashboard, analytics |
| planning | 7 | 35 | 0 | Epics, issues, PRDs, plans, relations, reviews |
| policy | 4 | 95 | 0 | Engine, rules, secrets, audit |
| teams | 2 | 8 | 0 | Team CRUD, scheduler |
| workflows | 2 | 25 | 0 | Runner, steps |
| sync | 1 | 15 | 0 | Plane adapter, conflict resolution |
| worker | 1 | 8 | 0 | Agent spawning, adapters |
| worktrees | 1 | 41 | 0 | Git worktrees, merges, artifacts |
| **TOTAL** | **77** | **1004** | **0** | — |

**Test framework:** Vitest
**Coverage:** No explicit coverage tool (tests are comprehensive but runtime coverage not measured)
**Skipped tests:** None (all 1004 tests running)

### Key Test Areas

- **DB invariants:** CHECK constraint validation (migrations.test.ts, check-constraints.test.ts)
- **ID generation:** newId() guard test (ulid-guard.test.ts)
- **Role capabilities:** Guard against hardcoded role strings (role-string-guard.test.ts)
- **CoS parsing:** Context + response parsing (cos-context.test.ts, cos-parser.test.ts)
- **Memory:** Vault ops, FTS, Kuzu integration, ingestion (21 memory tests)
- **Hooks:** Event normalization for Claude/Gemini/PI (hook-normalization.test.ts)
- **Workflows:** Runner + step execution (runner.test.ts, workflows.test.ts)
- **Worktrees:** Git ops + merge logic (worktrees.test.ts, 41 tests)

---

## 8. Configuration Surface

### .fulcrum.json (Project Config)

Located at `.fulcrum.json` in project root or auto-created.

**Schema:**
```json
{
  "workspace_id": "ws_...",      // Generated from path hash
  "project_id": "proj_...",      // Generated from path hash
  "monitor_port": 4721           // HTTP monitor port
}
```

### FulcrumConfig (from config.ts, loadConfig())

```typescript
interface FulcrumConfig {
  workspace_id?: string        // Workspace scope for this project
  project_id?: string          // Project scope
  port?: number                // Monitor HTTP port (default 4721)
  vault_path?: string          // Memory vault directory (default ~/.fulcrum/vault)
  db_path?: string             // SQLite db path (default .fulcrum/fulcrum.db)
  embedding_provider?: string  // text|code provider (default: local/transformers)
  embedding_models?: {
    text?: string              // Text embedding model (default: Xenova/gte-small)
    code?: string              // Code embedding model (default: Xenova/gte-code-small)
  }
  otel_enabled?: boolean       // OpenTelemetry tracing (default: false)
  otel_endpoint?: string       // OTLP exporter HTTP endpoint
  otel_service_name?: string   // Service name (default: fulcrum)
}
```

### Environment Variables

The codebase reads:

- `$CWD` — project root (for .fulcrum.json, .fulcrum/db)
- `$HOME` — user home (for ~/.fulcrum/vault, ~/.local/bin, ~/.claude, ~/.gemini)
- `$USERPROFILE` — Windows home fallback
- `$PATH` — check if ~/.local/bin in path (install.ts)
- `OTEL_EXPORTER_OTLP_ENDPOINT` — OpenTelemetry collector endpoint (optional)

No explicit env var parsing in code; all config via .fulcrum.json and command-line flags.

### Per-Package Config

- **@fulcrum/core:** Embedding provider config (init via API)
- **@fulcrum/memory:** Vault path, git operations (read from core config)
- **@fulcrum/monitor:** Port, host, workspace_id (MonitorServerConfig)
- **@fulcrum/cli:** Global flags: --vault, --port, --json, --version, --help

---

## 9. Package Dependency Graph

### Static Dependencies (Workspace Packages)

```
@fulcrum/core
  ├─ (peer: @fulcrum/teams, optional)

@fulcrum/memory
  └─ @fulcrum/core

@fulcrum/monitor
  └─ @fulcrum/core

@fulcrum/planning
  └─ @fulcrum/core

@fulcrum/policy
  ├─ @fulcrum/core
  └─ @fulcrum/teams

@fulcrum/sync
  ├─ @fulcrum/core
  └─ @fulcrum/policy

@fulcrum/teams
  └─ @fulcrum/core

@fulcrum/workflows
  ├─ @fulcrum/core
  └─ (peer: @fulcrum/planning, @fulcrum/teams, @fulcrum/worker, optional)

@fulcrum/worker
  └─ @fulcrum/core

@fulcrum/worktrees
  └─ @fulcrum/core

@fulcrum/cli
  ├─ @fulcrum/core
  ├─ @fulcrum/memory
  ├─ @fulcrum/monitor
  ├─ @fulcrum/planning
  ├─ @fulcrum/policy
  ├─ @fulcrum/sync
  ├─ @fulcrum/teams
  ├─ @fulcrum/worker
  ├─ @fulcrum/workflows
  └─ @fulcrum/worktrees
```

### Cycles

- **Known cycle: core ↔ teams**
  - @fulcrum/teams depends on @fulcrum/core
  - @fulcrum/core uses lazy getter `getTeamOps()` to avoid static import
  - Resolution: dynamic import at runtime (see core/src/index.ts line 125)

### External Dependencies

**Load-bearing (required for core functionality):**

- `better-sqlite3@^12.0.0` — SQLite binding (core persistence)
- `sqlite-vec@^0.1.6` — Vector storage in SQLite (memory L2)
- `@huggingface/transformers@^3.0.0` — Local embedding models (memory L0 enrichment)
- `kuzu@^0.10.0` — Graph database (memory L2 knowledge graph)
- `simple-git@^3.22.0` — Git vault operations (memory L0)
- `gray-matter@^4.0.3` — YAML frontmatter parsing (memory files)
- `chokidar@^3.6.0` — File watcher (memory vault watching)
- `minimatch@^10.2.5` — Glob pattern matching (policy rules)
- `hono@^4.4.0` — HTTP framework (monitor server)
- `@hono/node-server@^1.12.0` — Node.js adapter (monitor server)

**Optional (features can degrade):**

- `@opentelemetry/*` (5 deps) — Tracing (optional; can skip init)
- `@mariozechner/pi-*` (peer) — PI coding agent integration (optional)

**Development only:**

- `typescript@^5.4.0` — TypeScript compiler
- `vitest@^1.4.0` — Test framework
- `tsx@^4.21.0` — TypeScript executor (for CLI)
- `@types/better-sqlite3` — Type definitions

### Native Modules

- `better-sqlite3` — C++ SQLite binding; requires `node-gyp` build
- `kuzu` — C++ graph DB; requires build
- `sqlite-vec` — C extension for SQLite
- `onnxruntime-node` — ONNX runtime (optional, via transformers)
- `koffi` — FFI library (optional, via kuzu)

**pnpm.onlyBuiltDependencies override ensures these are always built:**
```json
"better-sqlite3", "esbuild", "onnxruntime-node", "koffi", "protobufjs", "kuzu"
```

---

## 10. Build and Distribution

### Build Script

```json
"build": "pnpm -r build"
```

Currently **no-op** — all packages lack `build` script. Code runs as TypeScript via `tsx`.

**Reason:** ESM + TypeScript at runtime (tsx loader handles compilation on-demand).

### TypeScript Compilation

- **No static build step** — TypeScript compiled at runtime via tsx
- Each invocation of `fulcrum`, `vitest`, etc. compiles on-the-fly
- `.ts` files served directly from `src/`
- No `dist/`, `lib/`, or `build/` directories

### CLI Installation

**Symlink method (not npm bin):**

```bash
pnpm install-bin
# Creates: $HOME/.local/bin/fulcrum → /repo/fulcrum (wrapper script)
```

Wrapper script:
```bash
exec "$DIR/node_modules/.bin/tsx" "$DIR/packages/cli/src/index.ts" "$@"
```

**Why not npm bin:**
- Package is private (not published)
- Wrapper allows $HOME/.local/bin global install
- No npm postinstall hooks needed

### npm Publishing

**All packages are `"private": true`**

No packages can be published to npm. Would require:
1. Remove `"private": true`
2. Bump version in root + package package.jsons
3. Add publish step to CI (currently none)

---

## 11. Recent Churn (git log --oneline -40)

### Latest Commits (Round 5 + fixes)

| Commit | Desc | Type | Category |
|--------|------|------|----------|
| 31583da | feat(hook): pre/post split — memory recall, secret scan, tool_trace (L-6, L-7, L-8) | Feature | Hook |
| f83f628 | feat(cli): add 5 MCP tools for team + agent profile management (L-5) | Feature | CLI |
| da50db8 | feat(setup): install Claude Skills to ~/.claude/skills/fulcrum/ (L-2b) | Feature | Setup |
| 080d7d5 | feat(core): dynamic agent_profiles table + team re-exports (L-3, L-4) | Feature | Core |
| ae6b064 | feat(runs): memory hooks on start/complete/block/escalate (L-9, L-10) | Feature | Runs |
| b916cb3 | feat(skills): ship 13 Claude Skills teaching agents to use Fulcrum tools (L-2a) | Feature | Skills |
| 61e4e7d | docs(roles): ship 18 missing role prompt MDs — full AgentRole coverage (L-1) | Docs | Roles |
| 70d7c04 | docs(guides): add installation, CLI reference, workflow authoring, worker adapters, telemetry | Docs | Guides |
| 01dd627 | docs(readme): rewrite for round 5 — worker, runner, merge queue, telemetry, CLI, guards | Docs | Readme |
| 565008f | feat(setup): audit + polish install flow — dry-run, --check, clearer errors, better summary | Feature | Setup |
| fb762f4 | docs(cli): comprehensive --help for all 14 command groups + per-group help | Docs | CLI |
| 922c7ec | docs(agents): update for @fulcrum/worker, capability helpers, guard tests, 24 roles | Docs | Agents |
| 4f7eaa4 | docs(changelog): add 0.1.0 entry covering rounds 1-5 | Docs | Changelog |
| 2f33ffd | feat(cli): add 9 subcommand groups for task/issue/epic/board/queue/sync/team/workflow/agent (J-6) | Feature | CLI |
| 39a59fd | feat(telemetry): opt-in OTLP exporter for spans (J-7) | Feature | Telemetry |
| b5bc93d | feat(telemetry): wire startSpan/endSpan into runner, worker, janitor, MCP (K-5) | Feature | Telemetry |
| 13c016d | feat(workflows): runner + 16 step handlers with retries/timeouts (H-1, H-5) | Feature | Workflows |
| a37853a | feat(worker): add @fulcrum/worker package with pluggable agent adapter (H-2) | Feature | Worker |
| 238afb5 | feat(worktrees): processMergeQueue executes real git merge with gate checks (H-4) | Feature | Worktrees |
| 7dd7e4b | feat(worktrees): git worktree add/remove subprocess integration (H-3) | Feature | Worktrees |

### Feature Categories (Recent 40 commits)

**Code features:** 20 commits (feat:)
- Hook pre/post split, MCP tools, dynamic profiles, memory hooks, workflow runner, worker, worktrees
- Setup + polish, telemetry, CLI subcommands

**Documentation:** 16 commits (docs:)
- Roles, guides, CLI reference, README, AGENTS, CHANGELOG, skills

**Fixes:** 2 commits (fix:)
- Role string guards, ID generation guards, CI redaction, CoS parser

**Tests:** 2 commits (test:)
- Constraint drift guards, CHECK constraints

**Refactors:** 1 commit (refactor:)
- Central role capability lookup

### Big Rocks (Rounds 1-5)

**Round 5 (latest):**
- H-1: Workflow runner + step handlers
- H-2: Worker adapter package
- H-3: Git worktree subprocess
- H-4: Merge queue + gate checks
- H-5: Runner + 16 step handlers
- J-6: CLI subcommand groups (14 groups)
- J-7: OTLP telemetry exporter
- K-5: Telemetry wiring
- L-1 to L-11: Docs + guides + skills + roles

**Status:** All planned work landed; nothing deferred.

---

## 12. TL;DR — What Fulcrum HAS (Pure Inventory, No Opinions)

### Core System

- **11 TypeScript packages** in monorepo; all ESM; all private (not published)
- **62 source files** in core; **29 in memory**; others smaller
- **~2200 lines of CLI** (entire commands in one file)
- **16 database migrations** → ~40 tables, FTS5, graph DB, analytics

### Persistence

- **SQLite** (better-sqlite3): tasks, runs, memories, events, policy, teams, workflows, artifacts, worktrees, sync, graph
- **Git vault** (L0): human-readable memory file store with git history
- **FTS5**: full-text search on tasks, memories, planning entities, artifacts
- **Kuzu graph DB** (L2): entity-relationship graph + HNSW vector search (optional, activated via `memory accelerate`)
- **Vector storage** (sqlite-vec): embeddings for memory recall

### Agent Integration

- **Claude Code:** MCP server + PreToolUse hook + global CLAUDE.md context
- **Gemini CLI:** Extension manifest + BeforeTool hook
- **PI coding agent:** Cockpit widget + TUI integration
- **25 role prompts** (chief_of_staff → custom)
- **13 Claude Skills** teaching tool use
- **Global installer** (`pnpm setup`) that installs to ~/.local/bin, ~/.claude, ~/.gemini, PI

### CLI

- **14 command groups** (memory, serve, hook, workspaces, projects, task, issue, epic, board, queue, sync, team, workflow, agent)
- **2 server modes:** MCP (stdio JSON-RPC) + HTTP monitor (Hono on port 4721)
- **Auto-initialization:** first `fulcrum` command sets up project in .fulcrum/

### Memory System

- **Three-layer stack:**
  - **L0:** Git vault (files + metadata)
  - **L1:** SQLite FTS5 (indexed search)
  - **L2:** Kuzu graph + HNSW vectors (optional, activated on-demand)
- **Ingestion:** file + project ingestion pipelines
- **Entities:** flexible entity linking, semantic extraction
- **Recall:** scoring (importance, freshness, RRF), hybrid L1+L2 search

### Orchestration

- **Teams:** agent team templates, role slots, policy-driven spawning
- **Workflows:** engine + 16 step handlers, multi-step orchestration, retries/timeouts
- **Worker:** pluggable adapter for agent spawning (stub, subprocess, custom)
- **Handoffs:** context + artifact passing between agents

### Data Modeling

- **Tasks:** status, priority, relations, labels, estimates
- **Epics/Issues:** planning domain, PRDs, plans, code reviews
- **Runs:** agent execution tracking, step progress, artifacts
- **Worktrees:** git worktree lifecycle, merge queue + gate checks
- **Artifacts:** output tracking, ownership, reviews, contracts
- **Sync:** bidirectional (Plane), conflict detection, priority queue

### Telemetry & Monitoring

- **OpenTelemetry:** optional spans + OTLP export (opt-in)
- **Analytics:** per-day, per-cycle, per-project, per-agent, per-team
- **Dashboard:** HTTP endpoints for metrics, burndown, forecasting, queues
- **Event replay:** full event log for agent run reconstruction

### Policy & Security

- **Secret guard:** detect + redact secrets before tool use
- **Policy engine:** system invariants + custom rules (minimatch patterns)
- **Audit log:** policy evaluations + decisions
- **Role capabilities:** guards on who can invoke teams, merge, write code

### ID System

- **Deterministic generation:** workspace_id, project_id from path hash
- **Prefixed ULIDs:** task_, mem_, run_, etc. (prefix ensures scoping)
- **Display IDs:** per-project sequencing (epic-1, issue-2, etc.)

### Tests

- **1004 passing tests** across 11 packages
- **Coverage:** migrations, DB, CoS, memory, workflows, hooks, policy, roles, teams, worktrees
- **Framework:** Vitest (no explicit coverage reporting)

### Docs (Not Inventory, But Present)

- **README.md** — full user guide
- **AGENTS.md** — invariants for AI agents
- **guides/** — installation, CLI reference, workflows, worker adapters, telemetry
- **gap-analysis/** — validated findings (phases 1-4)
- **superpowers/specs/** — future design docs (L0 rebuilds, graph, etc.)

### Runtime Model

- **No static build step:** TypeScript compiled on-the-fly via tsx
- **Entry point:** `fulcrum` wrapper script → tsx → CLI index.ts
- **MCP server:** stdio JSON-RPC 2.0, runs subprocesses (no daemon)
- **Monitor server:** HTTP Hono app, stateless (queries DB per request)
- **Configuration:** .fulcrum.json (workspace/project scope), environment from $CWD/.fulcrum/

---

**End of inventory. All facts. No opinions. Totals: 11 packages, 177 src files (excl. tests), 1004 tests, 16 migrations, 40 tables, 25 roles, 13 skills, 14 CLI groups.**

