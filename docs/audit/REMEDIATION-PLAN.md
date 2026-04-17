# Fulcrum Remediation Plan

**Generated:** 2026-04-15  
**Source:** AUDIT-2026-04-15.md (4 passes: standards research, code audit, security audit, performance/data model audit)  
**Correctness/architecture pass:** In progress — plan will be updated when complete  

---

## Overview

40 identified issues across 4 audit passes. Organized into 5 phases by blast radius and dependency order. Each phase leaves the system in a coherent, deployable state. No phase starts until the previous phase's checkpoint passes.

**Phase structure:**
- **Phase 1 — Security Blockers (P0):** 5 tasks. Prevent data exfil, path traversal, memory poisoning. Must fix before any production use.
- **Phase 2 — Runtime Correctness (P0):** 8 tasks. Fix broken features that silently fail. Policy engine, SSE, memory split-brain, FK enforcement.
- **Phase 3 — Data Model Integrity (P1):** 7 tasks. Schema correctness, missing indexes, state machines, dual representations.
- **Phase 4 — Capability Gaps (P1):** 6 tasks. Hybrid search, semantic extractor, agent dispatch, eval harness, embedding providers.
- **Phase 5 — Architecture (P2):** 5 tasks. Migration splitting, TeamOps interface, A2A cards, run_events table, freshness model.

---

## Architecture Decisions

1. **`core/src/memory.ts` is deleted.** `fulcrum-core` owns types; `fulcrum-memory` owns all memory I/O. No exceptions. `runs.ts` gets a lightweight direct INSERT for task_outcome writes.

2. **All IDs used in file paths are validated at the vault boundary.** ULID-safe regex `[a-zA-Z0-9_\-]{1,128}` enforced in `getMemoryFilePath` before any `path.join()` call.

3. **Monitor auth uses a shared secret generated at vault init**, stored in `~/.fulcrum/token`. Required (Bearer) on all mutating endpoints. Read endpoints (GET) remain open for dashboard. `crypto.timingSafeEqual` for all comparisons.

4. **Policy enforcement flows through `evaluatePolicy()` end-to-end.** The HTTP endpoint wires to the real engine. Agent identity comes from DB lookup on `run_id`, not caller-supplied `actor_id`.

5. **`global` query_scope is removed from the recall API.** Cross-workspace queries are never permitted from the recall surface. If needed in future, they require explicit admin scope with full audit trail.

6. **Hybrid search = BM25 + sqlite-vec + RRF fusion.** Both retrievers run in parallel, results fused with RRF. Cross-encoder reranking is opt-in. This is the minimum baseline for code RAG in 2025.

---

## Phase 1 — Security Blockers

*All tasks in this phase are parallelizable.*

---

### Task 1.1: Path Traversal Guard in Vault `getMemoryFilePath`
**Size:** S — 1 file  
**Description:** Every ID used as a path segment in vault file construction must be validated against a strict allowlist before entering `path.join()`. Craft a single `assertSafePathSegment` function and call it on `workspace_id`, `project_id`, `task_id`, and `memory_id` at the top of `getMemoryFilePath`.

**File:** `packages/memory/src/vault/client.ts`

**Acceptance criteria:**
- [ ] `getMemoryFilePath` with `workspace_id: "../../../../.ssh"` throws `FulcrumError('Invalid ID for path use', 'invalid_input')`
- [ ] Valid ULIDs like `01HV...` pass the guard without throwing
- [ ] IDs with spaces, slashes, dots, or null bytes are rejected
- [ ] All existing vault tests continue to pass

**Verification:**
```bash
pnpm --filter fulcrum-memory test
```

**Dependencies:** None

---

### Task 1.2: Remove `query_scope: 'global'` from Recall API
**Size:** S — 2 files  
**Description:** The `global` scope in `buildWhereClause` applies no WHERE clause, enabling cross-workspace memory exfiltration. Remove the `global` case entirely. Update the MCP tool schema (`mcp-tools.ts`) to remove `global` from the allowed enum. Update the Zod schema in `recall.ts`. Add a test that `global` scope returns a validation error.

**Files:** `packages/memory/src/recall.ts`, `packages/cli/src/mcp-tools.ts`

**Acceptance criteria:**
- [ ] `recallMemory({ query_scope: 'global', ... })` throws `FulcrumError` with code `invalid_input`
- [ ] MCP tool schema no longer lists `global` as a valid `query_scope` value
- [ ] Existing workspace/project/file scope recall tests still pass

**Verification:**
```bash
pnpm --filter fulcrum-memory test
pnpm --filter fulcrum-cli test
```

**Dependencies:** None

---

### Task 1.3: Bearer Token Auth on Monitor Mutating Endpoints
**Size:** M — 2 files  
**Description:** Generate a 32-byte random token on first startup using `crypto.randomBytes(32).toString('hex')`. Store it in `globalDataDir()/token`. On subsequent starts, read it from there. Apply a Hono middleware that requires `Authorization: Bearer <token>` on all POST/PATCH routes. Use `crypto.timingSafeEqual` for comparison. GET endpoints remain open for dashboard. Expose the token path in `fulcrum doctor` output.

**Files:** `packages/monitor/src/server.ts`, `packages/cli/src/doctor.ts`

**Acceptance criteria:**
- [ ] `POST /memory/write` without auth header returns HTTP 401
- [ ] `POST /memory/write` with correct bearer token returns HTTP 200
- [ ] `GET /tasks` without auth header returns HTTP 200 (read-only, no auth required)
- [ ] Token is generated and persisted on first start
- [ ] Token is loaded from disk on subsequent starts (same token, not regenerated)
- [ ] `fulcrum doctor` outputs the token file path

**Verification:**
```bash
pnpm --filter fulcrum-monitor test
```

**Dependencies:** None

---

### Task 1.4: CORS Restriction to Localhost Origin
**Size:** XS — 1 file  
**Description:** Add Hono CORS middleware restricted to `http://localhost:4721` and `http://127.0.0.1:4721`. This eliminates browser-based CSRF from any page the user visits while the monitor is running.

**File:** `packages/monitor/src/server.ts`

**Acceptance criteria:**
- [ ] Browser request from any non-localhost origin receives CORS rejection headers
- [ ] Dashboard requests from `http://localhost:4721` work correctly
- [ ] CORS preflight (`OPTIONS`) requests return correct headers

**Dependencies:** None

---

### Task 1.5: Vault Directory and File Permission Hardening
**Size:** XS — 1 file  
**Description:** All vault directories must be created with mode `0o700`. All vault `.md` files must be written with mode `0o600`. Worker temp prompt files must also use mode `0o600`.

**Files:** `packages/memory/src/vault/client.ts`, `packages/worker/src/adapters/claude-code.ts`

**Acceptance criteria:**
- [ ] Vault root directory created with permissions `0o700`
- [ ] Memory `.md` files written with permissions `0o600`
- [ ] Temp prompt files in `/tmp/fulcrum-claude-code/` written with `0o600`

**Dependencies:** None

---

### Checkpoint 1: Security Blockers Complete
```
- [ ] pnpm test (all packages pass)
- [ ] pnpm build (clean build)
- [ ] Manual: verify vault write with traversal ID is rejected
- [ ] Manual: verify POST /memory/write without token returns 401
- [ ] Manual: verify recall with global scope returns error
```

---

## Phase 2 — Runtime Correctness

*Tasks 2.1–2.4 are parallelizable. Tasks 2.5–2.8 depend on 2.1.*

---

### Task 2.1: Wire `/policy/check` to Real Policy Engine
**Size:** S — 1 file  
**Description:** The `/policy/check` HTTP endpoint currently bypasses `evaluatePolicy()` entirely. Replace the hardcoded stub with a real call to `evaluatePolicy` from `fulcrum-policy`. Include `logPolicyEvent` call for audit trail. Also implement run_id → role DB lookup: when `start_agent_run` creates a run, store `(run_id, workspace_id, role)`. The `/policy/check` endpoint looks up the authoritative role from DB using the run_id extracted from the bearer token or `X-Run-Id` header, rather than trusting caller-supplied `actor_id`.

**Files:** `packages/monitor/src/server.ts`, `packages/core/src/runs.ts`

**Acceptance criteria:**
- [ ] `POST /policy/check` with a valid `software_engineer` run_id and `action: invoke_team` returns `{ allowed: false }`
- [ ] `POST /policy/check` with a valid `chief_of_staff` run_id and `action: invoke_team` returns `{ allowed: true }`
- [ ] Policy event is logged to `policy_events` table on every check
- [ ] Caller-supplied `actor_id` is ignored; authoritative role comes from DB
- [ ] `packages/policy` integration test passes

**Verification:**
```bash
pnpm --filter fulcrum-policy test
pnpm --filter fulcrum-monitor test
```

**Dependencies:** None

---

### Task 2.2: Fix SSE Stream Column Names (`evt_id`, `evt_type`)
**Size:** XS — 1 file  
**Description:** The SSE poller queries non-existent columns `event_id` and `event_type`. Fix all SSE queries to use `evt_id` (TEXT ULID) as cursor and `evt_type` for type filtering. Use `rowid` as the numeric cursor for `evt_id > ?` comparisons (ULIDs are lexicographically comparable, but rowid is simpler). Also fix the same column name bug in `metrics.ts:139` where `event_type` should be `evt_type` (breaking memory recall metric counts).

**Files:** `packages/monitor/src/server.ts`, `packages/monitor/src/metrics.ts`

**Acceptance criteria:**
- [ ] SSE stream delivers events to connected clients without SQLITE_ERROR
- [ ] After writing a task, the SSE stream delivers the corresponding event within 2s
- [ ] `rollupDaily` reports non-zero `memory_recall_count` after recall operations
- [ ] Monitor SSE test passes

**Verification:**
```bash
pnpm --filter fulcrum-monitor test
```

**Dependencies:** None

---

### Task 2.3: Delete `core/src/memory.ts` — Single Memory Authority
**Size:** M — 3 files  
**Description:** Delete `packages/core/src/memory.ts` entirely. Update `packages/core/src/index.ts` to remove the re-exports. Update `packages/core/src/runs.ts` to replace its `safeWriteMemory` call with a direct lightweight SQLite INSERT for `task_outcome` memories (bypassing the full L0/L1 pipeline since this is an internal lifecycle event, not user-contributed memory). The insert should still use content-hash dedup via SHA-256.

**Files:** `packages/core/src/memory.ts` (DELETE), `packages/core/src/index.ts`, `packages/core/src/runs.ts`

**Acceptance criteria:**
- [ ] `packages/core/src/memory.ts` no longer exists
- [ ] `fulcrum-core` exports no `recallMemory` or `writeMemory` functions
- [ ] `runs.ts:completeAgentRun` still writes a `task_outcome` memory to SQLite
- [ ] The task_outcome write uses content-hash dedup
- [ ] All core tests pass

**Verification:**
```bash
pnpm --filter fulcrum-core test
pnpm build
```

**Dependencies:** None (can parallel with 2.1, 2.2)

---

### Task 2.4: Fix Broken Memory MCP Resource (`query: ''`)
**Size:** XS — 1 file  
**Description:** The MCP resource `fulcrum://{workspace_id}/memory/{project_id}` calls `recall_memory` with `query: ''`, which always throws `FulcrumError('query must not be empty')`. Replace with a direct SQL SELECT for the 20 most recently written memories (ordered by `created_at DESC`), bypassing the recall pipeline entirely. This is correct behavior for a resource read — it should show recent state, not search results.

**File:** `packages/cli/src/mcp-server.ts`

**Acceptance criteria:**
- [ ] Fetching the `memory` MCP resource returns the 20 most recent memories without error
- [ ] Resource returns JSON-serialized compact memory objects
- [ ] MCP server test for resource reads passes

**Verification:**
```bash
pnpm --filter fulcrum-cli test
```

**Dependencies:** 2.3 (removes the broken recall path this currently tries to call)

---

### Task 2.5: Fix HTTP MCP Transport — Session-Per-Client Not Per-Request
**Size:** M — 1 file  
**Description:** The HTTP MCP transport currently creates a new `McpServer` instance on every HTTP request, destroying all session state. Implement a session map keyed by the session ID from the `Mcp-Session-Id` header. On first request for a session, create and connect a new `McpServer`. On subsequent requests with the same session ID, reuse the existing instance. Evict sessions after 30 minutes of inactivity.

**File:** `packages/cli/src/mcp-server.ts`

**Acceptance criteria:**
- [ ] Two requests with the same session ID reuse the same `McpServer` instance
- [ ] Sessions are cleaned up after 30 minutes of inactivity
- [ ] A new session ID creates a new server instance
- [ ] MCP server HTTP test passes

**Verification:**
```bash
pnpm --filter fulcrum-cli test
```

**Dependencies:** None

---

### Task 2.6: Enable `PRAGMA foreign_keys = ON`
**Size:** XS — 1 file  
**Description:** Add `PRAGMA foreign_keys = ON` to the `_configureDb` function in `packages/core/src/db/client.ts`. This activates all the `ON DELETE CASCADE` constraints already declared in the schema. Verify by running the cascade tests and ensuring workspace deletion correctly removes orphan rows.

**File:** `packages/core/src/db/client.ts`

**Acceptance criteria:**
- [ ] Deleting a workspace cascades to delete all tasks, runs, memories, events, handoffs
- [ ] Deleting a task cascades to delete its `task_labels` and `task_relations` rows
- [ ] All existing tests still pass with FK enforcement active
- [ ] Add a test: create workspace + children, delete workspace, verify children are gone

**Verification:**
```bash
pnpm --filter fulcrum-core test
```

**Dependencies:** None

---

### Task 2.7: Fix L2 Recall — Workspace Filter + Result Ordering
**Size:** S — 1 file  
**Description:** Two bugs in `packages/memory/src/recall.ts` L2 path: (1) The SQLite fetch after Kuzu returns IDs has no workspace filter — add `AND m.workspace_id = ?`. (2) The result ordering from Kuzu is discarded — after the SQLite fetch, reorder rows to match the Kuzu score ordering by building a Map keyed on `memory_id` and mapping back to the Kuzu-ordered ID list.

**File:** `packages/memory/src/recall.ts`

**Acceptance criteria:**
- [ ] L2 recall never returns memories from a different workspace than the caller's
- [ ] Results returned by L2 recall maintain the Kuzu score ordering
- [ ] `recall-scope.test.ts` passes with L2 path active

**Verification:**
```bash
pnpm --filter fulcrum-memory test
```

**Dependencies:** None

---

### Task 2.8: Fix `session_id` Column Reference — Add Column or Remove Scope
**Size:** XS — 2 files  
**Description:** `buildWhereClause` references `m.session_id` which does not exist in the `memories` table. Either: (a) add a migration adding `session_id TEXT` column to `memories` with an index, or (b) remove the `session` scope from `buildWhereClause` and from the MCP tool schema until it is properly implemented. Option (b) is safer and faster; option (a) is the full fix. Implement option (a): add the migration, add the index, remove the silent fallback.

**Files:** `packages/memory/src/recall.ts`, `packages/core/src/db/migrations.ts`

**Acceptance criteria:**
- [ ] `recallMemory({ query_scope: 'session', session_id: 'sess_123', ... })` executes without SQLITE_ERROR
- [ ] Migration adds `session_id TEXT` column to `memories` with index `idx_memories_session`
- [ ] Existing recall tests pass

**Verification:**
```bash
pnpm --filter fulcrum-memory test
pnpm --filter fulcrum-core test
```

**Dependencies:** None

---

### Checkpoint 2: Runtime Correctness Complete
```
- [ ] pnpm test (all packages pass)
- [ ] pnpm build (clean build)
- [ ] Manual: SSE stream delivers events on task creation
- [ ] Manual: POST /policy/check with software_engineer role blocks invoke_team
- [ ] Manual: Deleting a workspace removes all child entities
- [ ] Manual: MCP memory resource returns recent memories without error
```

---

## Phase 3 — Data Model Integrity

*All tasks in this phase are parallelizable after Phase 2.*

---

### Task 3.1: Add All Missing Composite Indexes
**Size:** S — 1 file  
**Description:** Add the 12 missing indexes identified in the performance audit. All are additive `CREATE INDEX IF NOT EXISTS` statements that do not require table recreation.

**File:** `packages/core/src/db/migrations.ts` (new migration entry)

Missing indexes to add:
```sql
idx_projects_workspace        ON projects(workspace_id)
idx_tasks_ws_status           ON tasks(workspace_id, status)
idx_tasks_ws_category         ON tasks(workspace_id, status_category)
idx_tasks_assigned_run        ON tasks(assigned_run_id)
idx_runs_ws_status            ON agent_runs(workspace_id, status)
idx_memories_task             ON memories(task_id)
idx_memories_ws_project_hash  ON memories(workspace_id, project_id, content_hash)
idx_events_ws_ts              ON events(workspace_id, ts DESC)
idx_events_ws_type            ON events(workspace_id, evt_type)
idx_chunks_ws_project         ON code_chunks(workspace_id, project_id)
idx_handoffs_ws_status        ON handoffs(workspace_id, status)
idx_issues_assignee           ON issues(assignee_agent_id)
```

**Acceptance criteria:**
- [ ] All 12 indexes exist after migration
- [ ] Migration is idempotent (`IF NOT EXISTS`)
- [ ] Migration test passes

**Verification:**
```bash
pnpm --filter fulcrum-core test
```

**Dependencies:** Phase 2 checkpoint

---

### Task 3.2: Task State Machine — Valid Transition Guard
**Size:** S — 2 files  
**Description:** `updateTask` currently accepts any status transition. Add a `VALID_TRANSITIONS` map to `tasks.ts`. `completed` and `cancelled` are terminal. Add a `reopen` action to move terminal tasks back to `queued` explicitly. The guard should be a `validateTransition(from, to)` function that throws `FulcrumError` on illegal moves.

**Files:** `packages/core/src/tasks.ts`, `packages/core/src/tests/tasks.test.ts`

**Acceptance criteria:**
- [ ] `updateTask` with `status: 'queued'` on a `completed` task throws `FulcrumError('invalid_transition')`
- [ ] `updateTask` with `action: 'reopen'` on a `completed` task succeeds
- [ ] All valid transitions (queued→in_progress, in_progress→completed, etc.) work correctly
- [ ] State machine tests cover all transition combinations

**Verification:**
```bash
pnpm --filter fulcrum-core test
```

**Dependencies:** Phase 2 checkpoint

---

### Task 3.3: Remove `tasks.depends_on` JSON — Use `task_relations` Exclusively
**Size:** M — 3 files  
**Description:** `tasks.depends_on` (JSON array) and `task_relations` (relational table) are dual representations of the same data. The JSON column prevents indexed dependency queries. Remove `depends_on` from the `Task` type, update `updateTask` to stop writing to it, add a migration to drop the column (requires table recreation in SQLite), and update `hydrateTask` to only use `task_relations` for dependency data.

**Files:** `packages/core/src/tasks.ts`, `packages/core/src/types.ts`, `packages/core/src/db/migrations.ts`

**Acceptance criteria:**
- [ ] `Task` type has no `depends_on` field
- [ ] `task_relations` is the single source for dependency relationships
- [ ] `createTask` with a `blockedBy` list creates correct `task_relations` rows
- [ ] All task tests pass

**Verification:**
```bash
pnpm --filter fulcrum-core test
```

**Dependencies:** 3.1

---

### Task 3.4: Fix Timestamp Format Inconsistency
**Size:** S — 2 files  
**Description:** SQLite DDL defaults use `datetime('now')` (space format); application code uses `new Date().toISOString()` (T format). Standardize on `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')` for all `DEFAULT` expressions in migrations. This produces ISO 8601 T-format from SQLite, matching the application's `toISOString()` output. Add a migration that doesn't change data but documents the standard.

**Files:** `packages/core/src/db/migrations.ts`, `packages/core/src/tests/db.test.ts`

**Acceptance criteria:**
- [ ] New rows created via SQLite DDL defaults use T-format timestamps
- [ ] Application-side `toISOString()` timestamps sort correctly alongside DDL-default timestamps
- [ ] No existing tests break

**Dependencies:** Phase 2 checkpoint

---

### Task 3.5: Fix `plans.ts` Wrong Event Type
**Size:** XS — 2 files  
**Description:** `plans.ts` emits `evt_type: 'task_status_changed'` for plan status changes. Add `plan_status_changed` to the `EventType` union in `core/src/events.ts` and update `plans.ts` to use it.

**Files:** `packages/core/src/events.ts`, `packages/planning/src/plans.ts`

**Acceptance criteria:**
- [ ] Plan status change events have `evt_type: 'plan_status_changed'`
- [ ] `EventType` union includes `'plan_status_changed'`
- [ ] CoS context builder handles plan events without misattributing to task queue

**Dependencies:** Phase 2 checkpoint

---

### Task 3.6: Fix `completeHandoff` Status Guard
**Size:** XS — 1 file  
**Description:** `completeHandoff` has no guard against completing already-completed or cancelled handoffs. Add `if (existing.status !== 'claimed') throw new FulcrumError(...)` before the UPDATE. Mirror the same guard pattern from `claimHandoff`.

**File:** `packages/core/src/handoffs.ts`

**Acceptance criteria:**
- [ ] `completeHandoff` on a `cancelled` handoff throws `FulcrumError`
- [ ] `completeHandoff` on an already `completed` handoff throws `FulcrumError`
- [ ] `completeHandoff` on a `claimed` handoff succeeds
- [ ] Handoff lifecycle test covers all guard cases

**Verification:**
```bash
pnpm --filter fulcrum-core test
```

**Dependencies:** Phase 2 checkpoint

---

### Task 3.7: Fix Workspace-Scope Agent Definitions
**Size:** S — 2 files  
**Description:** `agent_definitions` table enforces uniqueness on `role` globally. Add `workspace_id` column, change unique constraint to `(workspace_id, role)`, add migration, update all queries in `agent-definitions.ts` to include `workspace_id`.

**Files:** `packages/core/src/agent-definitions.ts`, `packages/core/src/db/migrations.ts`

**Acceptance criteria:**
- [ ] Two workspaces can register `software_engineer` with different configs
- [ ] `createAgentDefinition` in workspace A does not conflict with workspace B's same role
- [ ] `getAgentDefinition` requires `workspace_id` parameter
- [ ] Migration adds column and updates unique constraint

**Verification:**
```bash
pnpm --filter fulcrum-core test
```

**Dependencies:** Phase 2 checkpoint

---

### Checkpoint 3: Data Model Integrity Complete
```
- [ ] pnpm test (all packages pass)
- [ ] pnpm build (clean build)
- [ ] Manual: task state machine rejects invalid transitions
- [ ] Manual: two workspaces can register same role independently
- [ ] Manual: listTasks with status filter uses composite index (EXPLAIN QUERY PLAN)
```

---

## Phase 4 — Capability Gaps

*Tasks 4.1 and 4.2 are parallelizable. 4.3 depends on 4.1. 4.4–4.6 are independent.*

---

### Task 4.1: Implement voyage-code-3 and OpenAI Embedding Providers
**Size:** M — 2 files  
**Description:** The embedding registry silently returns `null` for 6 of 7 providers. Implement `VoyageEmbeddingProvider` (voyage-code-3, Matryoshka 2048→1024) and `OpenAIEmbeddingProvider` (text-embedding-3-large). Add provider validation: unknown provider throws `Error` instead of silently degrading. Add Anthropic key pattern to secret guard.

**Files:** `packages/core/src/embedding/registry.ts`, `packages/core/src/embedding/local.ts` (add voyage + openai providers), `packages/policy/src/secret-guard.ts`

**Acceptance criteria:**
- [ ] `provider: 'voyage'` with valid API key embeds text and returns `Float32Array`
- [ ] `provider: 'openai'` with valid API key embeds text and returns `Float32Array`
- [ ] `provider: 'unknown_provider'` throws `Error` at registry init time
- [ ] Secret guard catches `sk-ant-api03-...` Anthropic keys
- [ ] Secret guard catches `sk-...` OpenAI keys (48-char variant)
- [ ] Embedding tests pass with both provider mocks

**Verification:**
```bash
pnpm --filter fulcrum-core test
pnpm --filter fulcrum-policy test
```

**Dependencies:** Phase 3 checkpoint

---

### Task 4.2: Hybrid Search — BM25 + sqlite-vec + RRF Fusion
**Size:** M — 2 files  
**Description:** The current recall pipeline runs BM25 *or* vector search. Replace with parallel execution of both, followed by Reciprocal Rank Fusion. The RRF formula: `score(d) = Σ 1/(k + rank(d))` where `k=60`. This is the 2025 baseline for code RAG. Also remove the `total_timeline` and `total_sourcemap` fallback modes that use `LIKE '%query%'` (full table scans — undocumented performance cliff).

**Files:** `packages/memory/src/recall.ts`, `packages/memory/src/scoring.ts`

**Acceptance criteria:**
- [ ] Recall always runs both FTS5 and vector search concurrently
- [ ] Results are fused with RRF before scoring/reranking
- [ ] `total_timeline` and `total_sourcemap` modes removed (or converted to proper queries)
- [ ] Recall@5 on eval fixtures ≥ 0.7 (up from baseline)
- [ ] Recall tests pass

**Verification:**
```bash
pnpm --filter fulcrum-memory test
```

**Dependencies:** Phase 3 checkpoint

---

### Task 4.3: Fix `agent_runs.events` — Separate `run_events` Table
**Size:** M — 3 files  
**Description:** `agent_runs.events` is a JSON blob that grows O(N) per heartbeat. Create a `run_events(id, run_id, ts, event_type, payload TEXT)` table with `idx_run_events_run ON run_events(run_id, ts)`. Migrate existing JSON events to the new table. Update `appendRunEvent` and `getRunHistory` to use the table. Each heartbeat becomes a single INSERT instead of a full JSON rewrite.

**Files:** `packages/core/src/runs.ts`, `packages/core/src/db/migrations.ts`, `packages/core/src/types.ts`

**Acceptance criteria:**
- [ ] `heartbeatAgentRun` fires a single INSERT, not a read-modify-write
- [ ] `getRunHistory` returns events ordered by `ts ASC`
- [ ] Migration backfills existing run event blobs to the new table
- [ ] After migration, `agent_runs.events` column is unused (can be dropped in a follow-up)
- [ ] Run tests pass

**Verification:**
```bash
pnpm --filter fulcrum-core test
```

**Dependencies:** Phase 3 checkpoint, after 4.1/4.2 (to not conflict on migrations)

---

### Task 4.4: Implement Semantic Extractor
**Size:** L — 3 files  
**Description:** `packages/memory/src/extractors/semantic.ts` returns `[]` permanently. Implement LLM-backed entity and relationship extraction. Given a chunk of text/code, call the configured LLM (via a minimal Anthropic SDK call) to extract: entities (names, types, descriptions) and relationships (subject, predicate, object). The extractor should be retryable, have a timeout, and gracefully return `[]` on LLM failure (not throw). Populate Kuzu graph with semantic edges.

**Files:** `packages/memory/src/extractors/semantic.ts`, `packages/memory/src/extractors/pipeline.ts`, `packages/memory/src/kuzu/upsert.ts`

**Acceptance criteria:**
- [ ] Extractor returns at least 1 entity for a non-trivial code chunk
- [ ] Extractor returns `[]` (not throws) on LLM API failure
- [ ] Extracted entities are upserted to Kuzu graph
- [ ] Pipeline test passes with mock LLM responses
- [ ] Extraction is gated: only runs when LLM provider is configured

**Verification:**
```bash
pnpm --filter fulcrum-memory test
```

**Dependencies:** Phase 3 checkpoint

---

### Task 4.5: Agent Dispatch — Wire Worker Adapter to `start_agent_run`
**Size:** L — 4 files  
**Description:** The worker adapter exists but nothing invokes it. When `start_agent_run` MCP tool is called and the run has no waiting agent (i.e., no `FULCRUM_RUN_ID` env var is set on the caller), dispatch the task by spawning a Claude Code subprocess via `worker/src/adapters/claude-code.ts`. Include task context, model selection, and run_id injection. The run_id is the identity token the spawned agent uses for all subsequent API calls.

**Files:** `packages/cli/src/mcp-tools.ts`, `packages/worker/src/adapters/claude-code.ts`, `packages/worker/src/index.ts` (new), `packages/core/src/runs.ts`

**Acceptance criteria:**
- [ ] `start_agent_run` with `dispatch: true` spawns a Claude Code subprocess
- [ ] The subprocess receives `FULCRUM_RUN_ID` env var
- [ ] The subprocess writes a prompt file with task context
- [ ] `start_agent_run` with `dispatch: false` (or no `dispatch` field) behaves as before (passive tracking)
- [ ] Worker adapter test passes

**Verification:**
```bash
pnpm --filter fulcrum-worker test
pnpm --filter fulcrum-cli test
```

**Dependencies:** Phase 3 checkpoint, 2.1 (policy enforcement must work before dispatch)

---

### Task 4.6: Fix Eval Harness — Baseline Storage + Runner + Paraphrastic Fixtures
**Size:** M — 4 files  
**Description:** The eval harness measures the right metrics but is never run and cannot detect regressions. Add: (1) `eval/runner.ts` that inserts fixtures, runs recall for all query cases, computes metrics, compares against stored baseline, and fails if Recall@5 drops by >5%. (2) A stored baseline file (`eval/baseline.json`). (3) 10 paraphrastic query-document pairs where exact keyword matching fails but semantic similarity succeeds. (4) Add NDCG@5 to the metrics. (5) CI integration as a Vitest test.

**Files:** `packages/memory/src/eval/runner.ts` (new), `packages/memory/src/eval/baseline.json` (new), `packages/memory/src/eval/queries.ts`, `packages/memory/src/eval/metrics.ts`

**Acceptance criteria:**
- [ ] `pnpm --filter fulcrum-memory test` runs the eval harness as a Vitest test
- [ ] Eval fails if Recall@5 drops >5% below baseline
- [ ] NDCG@5 is computed and reported
- [ ] At least 10 paraphrastic query-document pairs exist (semantic match, no keyword overlap)
- [ ] Baseline is stored and updated via `UPDATE_BASELINE=1 pnpm test`

**Verification:**
```bash
pnpm --filter fulcrum-memory test
```

**Dependencies:** 4.2 (hybrid search improves recall quality before setting baseline)

---

### Checkpoint 4: Capability Gaps Closed
```
- [ ] pnpm test (all packages pass)
- [ ] Eval harness Recall@5 ≥ 0.7 on semantic fixtures
- [ ] POST /policy/check blocks L2 agents from team invocation
- [ ] Heartbeat writes single INSERT (verify with EXPLAIN)
- [ ] start_agent_run with dispatch:true spawns subprocess
```

---

## Phase 5 — Architecture

*All tasks are independent. Execute in any order after Phase 4.*

---

### Task 5.1: `TeamOps` Interface — Kill `@ts-ignore`
**Size:** S — 3 files  
**Description:** `core/src/index.ts` exports `getTeamOps()` returning `Record<string, unknown>` with a `@ts-ignore`. Define a `TeamOps` interface in `core/src/team-ops.ts` (types only, zero imports). Update `getTeamOps()` to return `Promise<TeamOps>`. Have `fulcrum-teams` implement it at registration. Remove the `@ts-ignore`.

**Files:** `packages/core/src/team-ops.ts` (new), `packages/core/src/index.ts`, `packages/teams/src/index.ts`

**Acceptance criteria:**
- [ ] `getTeamOps()` returns `Promise<TeamOps>` with full TypeScript types
- [ ] No `@ts-ignore` or `as unknown as` in the teams integration path
- [ ] `teams.test.ts` still passes

---

### Task 5.2: Remove Dead SQLite Shadow Graph Tables
**Size:** XS — 1 file  
**Description:** MIGRATION_011 creates `graph_entities` and `graph_edges` SQLite tables as a shadow of the Kuzu graph. Application code never reads or writes these tables. Remove them via a migration that drops them. Update any tests that reference them.

**File:** `packages/core/src/db/migrations.ts`

**Acceptance criteria:**
- [ ] `graph_entities` and `graph_edges` tables do not exist after migration
- [ ] No application code references these tables
- [ ] DB tests pass

---

### Task 5.3: `memories.freshness` — Compute at Query Time, Not Store
**Size:** S — 3 files  
**Description:** `memories.freshness` is a stored static snapshot that never decays. `computeFreshness()` in `scoring.ts` is dead code. Remove the `freshness` column write from `write.ts`. Compute freshness at score time in `scoring.ts` from `updated_at`. Update the janitor to decay `importance` (already done) but remove any freshness decay path. Remove `freshness` from the `Memory` type's persisted fields (keep it as a computed field on the recall response).

**Files:** `packages/memory/src/write.ts`, `packages/memory/src/scoring.ts`, `packages/memory/src/types.ts`

**Acceptance criteria:**
- [ ] `freshness` is not written to the DB on memory creation
- [ ] `freshness` in recall results is computed from `updated_at` at query time
- [ ] 91-day-old memory with high relevance score still surfaces in recall (soft decay, not hard gate)
- [ ] `computeFreshness` is called during scoring, not imported nowhere

---

### Task 5.4: Split Monolithic Migrations File
**Size:** M — 12 files  
**Description:** All 31+ migrations are in a single TypeScript string constant. Split into `packages/core/src/db/migrations/001_initial.ts`, `002_*.ts`, etc. The migration runner reads them in order. This enables per-migration review, easier conflict resolution, and per-migration rollback in testing.

**Files:** `packages/core/src/db/migrations.ts` → `packages/core/src/db/migrations/` (directory)

**Acceptance criteria:**
- [ ] Each migration is in its own file with a descriptive name
- [ ] Migration runner applies them in order by filename
- [ ] All existing tests pass with the new structure
- [ ] New migrations can be added by creating a new numbered file

---

### Task 5.5: Generate A2A Agent Cards
**Size:** M — 3 files  
**Description:** Implement `GET /.well-known/agent.json` in the monitor server. Generate Agent Cards from registered agent definitions (per the A2A v1.0 spec at a2a-protocol.org). Include: name, description, capabilities, skill descriptions with input/output modes, service URL, auth scheme (bearer). This makes Fulcrum agents discoverable by any A2A-compatible orchestrator.

**Files:** `packages/monitor/src/server.ts`, `packages/core/src/agent-definitions.ts`, `packages/monitor/src/schema.ts`

**Acceptance criteria:**
- [ ] `GET /.well-known/agent.json` returns a valid A2A Agent Card JSON
- [ ] Agent card includes all registered agent definitions as skills
- [ ] Response validates against the A2A v1.0 Agent Card JSON schema
- [ ] No auth required for GET /.well-known/agent.json (it is public discovery)

---

### Checkpoint 5: Architecture Complete
```
- [ ] pnpm test (all packages pass)
- [ ] pnpm build (clean, no @ts-ignore)
- [ ] GET /.well-known/agent.json returns valid A2A card
- [ ] Freshness in recall results varies with memory age
```

---

## Risk and Conflict Register

| Risk | Impact | Mitigation |
|---|---|---|
| Migration 3.3 (drop `depends_on`) breaks data with unmirrored deps | High | Run analysis query before migration: `SELECT COUNT(*) FROM tasks WHERE depends_on != '[]'`. Migrate to task_relations first. |
| Task 4.5 (agent dispatch) spawns real Claude Code processes in tests | Medium | Gate dispatch behind `FULCRUM_DISPATCH=1` env var; default off in tests |
| Semantic extractor (4.4) makes network calls — breaks offline tests | Medium | Mock `AnthropicClient` in tests; check `process.env.ANTHROPIC_API_KEY` before running |
| Phase 2 PR is large (8 tasks) | Medium | Ship as 3 PRs: security (2.1–2.4), transport (2.5), schema (2.6–2.8) |
| Task 4.3 (run_events migration) may be slow on large existing DBs | Low | Apply migration in a transaction; document estimated time for large DBs |

---

## Open Questions (Require Human Decision)

1. **`query_scope: 'global'` — remove entirely or make admin-only?** The current plan removes it. If cross-workspace queries are needed for CoS operations, we need an explicit admin capability system first.

2. **`start_agent_run dispatch: true` — opt-in or default?** Current plan: opt-in (`dispatch: false` by default). If we make it default, the system becomes actively orchestrating, which changes the operational model significantly.

3. **Embedding model priority — voyage-code-3 vs. local?** voyage-code-3 requires an API key and network call. For local/offline setups, should we fall back to the local ONNX model when voyage is not configured, or require explicit opt-in for the local model?

4. **Memory quota defaults** — what is the right per-workspace memory limit? The plan implements the mechanic but the default value needs a decision.

5. **A2A agent cards (Task 5.5) — should they expose internal workspace topology?** The Agent Card may reveal workspace/project structure to external orchestrators. Is this acceptable?

---

## Parallelization Guide

The following tasks can run in parallel agents:

**Phase 1 (all parallel):** 1.1, 1.2, 1.3, 1.4, 1.5

**Phase 2 (two groups):**
- Group A (parallel): 2.1, 2.2, 2.3, 2.5, 2.6, 2.7, 2.8
- Group B (after 2.3): 2.4

**Phase 3 (all parallel after Phase 2):** 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7

**Phase 4 (two groups):**
- Group A (parallel): 4.1, 4.2, 4.4
- Group B (after 4.1/4.2): 4.3, 4.5, 4.6

**Phase 5 (all parallel after Phase 4):** 5.1, 5.2, 5.3, 5.4, 5.5

---

## Addendum — Tasks Added from Pass 3 (Correctness/Architecture)

These tasks were not in the initial plan. Insert them into the phases below.

---

### Task 2.9: Fix TOCTOU Race in `acquireLock` [Add to Phase 2]
**Size:** XS — 1 file  
**File:** `packages/core/src/locks.ts`

Wrap `DELETE expired + SELECT + INSERT` in a single `db.transaction()`. Add test: two concurrent calls to `acquireLock` on the same resource — only one should succeed.

**Acceptance criteria:**
- [ ] Concurrent `acquireLock` calls on the same key — exactly one succeeds, one throws
- [ ] `releaseLock` validates caller is owner (add run_id to WHERE predicate)

---

### Task 2.10: Terminal State Guards on Run Lifecycle [Add to Phase 2]
**Size:** S — 1 file  
**File:** `packages/core/src/runs.ts`

Extract `assertRunIsLive(run_id, db)` helper. Apply to `completeAgentRun`, `blockAgentRun`, `heartbeatAgentRun`. Add `'stale'` to `BLOCKED_STATUSES` in `status-category.ts`.

**Acceptance criteria:**
- [ ] `completeAgentRun` on a `finished` run throws `FulcrumError('invalid_state', ...)`
- [ ] `heartbeatAgentRun` on a `finished` run throws `FulcrumError('invalid_state', ...)`
- [ ] Stale runs appear as `blocked` in status category (not `active`)
- [ ] Workspace with 10 stale runs shows 0 active agents in `buildWorldState`

---

### Task 2.11: Fix `cos-parser.ts` Degraded Memory Write [Add to Phase 2 / parallel with 2.3]
**Size:** XS — 1 file  
**File:** `packages/core/src/cos-parser.ts:3`

Change import from `./memory.js` to `fulcrum-memory`. Identical fix to `runs.ts`. Both can be done in the same PR as Task 2.3.

---

### Task 3.8: Atomic Label Writes in `createTask` / `updateTask` [Add to Phase 3]
**Size:** S — 1 file  
**File:** `packages/core/src/tasks.ts`

Wrap task INSERT + label INSERTs in `db.transaction()` in `createTask`. Wrap task UPDATE + label DELETE + label INSERTs in `db.transaction()` in `updateTask`.

**Acceptance criteria:**
- [ ] Process kill between label DELETE and INSERT leaves task with original labels (rolled back)
- [ ] No torn read possible between label delete and re-insert

---

### Task 3.9: Fix EventType Union — Add `plan_status_changed` + `issue_status_changed` [Add to Phase 3 / merge with 3.5]
**Size:** XS — 3 files  
**Files:** `packages/core/src/events.ts`, `packages/planning/src/plans.ts`, `packages/planning/src/issues.ts`

Add both event types to `EventType` union. Update `plans.ts:93` and `issues.ts:119` to emit correct types. Merge with Task 3.5.

---

### Task 3.10: Fix `cos-context.ts` LIKE Injection [Add to Phase 3]
**Size:** XS — 1 file  
**File:** `packages/core/src/cos-context.ts:80`

Escape `%` and `_` before LIKE interpolation. Add ESCAPE clause.

---

### Task 3.11: N+1 Fix in `listIssues` [Add to Phase 3 / parallel with M-3 fix]
**Size:** S — 1 file  
**File:** `packages/planning/src/issues.ts:142`

Same batch-query fix as `listTasks`.

---

### Task 4.7: DAG Cycle Detection in Workflow Engine [Add to Phase 4]
**Size:** S — 1 file  
**File:** `packages/workflows/src/engine.ts`

DFS cycle detection at workflow creation. Throw `FulcrumError('invalid_input', 'cycle detected: ...')` with cycle path in message.

---

### Task 4.8: Fix Worktree Filesystem Cleanup [Add to Phase 4]
**Size:** XS — 1 file  
**File:** `packages/worktrees/src/worktrees.ts`

Call `git worktree remove --force <path>` before DB row delete. Wrap in try/catch. Add test: abandoned worktree cleanup removes both DB row AND filesystem path.

---

### Task 4.9: Fix Kuzu Zero-Vector Fallback [Add to Phase 4, after 4.1]
**Size:** XS — 1 file  
**File:** `packages/memory/src/kuzu/upsert.ts:52`

Read embedding dimension from configured provider at init time. Fail loudly (throw) when embedding is null rather than inserting zero-vector. Remove silent `.catch(() => {})` wrapper.

