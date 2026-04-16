# Phase 1 Raw Findings — Gap Analysis

Unvalidated, deduplicated findings from three parallel gap-analysis agents
comparing `/home/mkh/workspace/pi-python-ref` (Python reference) against the
current TypeScript implementation at `/home/mkh/workspace/pi-stack-plan`.

All three reports are preserved verbatim below. Validation and
prioritization happens in `phase-1-validated.md`.

---

## Agent 1 — Specs/Traceability/Decisions Docs

Sources: `pi_local_first_agent_os_spec.md`, `SPEC_TRACEABILITY.md`,
`GAP_ANALYSIS.md`, `CURRENT_STATE.md`, `IMPLEMENTATION_PLAN.md`,
`ASSUMPTIONS.md`, `DECISIONS.log`, `TASKS.md`, `VERIFY.md`, `BLOCKERS.md`,
`PI_INTEGRATION.md`, `docs/superpowers/specs/2026-04-13-fulcrum-design.md`,
`docs/superpowers/plans/2026-04-13-fulcrum-plan-a-core.md`,
`docs/superpowers/plans/2026-04-13-agent-integration-full-control.md`,
`src/pi_agent_os/pi_agents/*.md`.

### CRITICAL

**[A1-001] Project CRUD missing from core**
- Spec: SPEC_TRACEABILITY §5.4
- Evidence: `packages/core/src/index.ts` has no `createProject`/`updateProject`/`listProject`; `packages/core/src/db/migrations.ts` projects table only has id/workspace_id/name/created_at (missing status/type/write_mode/git_url/parent_id)
- Fix: Add `projects.ts` with full CRUD + schema columns

**[A1-002] Project Type/Status not in schema**
- Spec: §5.4 ProjectType={git,non_git,submodule,logical}, ProjectStatus={active,archived,paused}
- Evidence: Types defined in `types.ts` but not persisted
- Fix: Add columns with CHECK constraints

**[A1-003] Workspace CRUD missing**
- Spec: SPEC_TRACEABILITY §5.5
- Evidence: No `createWorkspace`/`updateWorkspace`/`listWorkspace` exported
- Fix: Implement `packages/core/src/workspaces.ts`

**[A1-004] Epic/Issue/PRD/Plan/Review/Artifact CRUD in wrong package**
- Spec: §5.1-5.2 all 20 core object types need unified access
- Evidence: Planning ops in `@moabualruz/fulcrum-planning`, no re-export from `@moabualruz/fulcrum-core`; no Artifact CRUD anywhere
- Fix: Re-export from core or add facade

**[A1-005] Artifact object type missing entirely**
- Spec: §5.1 lists Artifact as core type; §14.7 describes ArtifactContract + MD+JSON sidecar format
- Evidence: Schema has `artifacts` table but no Artifact interface, no CRUD, no file storage
- Fix: Implement `artifact.ts` with interface + file read/write + versioning

**[A1-006] Comment/StatusEvent core types missing**
- Spec: §5.1 lists both as core object types
- Evidence: Not found in any package; no tables
- Fix: Implement `comments.ts` + `status_events` table + CRUD

**[A1-007] BoardView/Cycle/Milestone first-class objects missing**
- Spec: §5.1 + §11.5 (7 board projection types)
- Evidence: Not found in schema or packages
- Fix: Decide projections vs stored records; implement

**[A1-008] MemoryKind missing 1 value (14th kind)**
- Spec: §10.5 requires 14 MemoryKind values
- Evidence: `types.ts` enum has 13 (fact, summary, symbol, decision, procedure, error, diff, doc, code, task_goal, task_decision, task_failure, task_outcome)
- Fix: Identify and add the 14th (likely insight/research/pattern)

**[A1-009] No artifact file storage implementation**
- Spec: §14.7 + §8.1 artifacts stored on disk with owner_id in filename
- Evidence: Schema has artifacts table but no file writer/reader
- Fix: Implement path strategy `.fulcrum/artifacts/{owner_id}/{artifact_id}/{filename}`

**[A1-010] SyncState not accessible from core**
- Spec: §22 Plane Adapter — 15 sync-allowed types, local-wins conflict
- Evidence: `@moabualruz/fulcrum-sync` separate, no core facade for sync state queries
- Fix: Re-export sync state queries from core

### IMPORTANT

**[A1-011] Display IDs not fully implemented**
- Spec: §6.2 human display IDs (ISS-143, TSK-52) per object type per project
- Evidence: `nextDisplayId` exists; need to verify auto-increment + uniqueness constraints on `display_id_sequences`
- Fix: Audit + test concurrency

**[A1-012] Typed ID prefixes incomplete**
- Spec: §6.1 requires 21+ typed prefixes
- Evidence: `ids.ts` has `newId()` but prefix coverage not audited
- Fix: Audit against spec, add missing ones

**[A1-013] Agent run event journal not written**
- Spec: §5.3/§16.5/§19 — `agent_runs.events` JSON array of structured events
- Evidence: Schema has column; `runs.ts` heartbeat/complete/block don't append
- Fix: Add append logic for each lifecycle transition

**[A1-014] Advisory locks table present but no functions**
- Spec: §5.5/§18.1 — file-level mutex between agents
- Evidence: `advisory_locks` table exists in migrations; no `acquireLock`/`releaseLock` in core
- Fix: Implement `locks.ts` with TTL cleanup in janitor

**[A1-015] L1 hard prohibitions not enforced at write time**
- Spec: §4.1 — L1 no direct code, no file editing, no merge
- Evidence: Policy engine has `only_l1_invokes_teams`, `only_integration_worker_merges`, `no_task_bypass` but not `no_l1_code_impl` or `no_l1_file_edit`
- Fix: Add invariants; define what counts as "code impl"

**[A1-016] Workflow subsystem incomplete**
- Spec: §12/§13/§23 — thin DAG runner with 15+ step types, handoff packets, resumability, 4 promoted workflows
- Evidence: `@moabualruz/fulcrum-workflows` package may be stub; need to verify engine.ts/steps.ts/handoff
- Fix: Audit + implement missing pieces

**[A1-017] Teams subsystem not integrated with core**
- Spec: §15 — only L1 creates/invokes teams
- Evidence: `@moabualruz/fulcrum-teams` separate; no `invokeTeam` exported from core
- Fix: Facade in core

**[A1-018] Worktrees package separate from core**
- Spec: §18 — merge queue, conflict handling, sequential fallback for non-git
- Evidence: `@moabualruz/fulcrum-worktrees` separate; no core exports
- Fix: Re-export or facade

**[A1-019] Memory scope 'task' missing**
- Spec: §10.1/§10.4 — memory has global/project/file + task-linked (`task_id` FK)
- Evidence: `types.ts` `MemoryScope = 'global'|'project'|'file'` — missing task
- Fix: Add 'task' to enum + recall query support

**[A1-020] Embedding not initialized at startup**
- Spec: Fulcrum §3.4 — warm at server startup, not on first query
- Evidence: `initEmbedding` exists but no startup hook visible
- Fix: Call during `serve monitor`/`serve mcp` startup

**[A1-021] Reranker not integrated into recall**
- Spec: Fulcrum §3.4 — pipeline FTS → dense ANN → merge → bge rerank → top-k
- Evidence: `getReranker` exists; `memory.ts recallMemory` doesn't call it
- Fix: Wire reranker into recall pipeline

**[A1-022] Dedup not wired to writeMemory**
- Spec: Fulcrum §3.4 — cosine similarity >0.9 updates in place
- Evidence: `dedup.ts` in memory package; `core/memory.ts writeMemory` doesn't call it
- Fix: Call dedup in writeMemory path

**[A1-023] No weighted ranking in recall**
- Spec: §10.7 — hybrid ranking = semantic*0.4 + lexical*0.3 + recency*0.2 + confidence*0.1
- Evidence: Memory fields exist but weighted sum not implemented
- Fix: Add scoring function

**[A1-024] Stale runs still counted in WIP**
- Spec: Fulcrum §5.1 — stale runs excluded from WIP
- Evidence: `janitor.ts` marks stale; `policy.ts checkPolicy` doesn't filter
- Fix: Add `status='stale'` exclusion

**[A1-025] Cross-workspace isolation not audited**
- Spec: §21.7 — workspace boundary distinction enforced
- Evidence: Need to verify all prepared statements filter `workspace_id`
- Fix: Audit every query

### MINOR

**[A1-026] Agent profile descriptions may not match Python**
- Spec: §16.5/§24 — `listAgentProfiles` with role descriptions from pi_agents/*.md
- Fix: Audit

**[A1-027] Policy scope precedence undocumented**
- Spec: §21.2 — 6 scopes (system/user/workspace/project/team_agent/workflow_step)
- Fix: Add JSDoc + README

**[A1-028] Janitor supervisor backoff missing**
- Spec: Fulcrum §5.5 — exponential backoff (1/2/4/8/16s) up to 5 restarts
- Fix: Add supervisor wrapper

**[A1-029] No rate limiting on writeMemory**
- Fix: Optional per-workspace rate limit

**[A1-030] Display ID concurrency not verified**
- Fix: Verify SQLite atomic counter

**[A1-031] No event severity filtering in status**
- Spec: §19.9 — events have severity field
- Fix: Add severity_min parameter

**[A1-032] Missing named timeout constants**
- Fix: Create `core/constants.ts`

**[A1-033] Terse validation error messages**
- Fix: Audit error messages

**[A1-034] No getSchemaVersion export**
- Spec: §8.7 — schema versioning + migrations table
- Fix: Export from `db/client.ts`

### OUT OF SCOPE
- PI runtime not locally available (BLOCKERS B-001)
- Qdrant vs sqlite-vec (TS design decision)
- CI/CD pipeline (deferred)
- Monitor auth (local-first)
- WebSocket realtime (SSE one-way per spec §19.3)

---

## Agent 2 — Python Core Modules

Sources: `src/pi_agent_os/{tasks,runs,memory,status,policy,workflows,teams,
worker,worktrees,sync,telemetry,analytics,events,models,routing,adapters,db,
hooks,mcp,monitor}`.

### CRITICAL

**[A2-001] Task.status_category missing in Python model**
- Python: `models/task.py` no computed category
- TS: `types.ts:52` has `status_category: StatusCategory`
- NOTE: This is a reverse gap — TS is ahead of Python. Not a TS gap.

**[A2-002] AgentRun field naming: `agent_role` vs `role`**
- Python: `models/agent_run.py:35` `agent_role: str`
- TS: `types.ts:119` `role: AgentRole`
- NOTE: Naming preference. TS chose `role`. Potential consistency issue with Python schema.

**[A2-003] AgentRun missing 5 critical fields (status_category, output_summary, artifacts, git_branch, git_commit)**
- Python: `models/agent_run.py` lacks these
- TS: `types.ts:119-137` has all five
- NOTE: Reverse gap — TS is ahead.

**[A2-004] Task estimate model differs (Python: estimate; TS: estimate_type+estimate_value)**
- NOTE: TS is more structured. Not a TS gap.

**[A2-005] Task field `assigned_agent_id` (Python) vs `assigned_to` (TS)**
- NOTE: Naming preference.

**[A2-006] Memory field `last_seen_at` (Python) vs `last_accessed_at` (TS)**
- NOTE: Naming preference.

**[A2-007] Memory missing `confidence` + `access_count` in Python**
- NOTE: Reverse gap — TS has them.

**[A2-008] Memory missing `embedding` field in Python**
- NOTE: Reverse gap.

**[A2-009] Memory `content` required in TS, only `canonical_text` in Python**
- NOTE: Reverse gap.

**[A2-010] TeamInstance missing display_id/status_category/version in Python**
- NOTE: Reverse gap.

**[A2-011] Missing system invariants in Python policy engine**
- Python: only `sys_l1_team_only`
- TS: `packages/policy/src/engine.ts:22-44` has 3 invariants
- NOTE: Reverse gap — TS has MORE invariants.

**[A2-012] WorktreeStatus enum alignment**
- Fix: Verify matching values

**[A2-013] IDs module missing SUBTASK/CYCLE/MILE prefixes in TS**
- Python: `ids.py:18-39` has all 3
- TS: `packages/core/src/ids.ts:4-23` missing these
- **REAL TS GAP**

**[A2-014] Display ID generation strategy differs**
- Python: last 6 chars of ULID
- TS: auto-increment sequence table
- NOTE: Both work, different strategies. Python's is actually inferior (no human ordering).

**[A2-015] WorkerResult model not in TS types**
- Python: `models/agent_run.py:50-62`
- TS: not present
- **REAL TS GAP** (minor)

**[A2-016] Handoff model field type mismatches**
- Python: `done_criteria: list[str]`; TS: `string | undefined`
- Python: `handoff_mode: HandoffMode` enum; TS: `string`
- Fix: Tighten TS types to use enum

### IMPORTANT

**[A2-017] Config constants alignment (embedding model, collection name, migration version)**
- Fix: Verify defaults match

**[A2-018] WorkflowRunner NOT implemented in TypeScript**
- Python: `workflows/engine/runner.py` full DAG runner with retries, timeouts, state persistence
- TS: `packages/workflows/src/engine.ts` only utility functions, NO state machine
- **REAL TS GAP — LARGE**

**[A2-019] Policy matcher types alignment**
- Python: `models/policy.py:34-43` 8 MatcherType values
- Fix: Verify TS has all 8

**[A2-020] MemoryFacade 5 recall modes**
- Python: `memory/facade.py:119-176` supports compact/total_ranked/total_timeline/total_sourcemap/semantic
- TS: `packages/memory/src/recall.ts` — verify modes
- **POSSIBLE TS GAP**

**[A2-021] Worktree allocator subprocess integration**
- Python: `worktrees/allocator.py:26-90` uses `subprocess.run()` for git
- TS: need to verify git command execution
- Fix: Audit

**[A2-022] Integration worker (merge manager) not in TS**
- Python: `worktrees/integration_worker.py` full merge workflow + conflict detection + auto-fix
- TS: unknown
- **POSSIBLE TS GAP — LARGE**

**[A2-023] Telemetry/spans module not in TS**
- Python: `telemetry/spans.py` trace span creation/propagation
- TS: no equivalent
- **REAL TS GAP**

**[A2-024] Routing module completeness**
- Python: `routing/roles.py` vocabulary + L1_ROLES + constraints + PI profile mapping
- TS: `packages/teams/src/index.ts` exports L1_ROLES
- Fix: Verify role_mappings.yaml loading

**[A2-025] MCP tools completeness**
- Python: `mcp/server.py:75-200+` 13+ tools
- TS: claims 13
- Fix: Audit tool-for-tool

**[A2-026] Hooks parity (claude/gemini/pi)**
- Fix: Verify event normalization for all 3

**[A2-027] Analytics metrics completeness**
- Python: `analytics/metrics.py` burndown/cycle time/WIP/throughput/rejection/per-role
- TS: `packages/monitor/src/metrics.ts` — verify
- Fix: Audit

**[A2-028] Worker CLI adapter not in TS**
- Python: `worker/cli_chat_adapter.py` 26KB
- TS: no worker module
- **ARCH QUESTION** — does TS run the worker?

**[A2-029] PI RPC bridge not in TS**
- Python: `worker/pi_rpc_bridge.py` 31KB
- **ARCH QUESTION**

**[A2-030] Adapter system (reader/writer pattern)**
- Python: `adapters/` 12+ reader/writer adapters
- TS: no adapters package
- NOTE: TS may not need this pattern (uses direct queries)

### MINOR

**[A2-031] EventType enum count (Python: 30)**
- Fix: Verify all 30 present in TS

**[A2-032] PolicyScope enum (7 values)**
- Fix: Verify

**[A2-033] StepType enum (18 values)**
- Fix: Verify

**[A2-034] Agent role count (Python: 25+, TS: 22)**
- NOTE: Intentional naming differences

**[A2-035] ArtifactType 18 values**
- Fix: Verify

**[A2-036] Sync model fields**
- Fix: Audit

**[A2-037] Agent profile structure**
- Fix: Align PIProfile and AgentProfile

**[A2-038] Review ReviewStatus enum**
- Fix: Verify

**[A2-039] HandoffMode 4 modes**
- Fix: Verify

**[A2-040] Migration CURRENT_VERSION tracking**
- Fix: Verify TS version

### OUT OF SCOPE
- CLI chat adapter (possible Python-only worker)
- PI RPC bridge (Python-only worker)
- Qdrant vs Kuzu (architectural)
- Plane integration details
- Monitor dashboard UI

---

## Agent 3 — Monitor/MCP/CLI/Hooks/Integration

Sources: `src/pi_agent_os/{monitor,mcp,cli,hooks}`, `agent-integration/*`,
`src/pi_agent_os/pi_agents/*.md`.

### CRITICAL

**[A3-001] HTTP endpoint path prefix mismatch (read endpoints)**
- Python: `/api/v1/status`, `/api/v1/board`, `/api/v1/agents`
- TS: `/status`, `/board`, `/agents`
- NOTE: TS intentionally simplified. Could add `/api/v1` prefix for compat.

**[A3-002] HTTP control endpoint prefix mismatch**
- Python: `/api/v1/control/tasks`, `/api/v1/control/runs`
- TS: `/tasks`, `/runs`
- NOTE: Same as above.

**[A3-003] MCP server name pi-os vs fulcrum**
- NOTE: Intentional rename. Not a gap.

**[A3-004] Agent roles vocabulary (16 vs 24)**
- NOTE: TS superset, intentional.

**[A3-005] Agent profile response format divergence**
- Python: `{profile_id, role, description}`
- TS: adds `can_create_teams`, `can_dispatch_agents`
- NOTE: TS enriched. Not a gap.

**[A3-006] memory/recall project_id optionality (Python: optional, TS: required)**
- **REAL GAP** — TS should accept optional project_id falling back to workspace_id

### IMPORTANT

**[A3-007] Agent run path parameter name `:id` vs `:run_id`**
- Fix: Rename for clarity

**[A3-008] HTTP status codes (404 for missing)**
- Python: implicit 200 with `{error: ...}`
- TS: explicit 404
- NOTE: TS is more correct REST. Not a gap.

**[A3-009] CLI command surface — Python has epic/issue/board/queue/sync/team/workflow commands**
- **REAL GAP** — TS CLI is much smaller
- Fix: Port or explicitly scope out

**[A3-010] Full policy engine vs team-invoke only in TS hook**
- Python: full rule engine (DB rules + invariants + secret_guard?)
- TS: only team-invoke guard
- **REAL GAP**

**[A3-011] Hook logging parity (covered by A3-010)**

**[A3-012] settings-hooks-snippet.json (actually present in TS agent-integration/claude/)**
- NOTE: False gap — file exists.

**[A3-013] PI native tool prefix pi_os_* vs fulcrum_***
- NOTE: Intentional rename.

**[A3-014] fulcrum.extension.json controlApiBase — TS uses `http://127.0.0.1:4721` (no /api/v1/control)**
- Related to A3-001/A3-002
- Fix: Decide on path scheme, align

**[A3-015] forecast endpoint project_id parameter**
- Fix: Verify TS accepts project_id

### MINOR

**[A3-016] agent_runs column `agent_role` vs `role`**
- Python: `agent_role`
- TS: `role`
- Fix: Schema naming alignment

**[A3-017] memory-trace limit query param**
- Python: supports `?limit=50`
- TS: hardcoded
- Fix: Add query param

**[A3-018] Doc formatting consistency**
- Fix: Audit

**[A3-019] Role-specific prompt content (pi_agents/*.md) missing in TS**
- Python: `src/pi_agent_os/pi_agents/chief_of_staff.md` etc. — full role prompts
- TS: no equivalent
- **REAL GAP** — role prompts not shipped

**[A3-020] PI.md alignment**
- Fix: Minor doc differences

### OUT OF SCOPE
- Gemini hook testing
- Advanced policy engine (covered by A3-010)
- Full SQL schema alignment
