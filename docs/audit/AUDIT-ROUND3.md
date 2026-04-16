# Fulcrum Codebase Audit — Round 3

**Date:** 2026-04-15  
**Methodology:** 8 parallel specialized agents (code reviewer × 6, security auditor × 1, policy/architecture reviewer × 1) with full standards context across MCP spec 2025-11-25, Claude Code SKILL.md spec, A2A v0.3.0, cAST/RAG standards, TypeScript monorepo standards, and security best practices.  
**Scope:** All 11 packages + 32 SKILL.md files + monorepo architecture  

---

## Executive Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 13 |
| MAJOR    | 52 |
| MINOR    | 21 |
| Security HIGH | 3 |
| Security MEDIUM | 6 |
| Security LOW | 4 |

The codebase has strong foundations — parameterized SQL throughout, correct state machines, solid test coverage, and well-designed IoC patterns. However, three bugs silently break core functionality (all 24 built-in agent definition lookups return null, migrations skip 21 schemas on any upgraded database, an ESM `require()` crashes workflows), and the entire skill corpus carries invalid frontmatter that does not exist in the Claude Code spec.

---

## CRITICAL Issues

### CORE-001: workspace_id 'global' vs 'default' — all 24 built-in agent definitions return null
**File:** `packages/core/src/agent-definitions.ts:55,97,111,156`  
**Finding:** Migration m043 migrates all rows to `workspace_id = 'global'` and sets the column default to `'global'`. Every function in `agent-definitions.ts` defaults `workspace_id` to `'default'`. `getAgentDefinition('software_engineer')` executes `WHERE role = ? AND workspace_id = 'default'`, matches zero rows, and returns `null`. All 24 built-in role lookups silently fail on any database that has run m043.  
**Fix:** Change every function signature default from `workspace_id = 'default'` to `workspace_id = 'global'`. Introduce `const GLOBAL_WORKSPACE_ID = 'global'` used in both migration and code. Add test that calls `getAgentDefinition('software_engineer')` on a seeded DB and asserts non-null.

---

### CORE-002: `applyCoSResponse()` bypasses VALID_TRANSITIONS state machine
**File:** `packages/core/src/cos-parser.ts`  
**Finding:** `applyCoSResponse()` issues raw `UPDATE tasks SET status = ?` bypassing the `VALID_TRANSITIONS` guard in `tasks.ts`. A CoS response can transition a task from `completed → running`, `failed → claimed`, or any illegal state. `task_status_changed` events are also never fired.  
**Fix:** Replace the raw UPDATE with `updateTask({ task_id, status, workspace_id })`. If circular dep risk exists, extract `validateTransition(from, to)` to `task-transitions.ts` and call from both sites.

---

### CORE-003: Migration runner early-return permanently skips m028–m048 on upgraded databases
**File:** `packages/core/src/db/migrations/runner.ts:97–102`  
**Finding:** When any of m022–m027 returns `false` (already applied), `runMigrations()` returns immediately. Any database initialized before m022 will skip m028–m048 forever — including sparse BM25 (m047), SPLADE vectors (m048), workspace_id on agent_definitions (m043), advisory locks (m044), and 17 others.  
**Fix:** Migrate m022–m027 to use the `schema_migrations` idempotency table (same pattern as m028+) and remove all `if (!runMXXX(db)) return` early exits. The loop proceeds unconditionally; each migration self-guards.

---

### WORK-001 (planning/workflows): `require()` in ESM module — crashes at runtime
**File:** `packages/workflows/src/runner.ts:108`  
**Finding:** `loadRun()` falls back to `const { registry } = require('./registry.js')`. With `"module": "NodeNext"` and `"type": "module"`, this throws `ReferenceError: require is not defined` at runtime on the normal steps-array code path. This is the shape written by `startWorkflow()` via `initStepStates()`, so it triggers on the first production run.  
**Fix:** Replace with a top-level `import { registry } from './registry.js'` — no circular dependency exists here.

---

### WORK-002 (planning/workflows): `cancelWorkflow` skips workspace ownership check — any caller can cancel any run
**File:** `packages/workflows/src/workflows.ts:239`  
**Finding:** `cancelWorkflow` UPDATE runs with `WHERE wf_id = ?` only (no `workspace_id` filter). A caller with a `wf_id` from workspace A can cancel a run in workspace B.  
**Fix:** `UPDATE workflow_runs SET ... WHERE wf_id = ? AND workspace_id = ?`

---

### WORK-003 / SEC-003: Command injection via user-controlled `cwd` in `search_code`
**File:** `packages/workflows/src/step-executor.ts:499`  
**OWASP:** A03 – Injection / Path Traversal  
**Finding:** `cwd` from step config is passed directly as the working directory to `spawn('rg', ...)`. A workflow with `cwd: '/home/user/.ssh'` will search that directory and return file contents to workflow output.  
**Fix:**
```typescript
const resolved = path.resolve(rawCwd)
if (!resolved.startsWith(process.cwd())) {
  return { status: 'failed', error: 'search_code: cwd must be within the working directory' }
}
```

---

### MON-001: `export *` in `packages/monitor/src/index.ts`
**File:** `packages/monitor/src/index.ts:2-5`  
**Finding:** All four lines use `export *`. Violates monorepo standard. Breaks tree-shaking, leaks implementation types, contradicts the teams package (which correctly uses named exports).  
**Fix:** Replace with explicit named exports of only the public API surface.

---

### TEAM-001: `heartbeat_at` column written but not defined in schema migration
**File:** `packages/teams/src/teams.ts:275`, `packages/teams/src/schema.ts`  
**Finding:** `TeamInstanceHeartbeat` runs `UPDATE team_instances SET heartbeat_at = ?` on a timer, but `heartbeat_at` does not exist in the `MIGRATION_006_TEAMS` DDL. This UPDATE silently fails (or throws on `PRAGMA strict = ON`).  
**Fix:** Add `heartbeat_at TEXT` column to `team_instances` CREATE TABLE in `schema.ts`. Add `heartbeat_at: row['heartbeat_at'] ?? undefined` to `rowToInstance` and `TeamInstance` type.

---

### MEM-001: `rrfScore` silently drops the `sparseRank` parameter — 3-signal RRF never fires
**File:** `packages/memory/src/scoring.ts:39–48`  
**Finding:** `rrfScore` accepts `sparseRank` as the third parameter but the body returns only `fts + vec`. The sparse signal is accepted and discarded. `recallScore` delegates to `rrfScore`, so every non-rescue document is scored on 2 signals, not 3.  
**Fix:** Either implement 3-signal: `return fts + vec + (sparseRank !== null ? 1 / (k + sparseRank) : 0)`, or remove the dead parameter and rename honestly. Update `recallScore` to pass through `sparseRank`.

---

### MEM-002: Zero-embedding vector hardcoded to 1024 dimensions regardless of `client.dims`
**File:** `packages/memory/src/kuzu/upsert.ts:52`  
**Finding:** `embedding: embeddingArray ?? new Array(1024).fill(0)`. If the client was created with `embeddingDimensions: 256`, every upserted node with null embedding has 1024 floats where the schema expects 256 — corrupts HNSW index or causes runtime error.  
**Fix:** Make `KuzuClient.dims` public readonly; use `new Array(client.dims).fill(0)`.

---

### SKILL-001: All 32 SKILL.md files contain invalid frontmatter fields
**File:** `agent-integration/skills/*/SKILL.md` (every file)  
**Standard:** Claude Code SKILL.md spec — only `name`, `description`, `allowed-tools`, `disable-model-invocation`, `argument-hint` are valid fields.  
**Finding:** Every skill carries `user-invocable`, `version`, `author` (all 32 files). 18 files also have `triggers:` blocks. `start-every-task` has `input:` and `output:` multi-line blocks. These fields do not exist in the spec. They may be silently ignored or cause parse failures.  
**Fix:** Strip all invalid fields from all 32 files. Fold `triggers:` content into the `description` string (the LLM classifier). Move `version`/`author` to a markdown comment if desired for humans.

---

### ARCH-001: No TypeScript project references anywhere in the monorepo
**File:** All `packages/*/tsconfig.json` (11 packages) + missing root tsconfig  
**Finding:** Every `tsconfig.json` is missing `composite`, `incremental`, `declaration`, `declarationMap`. No root `tsconfig.json` exists. `tsc --build` does nothing. Cross-package type checking is unreliable. Go-to-definition in consumers navigates to compiled `.d.ts` instead of source.  
**Fix:** Add to every package tsconfig:
```json
"composite": true,
"incremental": true,
"declaration": true,
"declarationMap": true
```
Create root `/tsconfig.json`:
```json
{
  "files": [],
  "references": [
    {"path": "./packages/core"},
    {"path": "./packages/memory"},
    {"path": "./packages/policy"},
    {"path": "./packages/planning"},
    {"path": "./packages/teams"},
    {"path": "./packages/worker"},
    {"path": "./packages/monitor"},
    {"path": "./packages/sync"},
    {"path": "./packages/workflows"},
    {"path": "./packages/worktrees"},
    {"path": "./packages/cli"}
  ]
}
```

---

### POL-001: ReDoS vulnerability in policy engine
**File:** `packages/policy/src/engine.ts:137`  
**OWASP:** A07 – Identification/Authentication Failures  
**Finding:** `new RegExp(pattern).test(input.action)` executes DB-stored regex without length or complexity constraints. An attacker with DB write access (or any agent that can `createPolicyRule`) can store `(a+)+$` and cause exponential CPU consumption on every policy evaluation.  
**Fix:** Validate regex patterns at `createPolicyRule` time: reject patterns >256 chars, validate parsability, consider a linear-time regex library for execution.

---

## MAJOR Issues

### Architecture & Build

**ARCH-002: `@moabualruz/fulcrum-cli` tsconfig missing `outDir`, `dist` not in exclude**  
File: `packages/cli/tsconfig.json`  
Fix: Add `"outDir": "./dist"`, add `"dist"` to exclude. Update `bin` to `./dist/index.js`.

**ARCH-003: `@moabualruz/fulcrum-core` lists `@moabualruz/fulcrum-teams` as devDependency — circular dep at test time**  
File: `packages/core/package.json:39`  
Fix: Remove `@moabualruz/fulcrum-teams` from core's devDependencies. Core tests should mock `TeamOps`, not import the concrete implementation.

**ARCH-004 (all packages): No `engines` field in any package.json**  
Fix: Add `"engines": {"node": ">=20"}` to all package.json files.

**SYNC-004: `export *` in `packages/sync/src/index.ts`**  
File: `packages/sync/src/index.ts:1-6`  
Fix: Replace all 6 wildcard exports with explicit named re-exports.

**PLAN-001: `export *` in `packages/planning/src/index.ts:2`**  
File: `packages/planning/src/index.ts:2`  
Fix: Replace with explicit `export type { ... } from './types.js'`.

**CORE-008: Wildcard barrel export in `packages/core/src/index.ts`**  
File: `packages/core/src/index.ts:115`  
Fix: `export { CONSTANT_NAME_1, ... } from './constants.js'`

---

### packages/core

**CORE-004: `listTasks()` has no LIMIT — unbounded query**  
File: `packages/core/src/tasks.ts:91–131`  
Fix: Add `limit = 500, offset = 0` to `ListTasksInput`. Apply `LIMIT ? OFFSET ?`.

**CORE-005: `captureGitContext()` calls `execSync()` twice — blocks event loop**  
File: `packages/core/src/runs.ts:143–152`  
Fix: Replace with promisified `exec` or `execa`.

**CORE-009: Event bus silently discards all handler errors**  
File: `packages/core/src/event-bus.ts:118–129`  
Fix: At minimum write to `process.stderr`. Expose an `onError` callback.

---

### packages/memory

**MEM-004: L2 recall path ignores all input filters (scope, kind, file_path, project_id, etc.)**  
File: `packages/memory/src/recall.ts:153–199`  
Fix: Pass filter criteria into `L2QueryInput` and apply them in Cypher query, or post-filter SQLite rows from the `IN(...)` lookup.

**MEM-005: L2 recall path skips cross-encoder reranker**  
File: `packages/memory/src/recall.ts:153–199`  
Fix: Extract reranker block to shared helper; call from both L2 and L1 paths before returning.

**MEM-006: `recall_score` is always `undefined` for L2 results**  
File: `packages/memory/src/recall.ts:193`  
Fix: Map `pagedResults` (which has `.score`) to pass the score to `rowToCompact(row, r.score)`.

**MEM-007: Inconsistent freshness half-life between L1 (90d) and L2 (30d) paths**  
File: `packages/memory/src/scoring.ts:26`, `packages/memory/src/kuzu/query.ts:28–29`  
Fix: Delete `recency` in `query.ts`. Import and use `computeFreshness` from `scoring.ts`.

**MEM-008: `insertMemoryDirect` (rebuild path) does not store `sparse_vector`**  
File: `packages/memory/src/write.ts:182–210`  
Fix: Compute `computeSparseVector(memory.canonical_text ?? '')` and include in INSERT.

**MEM-009: `EntityType` duplicated across two modules**  
File: `packages/memory/src/extractors/structured.ts`, `packages/memory/src/kuzu/entity-store.ts`  
Fix: Move `EntityType` to `types.ts`; import from one place.

**MEM-010: Operator precedence bug in `inferType`**  
File: `packages/memory/src/kuzu/entity-store.ts:39`  
`startsWith('file_') || mention.includes('/') && mention.endsWith('.ts')` — `&&` binds tighter. Only `.ts` paths are detected as files.  
Fix: `if (mention.startsWith('file_') || (mention.includes('/') && /\.\w+$/.test(mention)))`

**MEM-011: API key written to plaintext config file**  
File: `packages/memory/src/setup/wizard.ts:117`  
Fix: Accept key from env (`OPENAI_API_KEY`) as priority; store sentinel `"env"` instead of raw key. Warn user.

**MEM-012: Cypher edge type via string interpolation without enforcement at call site**  
File: `packages/memory/src/extractors/pipeline.ts:96`  
Fix: Define `const EDGE_QUERY_MAP: Record<ValidEdgeType, string>` and assert membership before interpolation.

---

### packages/planning & packages/workflows

**PLAN-002: Both tsconfig.json files missing `composite` and `incremental`**  
File: `packages/planning/tsconfig.json`, `packages/workflows/tsconfig.json`  
Fix: Add both flags.

**PLAN-003: Missing `blocking_task_id` field on `Issue` — blocked issues carry no traceability**  
File: `packages/planning/src/types.ts:36`  
Fix: Add `blocking_issue_id: string | null` to `Issue`, `UpdateIssueInput`, and DB migration.

**PLAN-004: No cycle detection in `addTaskRelation`**  
File: `packages/planning/src/relations.ts:38`  
Fix: Reachability check via recursive CTE before INSERT: traverse `task_relations` from `target_task_id` and reject if `task_id` found.

**PLAN-005: `updateIssue` allows all status transitions — state machine not enforced**  
File: `packages/planning/src/issues.ts:94`  
Fix: Add `ALLOWED_TRANSITIONS` map. Same gap in `updateEpic`.

**WORK-004: `WorkflowStepDef` retry policy missing `backoffMultiplier`, `initialDelayMs`, `maxDelayMs`**  
File: `packages/workflows/src/types.ts:12`  
Fix: Add `retryPolicy?: { maxAttempts, backoffMultiplier?, initialDelayMs?, maxDelayMs? }`.

**WORK-005: Steps blob dual-format schema divergence — `startWorkflow` writes array, `runner` writes `{states, defs}`**  
File: `packages/workflows/src/workflows.ts:81`, `packages/workflows/src/runner.ts:141`  
Fix: Normalize to `{states, defs}` from `startWorkflow` creation. Remove dual-format branch in `loadRun`.

**WORK-006: `write_artifact` display_id uses non-atomic `COUNT(*)+1`**  
File: `packages/workflows/src/step-executor.ts:129`  
Fix: Use `nextDisplayId('artifact', ctx.project_id, db)` from `@moabualruz/fulcrum-core`.

**WORK-007: `search_web` returns `status: 'completed'` on HTTP errors — failed search looks like empty results**  
File: `packages/workflows/src/step-executor.ts:464-481`  
Fix: HTTP errors should return `{ status: 'failed', error: ... }` so retry policy applies.

**WORK-008: Attempts counter is off-by-one — `max_retries=2` runs handler only twice**  
File: `packages/workflows/src/runner.ts:270`  
Fix: Rename to `max_attempts`, increment before calling handler, check `state.attempts >= maxAttempts`.

**WORK-010: `epics.ts` emits `evt_type: 'task_status_changed'` instead of `epic_status_changed`**  
File: `packages/planning/src/epics.ts:88`, `packages/planning/src/prds.ts:91`  
Fix: Correct event types.

**PLAN-008: `createReview` throws if `project_id` absent but type marks it optional**  
File: `packages/planning/src/reviews.ts:23`  
Fix: Make `project_id: string` required in `CreateReviewInput`.

---

### packages/cli & agent-integration/skills

**CLI-001: `statSync` instead of `lstatSync` — `isSymbolicLink()` always returns false**  
File: `packages/cli/src/index.ts:2136–2137`  
Fix: Replace `statSync(targetLink)` with `lstatSync(targetLink)`.

**CLI-002: Session ID used unsanitized as filesystem path component — path traversal risk**  
File: `packages/cli/src/index.ts:308–311`  
Fix: `sessionId = sessionId.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 128)` immediately after reading from stdin.

**CLI-003: Two separate `handleToolCall` implementations (stdio vs HTTP) with diverging behavior**  
File: `packages/cli/src/index.ts` (line ~650 vs ~1041)  
`heartbeat_agent_run` and `complete_agent_run` have different field names and drop `artifact_paths` in HTTP path.  
Fix: Extract `buildHandleToolCall(deps)` factory; use in both transports.

**CLI-004: `doctor.ts` has a redundant local `getGlobalDataDir()` that duplicates the imported `globalDataDir()` from core**  
File: `packages/cli/src/doctor.ts:34–41`  
Fix: Delete local function; call `globalDataDir()` from core consistently.

**CLI-005: MCP resource `fulcrum://{workspace_id}/task/{task_id}` fetches 1000 tasks for a point lookup**  
File: `packages/cli/src/mcp-server.ts:376–387`  
Fix: Add a `get_task` MCP tool that queries `SELECT * FROM tasks WHERE task_id = ?`.

**CLI-006: HTTP MCP session management has TOCTOU race on new sessions**  
File: `packages/cli/src/mcp-server.ts:606–641`  
Fix: Index session in map synchronously before response is sent, or use transport's `onsessioninitialized` callback.

**SKILL-002: `start-every-task/SKILL.md` has extra `input:` and `output:` YAML blocks**  
File: `agent-integration/skills/start-every-task/SKILL.md:12–26`  
Fix: Remove both blocks.

**CLI-012: `runSessionStartHook` hardcodes `role: 'software_engineer'` for all agent runs**  
File: `packages/cli/src/index.ts:354–358`  
Fix: Read role from `FULCRUM_AGENT_ROLE` env var with `software_engineer` as fallback.

---

### packages/sync & packages/worker

**SYNC-001: No HTTP timeout on any Plane API call**  
File: `packages/sync/src/plane/client.ts:8,26,39`  
Fix: Add `signal: AbortSignal.timeout(10_000)` for reads, `30_000` for writes.

**SYNC-002: No retry logic for transient errors (429/5xx) and no Retry-After header handling**  
File: `packages/sync/src/plane/client.ts`  
Fix: Wrap each fetch in exponential backoff loop (max 3 attempts), parse `Retry-After`.

**SYNC-005: `syncAll` has no max-retry cap — failed items retry forever, no DLQ**  
File: `packages/sync/src/sync-manager.ts:325–407`  
Fix: After `MAX_QUEUE_ATTEMPTS = 3` failures, move to DLQ table, set `sync_status = 'failed'` permanently.

**SYNC-007: Conflict auto-resolution sets `resolution = 'local_wins'` before operator sees it — invisible in `listConflicts(unresolved_only=true)`**  
File: `packages/sync/src/sync-manager.ts:201–232`  
Fix: Do not auto-populate `resolution` at detection time. Leave `resolution = NULL` so it appears in unresolved listings. Let `resolveConflict` apply it.

**SYNC-008: `canonicalHash` only sorts top-level keys — nested objects produce non-deterministic hashes**  
File: `packages/sync/src/sync-manager.ts:34–41`  
Fix: Deep-sort replacer in `JSON.stringify`. Remove duplicate in `adapter.ts`.

**SYNC-009: `resolveConflict` with `local_wins` enqueues without `local_data` — always fails in `syncAll`**  
File: `packages/sync/src/sync-manager.ts:459–465`  
Fix: Add `local_data?: Record<string, unknown>` to `ResolveConflictInput`. Pass it to INSERT into `sync_queue`.

**WORK-003 (worker): No SIGTERM handler — no graceful shutdown**  
File: `packages/worker/src/lifecycle.ts`  
Fix: Register `SIGTERM`/`SIGINT` handlers that drain in-flight promises and call `blockAgentRun` for any still-running.

**WORK-004 (worker): No concurrency control on `spawnAgent`**  
File: `packages/worker/src/lifecycle.ts:51`  
Fix: Add semaphore from `FULCRUM_WORKER_MAX_CONCURRENCY` (default 4).

**WORK-005 (worker): No timeout on subprocess adapter**  
File: `packages/worker/src/subprocess.ts:31`  
Fix: `timeout: parseInt(process.env['FULCRUM_SUBPROCESS_TIMEOUT_MS'] ?? '300000', 10)` in `execFileAsync`.

**WORK-006 (worker): No timeout on claude-code adapter**  
File: `packages/worker/src/adapters/claude-code.ts:156–201`  
Fix: `setTimeout(() => proc.kill('SIGTERM'), timeoutMs)` with cleanup on close.

**WORK-007 (worker): `dispatchClaudeCode` leaks temp prompt files**  
File: `packages/worker/src/adapters/claude-code.ts:81–121`  
Fix: Schedule cleanup via `setTimeout` (10 min delay), or write prompt to stdin instead of file.

**WORK-008 (worker): No runtime validation of `SpawnAgentInput`**  
File: `packages/worker/src/lifecycle.ts:51`  
Fix: Guard on `workspace_id`, `task_id`, `caller_role`, `target_role` before proceeding.

**WORK-002 (worker): Path traversal via unsanitized `run_id` in file paths**  
File: `packages/worker/src/stub.ts:18`, `packages/worker/src/adapters/claude-code.ts:83,139`  
Fix: `if (!/^[\w\-]+$/.test(run_id)) throw new FulcrumError(...)` at top of `spawnAgent()`.

---

### packages/teams & packages/monitor

**TEAM-002: Both tsconfig.json files missing `composite` and `incremental`**  
File: `packages/teams/tsconfig.json`, `packages/monitor/tsconfig.json`  

**MON-004: Most read endpoints have no authentication**  
File: `packages/monitor/src/server.ts:114–499`  
Fix: Apply `auth` middleware globally; exempt only `/status` and `/.well-known/agent.json`.

**MON-005: Date parameters accepted without format validation**  
File: `packages/monitor/src/server.ts:126–147`  
Fix: Validate `/^\d{4}-\d{2}-\d{2}$/` before use. Return 400 on invalid.

**MON-006: Token comparison edge case with multi-byte UTF-8 and TOCTOU on token file read**  
File: `packages/monitor/src/server.ts:53–55`  
Fix: After reading token from disk, validate it is a 64-character hex string. Use `try { readFileSync } catch { create }` instead of `existsSync + readFileSync`.

**MON-007: `/events/stream` SSE endpoint is unauthenticated and leaks all workspace events**  
File: `packages/monitor/src/server.ts:149–208`  
Fix: Apply `auth` middleware. Fix `!ws` branch to return 400 instead of falling back to unscoped events.

**TEAM-003: `canStartTeam` interpolates SQL string literal instead of inline constant**  
File: `packages/teams/src/scheduler.ts:12`  
Fix: Replace `IN (${ACTIVE_STATUSES})` with literal `IN ('created','ready','spawning','running','waiting')`.

**MON-008: `getTeamStatus` does not null-check `templateRow`**  
File: `packages/teams/src/teams.ts:215–217`  
Fix: Add `if (!templateRow) throw new FulcrumError(...)` after template fetch.

**MON-009: `POST /policy/check` role parsing via `split('/')` is fragile — defaults to "allow" on unexpected format**  
File: `packages/monitor/src/server.ts:768–771`  
Fix: Validate `actor_id` format; if unexpected, deny rather than allow.

**MON-010: `completeTeam` categorizes `failed` as `blocked` — semantically incorrect**  
File: `packages/teams/src/teams.ts:143`  
Fix: Use `'done'` for all terminal states; distinguish by `status` field.

---

### packages/policy

**POL-002: `capability_required_for_action` ignores the injected `db` parameter**  
File: `packages/policy/src/engine.ts:62`  
Fix: Pass `db` into the capability check closure instead of calling `getDb()` directly.

**POL-003: `getAuditLog` has no default upper limit — unbounded table scan**  
File: `packages/policy/src/audit.ts:46`  
Fix: Default `limit = 100` in query function.

**POL-004: Secret detection misses opaque bearer tokens**  
Fix: Add pattern: `/\bAuthorization\s*:\s*Bearer\s+[A-Za-z0-9\-_+/]{20,}/gi`

**POL-005: OpenAI key pattern misses modern `sk-proj-...` format**  
File: `packages/policy/src/secret-guard.ts:17`  
Fix: `regex: /sk-(?:proj-)?[A-Za-z0-9_\-]{20,}/g`

---

## Security Findings

### [HIGH] SEC-001: All read endpoints unauthenticated on monitor server
See MON-004 above. Any local process can retrieve memory content, task descriptions, policy audit logs, and sync state without credentials.

### [HIGH] SEC-002: `FULCRUM_CLAUDE_BIN` env var allows arbitrary binary execution
**File:** `packages/worker/src/adapters/claude-code.ts:21–29`  
**Fix:** Validate override path is absolute and executable via `accessSync(path, constants.X_OK)`.

### [HIGH] SEC-003: `cwd` path traversal in `search_code`
See WORK-003 above.

### [MEDIUM] SEC-004: Tavily API key transmitted in HTTP request body (not header)
**Fix:** Use `Authorization: Bearer` header.

### [MEDIUM] SEC-005: Plane API error response body logged directly to Error.message — may contain internal API details
**Fix:** Log body to stderr only; store only status code in `last_sync_error`.

### [MEDIUM] SEC-006: `checkSecrets()` not called on memory write path
**File:** `packages/monitor/src/server.ts:664–692`, `packages/memory/src/write.ts`  
**Fix:** Call `checkSecrets(content)` in `POST /memory/write` handler before `writeMemory()`.

### [MEDIUM] SEC-007: `branch_name` and `base_branch` passed as git arguments without leading-dash guard
**File:** `packages/worktrees/src/worktrees.ts:155–158`  
**Fix:** Use `--` separator: `execFileSync('git', ['worktree', 'add', path, '-b', branch_name, '--', base_branch])`

### [MEDIUM] SEC-008: `encodeFilePath()` does not validate input for null bytes
**File:** `packages/memory/src/vault/client.ts:113–116`  
**Fix:** Apply `assertSafePathSegment` to encoded file path segments.

### [LOW] SEC-009 to SEC-012
- Session ID entropy not validated before DB use
- `ingestProject()` no depth limit — can walk entire filesystem
- Token directory created without restrictive mode (`0o700`)
- Subprocess binary path split on whitespace breaks quoted args

---

## MINOR Issues

**CORE-010:** Remote embedding providers don't normalize output vectors to unit norm.  
**CORE-012:** `require('sqlite-vec')` CJS interop in ESM module.  
**CORE-013:** m042 uses `sqlite_master` as idempotency guard instead of `schema_migrations`.  
**CORE-014:** `memory-insert.ts` omits `content_type` from INSERT (relies on `DEFAULT 'text'`).  
**CORE-015:** `console.error` in `janitor.ts` — inconsistent with rest of package using `process.stderr.write`.  
**CORE-006:** Most async functions in core do no actual async work — misleading API contract.  
**MEM-013:** Chunking measured in characters not tokens; prose overlap ~10 tokens, target is 50.  
**MEM-014:** `rrfFuse` uses O(n) `Array.find` inside scored loop — O(n²). Use Map.  
**MEM-015:** `package.json` `main`/`types` point at source `.ts` not built `dist/`.  
**MEM-016:** Default embedding model is Qwen3-Embedding-0.6B; voyage-code-3 provides +13.8% recall for code.  
**PLAN-006:** `rowToTask` in `relations.ts` duplicates core helper.  
**PLAN-007:** `listIssues` / `listPlans` / `listPRDs` have no pagination.  
**WORK-009:** Workflow registry `register()` silently overwrites existing definitions.  
**WORK-011:** `withTimeout` leaves original promise unresolved in background without cancellation.  
**WORK-012:** `evaluate_policy` handler has confusing double-await pattern.  
**CLI-007:** `outputRows`/`outputObject` close over module-level `args` — not unit-testable.  
**CLI-009:** `HookOutput.continue` interface mismatch with actual Claude Code hook protocol.  
**CLI-011:** Plugin hook modules loaded via dynamic import with no type contract or error surface.  
**SYNC-010:** `getSyncState`/`listConflicts` declared async but purely synchronous.  
**SYNC-012:** No index on `sync_queue(sync_id)` — JOIN is a full table scan.  
**SYNC-013:** API key serialized into cache key string `_cachedConfig` — leaks if logged.  
**TEAM-004:** `require('ulidx')` CJS call in ESM test file.  
**MON-011:** A2A Agent Card missing `stateTransitionHistory` in capabilities.  
**MON-012:** `/analytics/forecast` `horizon_days` not validated — NaN accepted.  
**MON-014:** `/policy/events` hardcodes `LIMIT 50` with no pagination.  
**MON-015:** `rollupDaily` uses `project_id: input.project_id ?? ''` — empty string collides.  
**MON-016:** `/replay/:run_id` re-implements `replayRun` logic inline instead of calling the function.  
**POL-006:** `ulidx` phantom dependency in several packages (listed but never imported).  
**POL-007:** `ulidx` version inconsistency: `^2.0.0` in teams/workflows vs `^2.3.0` elsewhere.  
**POL-008:** All policy functions declared async but contain no `await`.  
**POL-009:** `secret_content` policy matcher enforcement contract is invisible to callers.  
**POL-010:** OpenAI/`api_key` double-match produces duplicate `SecretMatch` entries.  
**SKILL-003:** 18 skills with `triggers:` frontmatter lose trigger documentation when field is removed — must be migrated to `description`.

---

## What's Done Well

- **Parameterized SQL is universal.** Every SQL query across all packages uses `?` placeholders with bound parameters. Zero string-interpolated SQL values found. This completely eliminates SQL injection.
- **`VALID_TRANSITIONS` state machine** is clean, explicit, and correct (when not bypassed — see CORE-002).
- **`listTasks()` batch hydration** (2 queries instead of 2×N) correctly eliminates the N+1 pattern.
- **IoC pattern for `@moabualruz/fulcrum-teams`** (`setTeamOps`/`getTeamOps`) correctly breaks the circular dependency without dynamic import hacks.
- **Promise coalescing in `warmUp()`** (both `local.ts` and `reranker.ts`) prevents concurrent model loading races.
- **`withTransaction()` uses `.immediate()` write-lock** — correct for SQLite under concurrent writers.
- **`FulcrumError` typed-error pattern** with `code` discriminant gives callers clean error classification.
- **`timingSafeEqual` in monitor auth** prevents timing-based token enumeration.
- **`randomBytes(32).toString('hex')` token** — 256 bits of entropy.
- **`execFile`/`spawn` with array arguments** everywhere subprocess is used — no shell injection possible.
- **`assertSafePathSegment`** validates `workspace_id`, `memory_id`, `project_id`, `task_id` before vault FS use.
- **`checkSecrets()` in sync push path** covers both single-object and batch paths.
- **Pre-hook logs only tool input keys, never values** — no credential leakage in tool traces.
- **MCP HTTP server validates `Origin` header** — DNS rebinding protection.
- **`run_script` uses hardcoded allowlist** `['run_tests', 'lint', 'typecheck', 'build']` — prevents arbitrary npm script execution.
- **NEVER_SYNC set** prevents Memory, PolicyRule, AgentRun, Event from reaching external systems.
- **L0 write-first ordering** in `writeMemory` — vault is canonical record.
- **Superseded-memory filtering** via `UPDATES` edge correctly suppresses stale memories.

---

## Priority Fix Order

1. **CORE-001, CORE-003** — silent data breakage affecting all agent definition lookups and 21 migrations
2. **WORK-001** — crashes production workflow execution
3. **SEC-001, MON-007** — unauthenticated data exposure
4. **ARCH-001** — TypeScript project references (enables all incremental builds)
5. **SKILL-001** — all 32 skills carry invalid frontmatter
6. **CORE-002** — state machine bypass
7. **SYNC-001, SYNC-002, SYNC-009** — sync reliability
8. **WORK-002, WORK-003** — security: authorization bypass, path traversal
9. **MEM-001, MEM-002, MEM-004, MEM-005, MEM-006** — RAG recall correctness
10. **POL-001** — ReDoS in policy engine
11. **All PLAN-***, WORK-0[04-08]** — planning/workflow correctness
12. **Remaining MAJOR issues**
13. **MINOR issues**
