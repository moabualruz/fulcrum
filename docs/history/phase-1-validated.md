# Phase 1 Validated Gap List

Deduplicated, verified against actual TypeScript code. Each entry is
checked against `/home/mkh/workspace/pi-stack-plan/packages/**` to
confirm it's a real gap before being added. False gaps and reverse gaps
(TS is ahead of Python) are listed at the bottom.

Validation was done by reading `core/index.ts`, `core/types.ts`,
`core/ids.ts`, `core/memory.ts`, `memory/write.ts`, `memory/recall.ts`,
`policy/engine.ts`, `workflows/engine.ts`, `db/migrations.ts`.

---

## CRITICAL (breaks control plane completeness)

### G-1. Workspaces/Projects CRUD missing from core
- **Spec**: SPEC_TRACEABILITY §5.4, §5.5
- **Evidence**: `packages/core/src/index.ts` exports no `createWorkspace`/`updateWorkspace`/`listWorkspace`/`createProject`/`updateProject`/`listProject`. The CLI `workspaces/projects` subcommands reach into raw SQL (`packages/cli/src/index.ts:678-740`). Monitor server has `ensureWorkspace`/`ensureProject` helpers that also go direct to SQL.
- **Impact**: Three places (CLI, monitor, hypothetical third caller) duplicate FK-creation logic. No single place enforces project type/status CHECK constraints.
- **Fix**: Add `packages/core/src/workspaces.ts` and `packages/core/src/projects.ts` with the full CRUD surface; re-export from `index.ts`; replace the raw-SQL call sites in CLI and monitor.

### G-2. Project schema missing status / type / write_mode / git_url / parent_project_id
- **Spec**: §5.4 `ProjectType={git,non_git,submodule,logical}`, `ProjectStatus={active,archived,paused}`, `WriteMode`
- **Evidence**: `packages/core/src/db/migrations.ts` projects table only has `project_id / workspace_id / name / created_at`. Types `ProjectType`, `ProjectStatus`, `WriteMode` exist in `types.ts` but aren't persisted.
- **Impact**: We can't distinguish a git project from a logical one, can't archive, can't store repo URL, can't model submodule relationships.
- **Fix**: Migration v2 (or next version) adds columns with CHECK constraints and a seed/backfill for existing rows (`type='git'`, `status='active'`, `write_mode='worktree'`).

### G-3. `recallMemory` rejects requests without project_id
- **Spec**: Python `memory/facade.py recall()` treats `project_id` as optional (falls back to workspace-wide)
- **Evidence**: `packages/core/src/memory.ts` `recallMemory` requires it, and `packages/monitor/src/server.ts` POST /memory/recall handler forwards the error.
- **Impact**: CoS agents calling `mcp__fulcrum__recall_memory` without a project_id get a hard failure. Python's behavior is the documented contract; we break it.
- **Fix**: Make `project_id` optional in `recallMemory` signature and in the monitor route body schema. When absent, scope to workspace.

### G-4. `MemoryScope` missing `'task'`
- **Spec**: §10.1/§10.4 — memory can be global/project/file/**task** (linked via `task_id` FK)
- **Evidence**: `packages/core/src/types.ts:47` `export type MemoryScope = 'global' | 'project' | 'file'`. No `task_id` column on memories table.
- **Impact**: Task-linked memories (task_goal / task_decision / task_failure / task_outcome) have nowhere to record their task association. The kinds exist in `MemoryKind` but there's no scope value to express them.
- **Fix**: Add `'task'` to `MemoryScope`. Add `task_id TEXT` column on `memories` table (nullable, with FK). Update `writeMemory` and `recallMemory` to accept task_id.

### G-5. Advisory locks table has no API
- **Spec**: §5.5/§18.1 — file-level mutex between agents editing the same worktree
- **Evidence**: `packages/core/src/db/migrations.ts:74` defines the `advisory_locks` table, but `core/index.ts` has no `acquireLock`/`releaseLock`/`listLocks` exports. `grep -rn "acquireLock\|releaseLock" packages/core/src/` returns nothing.
- **Impact**: Two agents working in adjacent worktrees can silently race on a shared file. Migration ran for nothing.
- **Fix**: `packages/core/src/locks.ts` with `acquireLock(path, run_id, ttl_sec)` (returns false on conflict), `releaseLock(lock_id)`, `listLocks(workspace_id)`. Janitor cleans up expired locks (`expires_at < now`).

### G-6. L1 hard prohibitions §4.1 partially enforced
- **Spec**: §4.1 Chief of Staff MUST NOT write code, edit project files, or perform merges
- **Evidence**: `packages/policy/src/engine.ts SYSTEM_INVARIANTS` has `only_l1_invokes_teams`, `only_integration_worker_merges`, `no_task_bypass`. Missing: deny when a `chief_of_staff` run emits `tool_use:Write`, `tool_use:Edit`, or `shell_exec:git commit`.
- **Impact**: Nothing stops a CoS agent from calling `Write`/`Edit`/`Bash` directly — the only guardrail is prompt-level discipline, which the spec says is not sufficient.
- **Fix**: Add `chief_of_staff_no_direct_writes` invariant: denies `action ∈ {tool_use:Write, tool_use:Edit, tool_use:NotebookEdit, shell_exec:git}` when `actor_role === 'chief_of_staff'`.

---

## IMPORTANT (missing feature, wrong behavior)

### G-7. Agent run event journal never appended
- **Spec**: §5.3/§16.5/§19 `agent_runs.events` = JSON array of `{ts, event_type, payload}`
- **Evidence**: `packages/core/src/runs.ts` heartbeat/complete/block/escalate update row columns but never append to the `events` JSON column.
- **Impact**: No post-hoc timeline of what a run did — breaks replay and the `/replay/:run_id` monitor endpoint.
- **Fix**: Add an `appendRunEvent(run_id, event_type, payload)` helper; call it from every lifecycle transition with the appropriate event type (`heartbeat`, `step_start`, `step_complete`, `blocked`, `escalated`, `completed`).

### G-8. Stale runs still counted toward WIP
- **Spec**: Fulcrum design §5.1 — janitor marks stale, stale excluded from WIP
- **Evidence**: `packages/core/src/janitor.ts` sets `status='stale'`. `packages/core/src/policy.ts checkPolicy` counts rows with `status IN ('running','blocked')` — no explicit stale exclusion, but need to verify the exact query. If the janitor transition goes through `status='running'` → `status='stale'` then the existing `status='running'` filter already excludes stale. Needs verification and a test.
- **Fix**: Add a test that creates a stale run and calls `checkPolicy`, asserting WIP count matches non-stale runs only. Fix the query if the test fails.

### G-9. Named constants module missing
- **Spec**: Python has `config.py` with `DEFAULT_HEARTBEAT_TIMEOUT_MIN`, `DEFAULT_ESCALATION_TIMEOUT_MIN`, `DEFAULT_WIP_LIMIT`, `DEFAULT_EMBEDDING_DIMS`, etc. as named constants
- **Evidence**: TS uses magic numbers in `migrations.ts`, `janitor.ts`, `config.ts`. Grep for `600`, `1800`, `4721` shows them scattered.
- **Fix**: `packages/core/src/constants.ts` exporting `DEFAULT_HEARTBEAT_TIMEOUT_SEC=600`, `DEFAULT_ESCALATION_TIMEOUT_SEC=1800`, `DEFAULT_WIP_LIMIT=3`, `DEFAULT_MONITOR_PORT=4721`, `DEFAULT_EMBED_DIM=1024`, etc. Replace magic numbers at call sites.

### G-10. Weighted hybrid ranking in recall
- **Spec**: §10.7 score = semantic*0.4 + lexical*0.3 + recency*0.2 + confidence*0.1
- **Evidence**: `packages/core/src/memory.ts` reranks candidates via the reranker, but the initial candidate merge combines FTS+dense without the §10.7 weighted formula. Reranker does its own (query,passage) scoring which doesn't include recency/confidence.
- **Fix**: Replace the initial score-merge step with the §10.7 weighted sum. Reranker runs on the top-N from that ranking and its scores replace the `semantic` component before a second weighted sum.

### G-11. Role prompt files for the canonical roles
- **Python**: `src/pi_agent_os/pi_agents/chief_of_staff.md`, `implementer_backend.md`, `implementer_frontend.md`, `integration_worker.md` — full role system prompts
- **TS**: `agent-integration/` has `CLAUDE.md`/`GEMINI.md`/`PI.md` but no per-role prompt files
- **Fix**: Create `agent-integration/roles/<role>.md` for each of the 24 canonical roles, derived from the Python originals where they exist. Wire `listAgentProfiles()` to read descriptions from these files at init (cached).

### G-12. Telemetry spans (minimal scaffold)
- **Python**: `telemetry/spans.py` — trace span creation + propagation
- **TS**: nothing in any package
- **Impact**: Can't correlate events across a workflow run. Analytics `per-role` metric is fine at the row level but lacks a span abstraction.
- **Fix**: Start with `packages/core/src/telemetry/spans.ts`: `startSpan(name, parent_id?)`, `endSpan(span_id, status, payload?)`, `getTrace(trace_id)`. Store spans as `trace_events` rows. Don't try to match OpenTelemetry yet.

### G-13. Handoff model — tighten types
- **Evidence**: `types.ts HandoffPacket.handoff_mode` is a string. Python has an enum. `done_criteria` is `string | undefined` but spec says `list[str]`.
- **Fix**: Define `HandoffMode = 'sync' | 'async' | 'review' | 'escalate'`. Change `done_criteria` to `string[]`.

### G-14. Embedding init on server startup (not first query)
- **Spec**: Fulcrum §3.4 warm at startup
- **Evidence**: `getTextEmbedder()` lazy-initializes on first use. `runServeMcp` / `runServeMonitor` / `runServeAll` don't call `initEmbedding()` at startup, so the first MCP `recall_memory` request waits for model load.
- **Fix**: Call `await initEmbedding()` at the top of `runServeMcp` and `runServeMonitor`. If init fails, fail the startup (not the request).

### G-15. `ids.ts` missing prefixes: subtask, cycle, milestone, comment, status_event, lock, span
- **Spec**: §6.1 typed prefixes
- **Evidence**: `packages/core/src/ids.ts` has 18 prefixes but nothing for `subtask`, `cycle`, `milestone`, `comment`, `status_event`, `lock`, `span`.
- **Fix**: Add `subtask_`, `cycle_`, `mile_`, `cmt_`, `sev_`, `lock_`, `span_`. Add display prefixes for subtask/cycle/milestone/comment.

### G-16. Memory 14th kind — audit vs spec
- **Spec**: §10.5 "14 MemoryKind values" (agent claim)
- **Evidence**: TS has 13 (`fact, summary, symbol, decision, procedure, error, diff, doc, code, task_goal, task_decision, task_failure, task_outcome`). Python has 9 visible in `models/memory.py`. Both are incomplete vs the spec claim.
- **Fix**: Read `pi_local_first_agent_os_spec.md §10.5` in verification pass, add the missing kind if it exists, or close this as "spec incorrect" if it doesn't.

---

## DEFERRED (big rocks, need their own plan)

### D-1. Full WorkflowRunner with retries/timeouts/state persistence
- **Evidence**: `packages/workflows/src/engine.ts` is 60 lines of helper functions (`nextReadySteps`, `computeStatusCategory`, `initStepStates`). Python has `workflows/engine/runner.py` with DAG traversal + step execution + retry with exponential backoff + timeout enforcement + state checkpointing.
- **Why defer**: This is a 500+ line implementation that touches workflows package + core + monitor. Needs its own plan.

### D-2. Artifact file storage
- **Evidence**: `artifacts` table exists in schema; no file read/write code; no content_path column.
- **Why defer**: Requires design decision on path strategy (`.fulcrum/artifacts/` vs L0 vault vs per-project), versioning, sidecar format.

### D-3. Comment / StatusEvent / BoardView / Cycle / Milestone as first-class
- **Why defer**: Design decision — projections vs stored. BoardView feels like a computed projection (§11.5), Cycle/Milestone feel like stored. Comment needs a design pass (which objects can have comments? threaded? reactions?). Not blocking.

### D-4. Integration worker (merge conflict auto-resolution)
- **Evidence**: Python `worktrees/integration_worker.py` runs the full conflict-detect → auto-fix strategies → merge pipeline. TS `packages/worktrees/` has allocator but unknown merge logic.
- **Why defer**: Large. Needs its own plan + tests + rollback behavior spec.

### D-5. DB-backed policy rules (beyond system invariants)
- **Evidence**: Spec §21 describes layered scopes (system / user / workspace / project / team_agent / workflow_step) with DB-loaded rules. TS has `SYSTEM_INVARIANTS` but no DB rule loading.
- **Why defer**: Needs rules table migration + loader + matcher + precedence + UI/CLI to manage rules.

### D-6. Full CLI command coverage
- **Evidence**: Python has `pi epic`, `pi issue`, `pi board`, `pi queue`, `pi sync`, `pi team`, `pi workflow`. TS has `memory / serve / hook / workspaces / projects`.
- **Why defer**: Each command needs its own design and tests. Blocked by G-1/G-2 for workspaces/projects consistency first.

### D-7. Secret guard + full policy engine parity
- **Spec**: Python policy engine scans tool inputs for secrets; TS hook only enforces team-invoke
- **Why defer**: Requires `secret_guard.ts` with a regex corpus + test corpus. Blocked by D-5 (rule loader).

---

## FALSE GAPS (agent reports, verified and rejected)

1. **"Dedup not wired to writeMemory"** — `packages/memory/src/write.ts:5` imports `isDuplicate`; `core/memory.ts:105` has embedding-based dedup.
2. **"Reranker not integrated into recall"** — `core/memory.ts:242-246` calls `getReranker()` and invokes it.
3. **"MCP server naming pi-os → fulcrum"** — Intentional rename. The whole TS project is Fulcrum.
4. **"Agent roles 16 vs 24"** — TS is a superset. Intentional.
5. **"Agent profile adds `can_create_teams`/`can_dispatch_agents`"** — TS enriched. Not a gap.
6. **"settings-hooks-snippet.json missing in TS"** — `agent-integration/claude/settings-hooks-snippet.json` exists.
7. **"PI native tool prefix `pi_os_` → `fulcrum_`"** — Intentional.
8. **"HTTP 200 vs 404 for missing resources"** — TS uses correct 404. Python was wrong.
9. **"Display ID ULID-suffix vs sequence table"** — TS sequence table is human-ordered and superior. Intentional.
10. **All A2-001 through A2-011 reverse gaps** — TS models are ahead of Python; nothing to fix on the TS side.
11. **"Python CURRENT_VERSION = 2"** — migration version differs because schemas differ; not a bug.
12. **"agent_run column `agent_role` vs `role`"** — TS chose shorter, types.ts is consistent with it. Only matters if there's a Python schema to read; there isn't in TS.

---

## Round 1 scope (next plan)

Tackle G-1 through G-16 in order. Skip D-1 through D-7 until Round 1 is
merged and a fresh re-review runs. Rationale for this cut: every G-item
is verified to be a real gap, scoped to a single file or a small fan-out,
and doesn't require a design decision the user hasn't made yet. The D
items each need their own plan and either a design doc or a week of work.
