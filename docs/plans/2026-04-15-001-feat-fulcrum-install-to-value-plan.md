---
title: "feat: Fulcrum Install-to-Value — 7 UX Features"
type: feat
status: completed
date: 2026-04-15
deepened: 2026-04-15
origin: docs/brainstorms/2026-04-15-fulcrum-ux-requirements.md
---

# feat: Fulcrum Install-to-Value — 7 UX Features

## Overview

Seven targeted improvements to the Fulcrum install-to-value path. Two root causes drive all of them: (1) the dominant user path (install → Claude → real work) produces zero Fulcrum state changes because the PreToolUse hook writes nothing without a `run_id`; (2) `pnpm install && pnpm run setup` is a 3-minute native-build process with no "done" indicator. The context7 model (`npx context7-mcp`, one JSON line) is the UX target.

Codebase research revised several requirements doc assumptions:
- `completeAgentRun` **already** calls `writeLifecycleMemory` internally — Feature 3 adds the `source` field, not new write logic
- `kuzu` imports in `packages/memory/src/kuzu/client.ts` are **already lazy** (`await import('kuzu')`) — Feature 2's `optionalDependencies` move is straightforward
- `gen:claude-md` script **already exists** — Feature 4 updates it, not greenfields it
- `fulcrum doctor --json` is **already implemented**
- `TOOL_SCHEMAS` has **27 tools** (not 23 as stated in the requirements doc; CLAUDE.md says 22)

## Problem Frame

See `docs/brainstorms/2026-04-15-fulcrum-ux-requirements.md` Context section.

The broken chain: `packages/cli/src/hooks.ts` `runPreHook` fires on every Claude tool call, but writes nothing to the DB when `run_id` is absent (which is always, in a normal Claude session). The PostToolUse hook writes `tool_trace` memories only when `ctx.runId` is set. Memory, runs, analytics — all invisible.

The install cliff: native Kuzu + better-sqlite3 build, 8 manual steps, session restart required for MCP, no completion signal.

## Requirements Trace

- R1. Every Claude tool call produces a visible Fulcrum DB row (hook_events), regardless of run_id
- R2. Monitor `/analytics/summary` reflects hook activity
- R3. `npx -y fulcrum-mcp` starts the MCP server in < 10 seconds on macOS arm64 with all 27 tools available
- R4. `pnpm install` succeeds even when kuzu native build fails
- R5. `completeAgentRun` and `blockAgentRun` write memory entries tagged `source: 'auto'`; `recall_memory` exposes the `source` field
- R6. `agent-integration/claude/CLAUDE.md` tool count matches `TOOL_SCHEMAS.length` (currently 27) at all times; CI fails if stale
- R7. `fulcrum serve mcp` auto-starts the monitor; opt-out via `--no-monitor` / `FULCRUM_NO_MONITOR=1`
- R8. `get_current_context` response includes a `readiness` object with `tools_available`, `monitor_running`, `suggested_next_call`
- R9. `pnpm run setup` ends with a doctor gate and seeds one task + one memory row to prove the write path

## Scope Boundaries

- No session replay, hook telemetry pattern analysis, or MCP role switching
- Feature 2 (npx) does not include managed cloud/remote state — state stays local
- No agent protocol changes
- `hook_active` and `doctor_warnings` in the readiness object (Feature 6) are deferred to a follow-up (latency risk; depend on Feature 1 being deployed first)
- GEMINI.md and CODEX AGENTS.md generation are deferred — Feature 4 covers CLAUDE.md only
- **Windows support for `npx fulcrum-mcp` is out of scope at launch** — no MSVC build-tools assumption; see Risks table for startup-check mitigation

### Deferred to Separate Tasks

- GEMINI.md and AGENTS.md auto-generation: separate follow-up after Feature 4 stabilizes
- `hook_active` + `doctor_warnings` in readiness object: separate PR after Feature 1 is deployed
- Monitor HTTP authentication: tracked separately (current local-only assumption is a known gap; see Risks)
- Prebuilt `better-sqlite3` matrix maintenance: tracked separately with CI automation

## Context & Research

### Relevant Code and Patterns

- `packages/cli/src/hooks.ts` — `runPreHook` (lines 101–187), `runPostHook` (194–237); io.stdout at line 185, io.exit at line 186; tool_trace write already in runPostHook
- `packages/core/src/runs.ts` — `completeAgentRun` calls `safeWriteMemory` → `writeLifecycleMemory` when `output_summary.trim().length > 20` and `task_id` exists
- `packages/core/src/memory-insert.ts` — `writeLifecycleMemory`, `LifecycleMemoryInput` type (no `source` field yet)
- `packages/core/src/db/migrations/` — last migration is m050; pattern: `INSERT OR IGNORE INTO schema_migrations`; ALTER TABLE catches `duplicate column name` error for idempotency
- `packages/cli/src/mcp-server.ts` — `runFulcrumMcpServer` lines 490–512; `server.connect(transport)` at line 505; stdin close handler follows
- `packages/cli/src/mcp-tools.ts` — `TOOL_SCHEMAS` (27 tools); `get_current_context` tool at lines 569–581
- `packages/cli/src/index.ts` — `currentProjectIds()` returns `{ workspace_id, project_id }` via `projectIdsFromPath(cwd)`; `get_current_context` handler at ~line 510; doctor command with `--json` support
- `packages/monitor/src/server.ts` — `GET /status` exists (lines 37–42), returns `{ status: 'ok', workspace_id, ts }`
- `agent-integration/claude/CLAUDE.md` — has `<!-- GENERATED:tools-start -->` / `<!-- GENERATED:tools-end -->` markers; currently says "Total: 22 tools"; `pnpm gen:claude-md` script exists in root `package.json`
- `agent-integration/install.ts` — `step(name, fn)` helper; continues on error (does not abort); `recoveryHintFor()` on failure; `StepResult` shape: `{ name, status: 'ok'|'skip'|'warn'|'fail', detail?, recovery?, rollback? }`
- `packages/memory/src/kuzu/client.ts` — kuzu imported with `await import('kuzu')` (already lazy) — safe to move to optionalDependencies
- `packages/core/src/index.ts` line 138 — existing dynamic import pattern: `await import('@fulcrum/teams')` inside `getTeamOps()`

### Institutional Learnings

- ALTER TABLE migrations must catch `duplicate column name` for idempotency (SQLite has no `IF NOT EXISTS` for columns)
- Hook write must precede `io.exit(0)` — code after `process.exit` is unreachable
- `detached: false` + `process.on('exit', cleanup)` is more reliable than `monitor.unref()` for child process lifecycle management

## Key Technical Decisions

- **Feature 3 scope is narrower than requirements doc**: `completeAgentRun` already writes memories via `writeLifecycleMemory`. The task is adding `source TEXT DEFAULT 'manual'` to the migration and plumbing `source: 'auto'` through `LifecycleMemoryInput` — no new write call needed, no circular import concern.
- **Feature 2: kuzu move is safe**: All kuzu calls in `packages/memory/src/kuzu/client.ts` are already behind `await import('kuzu')` — no static top-level import to convert. Moving to `optionalDependencies` is a one-line package.json change.
- **Feature 4: gen:claude-md already exists**: The script generates the `<!-- GENERATED -->` block. The gap is the header ("exposes 13 tools" in the intro text) which lives outside the generated section. Fix requires extending the script to also update/replace the header, or extracting the intro into the template.
- **Monitor spawn lifecycle**: Use `process.on('exit', () => monitorProcess.kill())` rather than `monitor.unref()` alone. `unref()` prevents the parent's event loop from waiting for the child but does NOT guarantee the child is killed when the parent exits. On SIGKILL the OS kills only the targeted process; the `exit` handler on the parent ensures explicit cleanup on normal exits.
- **Feature 5 monitor entry point in npx context**: Committed to `import.meta.resolve('@fulcrum/cli/serve-monitor')` + `fileURLToPath()` from `node:url`. `require.resolve` is not available in a native-ESM package (`"type": "module"`). The `./serve-monitor` subpath export in `packages/cli/package.json` is a **blocking prerequisite** — `import.meta.resolve` throws `ERR_PACKAGE_PATH_NOT_EXPORTED` without it. The entry must map to `./dist/serve-monitor.js` (published) and `./src/serve-monitor.ts` (monorepo dev). See Unit 6 approach for full detail.
- **Feature 7 workspace IDs in install.ts**: Use `currentProjectIds()` (already called by `get_current_context`; wraps `projectIdsFromPath(process.cwd())`). Import from `@fulcrum/core` — no new computation needed.
- **Feature 7 doctor gate abort**: The current `step()` helper continues on error and does not abort the install. The doctor gate step needs to call `fail()` within the step AND return early from install.ts when doctor reports FAIL-level checks. Either add an abort mechanism to `step()` or restructure the gate as a post-step check outside the `step()` wrapper. **PATH issue**: `spawnSync('fulcrum', ...)` resolves via `$PATH`, which may not include the freshly installed binary on a first-time setup (the binary is in `node_modules/.bin/` but not yet globally linked). Use an explicit path (e.g., `path.join(process.cwd(), 'node_modules/.bin/fulcrum')`) rather than the bare command name — an `ENOENT` from a missing PATH entry produces empty stdout, which the JSON-parse handler reports as "malformed JSON" instead of "fulcrum not found."
- **Tool count**: `TOOL_SCHEMAS.length` is **27** (not 23 as in requirements doc). All generated content should read from the live array, not a hardcoded number.

## Open Questions

### Resolved During Planning

- **Is `fulcrum doctor --json` already implemented?** Yes — `packages/cli/src/index.ts` lines 2371–2374.
- **Is the kuzu top-level import already dynamic?** Yes — `packages/memory/src/kuzu/client.ts` uses `await import('kuzu')`. The feasibility concern (F3 in document review) is resolved.
- **What is the actual tool count?** 27 (confirmed by `grep "title:" packages/cli/src/mcp-tools.ts | wc -l`). Requirements doc said 23; CLAUDE.md says 22.
- **Does `SYSTEM_INVARIANTS` export from `packages/policy/src/index.ts`?** Yes — line 28.
- **How to get workspace_id in install.ts?** Use `currentProjectIds()` — same function `get_current_context` uses.

### Deferred to Implementation

- **Exact exports map entry for monitor entry point** (`@fulcrum/cli/serve-monitor`): verify exact path in compiled output and `package.json` exports field before implementing Feature 5 in npx context.
- **Whether `step()` needs a new abort-on-fail option or Feature 7 gate should live outside the step wrapper**: assess the simplest mechanism during implementation.
- **Prebuilt `better-sqlite3` matrix scope for Feature 2**: Confirm which Node.js ABI versions to precompile and which CI runner images cover the matrix. Defer to implementation discovery.
- **Feature 6 `hook_active` and `doctor_warnings` implementation**: Deferred by explicit decision; implement in a follow-up PR after Feature 1 is deployed.

## Output Structure

New files introduced by this plan:

```
packages/core/src/db/migrations/
  m051.ts              # hook_events table
  m052.ts              # source column on memories

packages/fulcrum-mcp/  # new package (Feature 2)
  package.json
  src/
    index.ts           # thin entry: calls runFulcrumMcpServer

agent-integration/claude/
  CLAUDE.md.template   # static template with {{TOOL_COUNT}} placeholder
                       # (replaces the intro section; generated section stays)
```

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

### Dependency graph across units

> ↓ = recommended implementation order, not strict dependency. Units 5 and 6 are an example: Unit 5 ships first with a partial readiness object (no monitor_url), then Unit 6 adds monitor auto-start and Unit 5 gains a live monitor_url. The capability dependency is Unit 6 → enables → Unit 5 monitor_url; the implementation order is Unit 5 before Unit 6 because Unit 5 can deliver independently without Unit 6.

```
Unit 1 (m051 + hook write)
Unit 2 (m052 + source field) — independent of Unit 1
Unit 3 (CLAUDE.md gen fix)   — independent
    ↓
Unit 4 (install checkpoint)  — depends on Unit 2 (source field for seed memory)
    ↓
Unit 5 (readiness object)    — ships partial without Unit 1 (hook_active deferred) or Unit 6 (monitor_url null until Unit 6 deploys)
    ↓
Unit 6 (monitor auto-start)  — enables Unit 5's monitor_url field when deployed
    ↓
Unit 7 (npx bootstrap)       — benefits from all prior units being stable
```

### Feature 3: source field data flow

```
completeAgentRun(input)
  └─ writeLifecycleMemory({
       ...existing fields,
       source: input.source ?? 'auto'   ← new
     })
       └─ INSERT INTO memories (..., source) VALUES (..., 'auto')
            ← m052 adds: source TEXT NOT NULL DEFAULT 'manual'
```

### Feature 5: monitor process lifecycle

```
runFulcrumMcpServer()
  └─ server.connect(transport)
       └─ if (!noMonitor)
            monitorProcess = spawn('@fulcrum/cli/serve-monitor', ['--port', '4721'])
            process.on('exit', () => monitorProcess.kill())
            await probeMonitorReady(4721)   ← up to 2s
       └─ wait on stdin close
```

## Implementation Units

- [x] **Unit 1: Passive trace harvesting (Feature 1)**

**Goal:** Every Claude tool call writes a `hook_events` row to SQLite, making sessions visible in the monitor regardless of whether `start_agent_run` was called.

**Requirements:** R1, R2

**Dependencies:** None

**Files:**
- Create: `packages/core/src/db/migrations/m051.ts`
- Modify: `packages/cli/src/hooks.ts`
- Modify: `packages/monitor/src/server.ts` (add `hook_event_count` to `/analytics/summary`)
- Modify: `packages/core/src/db/schema.ts` or wherever the migration list is registered
- Modify: `packages/cli/src/index.ts` — add `Hook events writable` check to `fulcrum doctor`
- Test: `packages/cli/src/tests/hooks.test.ts` (or nearest existing test file)

**Approach:**
- Migration m051: `CREATE TABLE IF NOT EXISTS hook_events (hook_event_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, session_id TEXT NOT NULL, tool_name TEXT NOT NULL, agent_role TEXT NOT NULL DEFAULT '', run_id TEXT, ts TEXT NOT NULL, cli_name TEXT NOT NULL)` with index on `(workspace_id, session_id, ts)`. Idempotency via `schema_migrations` INSERT OR IGNORE.
- In `runPreHook`, add a try/catch block **before** `io.stdout(...)` (line 185). On success: fire-and-forget SQLite INSERT using `newId('hev_')`. On any error: log to stderr only, do not rethrow.
- The NormalizedHookEvent already has `sessionId`, `toolName`, `agentRole`, `runId`. Use `workspace_id` from the existing hook context (empty string fallback if absent).
- Janitor: add `deleteOldHookEvents(db, workspaceId)` to `packages/core/src/janitor.ts` — `DELETE FROM hook_events WHERE ts < datetime('now', '-30 days')`.
- **Row-count cap** (guard against janitor skip-under-load): At INSERT time, if a `SELECT COUNT(*) FROM hook_events WHERE workspace_id = ?` exceeds 50,000 rows, skip the INSERT and emit a single stderr warning (rate-limited to once per hour). This prevents unbounded growth during long sessions when the janitor's `running` guard defers cleanup. The check is a best-effort guard, not a transactional constraint — race conditions on the count are acceptable given the fire-and-forget context.
- Monitor: add `hook_event_count: number` to the `/analytics/summary` response — `SELECT COUNT(*) FROM hook_events WHERE workspace_id = ?`.

**Patterns to follow:**
- `packages/core/src/db/migrations/m050.ts` — migration structure with schema_migrations guard
- `packages/cli/src/hooks.ts` runPostHook — existing best-effort write pattern with try/catch + stderr logging

**Test scenarios:**
- Happy path: `runPreHook` called with a valid event → `hook_events` table has a row with correct tool_name, session_id, cli_name
- Edge case: DB write throws (simulate by dropping the table) → hook still exits 0, still writes `{ continue: true }` to stdout
- Edge case: empty workspace_id in context → row inserted with workspace_id = ''
- Edge case: multiple concurrent calls with different session_ids → distinct rows, no conflict
- Integration: janitor cycle called with rows older than 30 days → old rows deleted, recent rows kept
- Integration: GET /analytics/summary with correct workspace_id → `hook_event_count` increments when hook is called with that workspace_id
- Integration: hook called with `workspace_id = ''` → row exists in `hook_events` but `/analytics/summary?workspace_id=<real>` count does NOT increment (data-binding correctness)
- Doctor check: `fulcrum doctor` runs the `Hook events writable` check → INSERT+DELETE test passes; simulating SQLITE_BUSY → check reports `warn`

**Verification:**
- After any Claude Code tool call, `SELECT COUNT(*) FROM hook_events` returns > 0
- `GET /analytics/summary` includes `hook_event_count` that reflects rows with the correct workspace_id
- Hook process exits 0 even when SQLite write throws
- `fulcrum doctor` includes `Hook events writable` check
- Median hook write latency < 10ms under isolated single-writer load (benchmark test); P99 under parallel-fan-out burst (5–10 concurrent hooks) measured and documented in the PR body as an accepted trade-off

---

- [x] **Unit 2: Memory source field (Feature 3)**

**Goal:** Auto-written memory entries from `completeAgentRun` / `blockAgentRun` are tagged `source: 'auto'`; manually written entries default to `source: 'manual'`; `recall_memory` exposes the field.

**Requirements:** R5

**Dependencies:** None (independent of Unit 1)

**Files:**
- Create: `packages/core/src/db/migrations/m052.ts`
- Modify: `packages/core/src/memory-insert.ts` — add `source` to `LifecycleMemoryInput` and INSERT
- Modify: `packages/core/src/runs.ts` — pass `source: 'auto'` to `writeLifecycleMemory` call sites in `completeAgentRun` and `blockAgentRun`
- Modify: `packages/core/src/db/schema.ts` or migration registry
- Modify: `packages/cli/src/mcp-tools.ts` — add `source` to `recall_memory` outputSchema
- Modify: `packages/cli/src/index.ts` — expose `source` in recall_memory handler response
- Test: `packages/core/src/tests/runs.test.ts`

**Approach:**
- Migration m052: `ALTER TABLE memories ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'`. Wrap in try/catch for `duplicate column name` idempotency (SQLite pattern already in codebase).
- `LifecycleMemoryInput`: add optional `source?: 'auto' | 'manual' | 'setup'` field; default to `'manual'` in the INSERT.
- `runs.ts`: the two existing `safeWriteMemory` calls (in `completeAgentRun` and `blockAgentRun`) pass the input object; add `source: 'auto'` to both call sites.
- No dynamic import needed — `writeLifecycleMemory` is already in `packages/core/src/memory-insert.ts`, same package.
- `recall_memory` MCP tool: add `source` to SELECT and outputSchema. Existing query already returns all columns; just surface the field.

**Patterns to follow:**
- `packages/core/src/db/migrations/m005.ts` (or similar) — ALTER TABLE with duplicate-column idempotency guard
- Existing `LifecycleMemoryInput` type in `packages/core/src/memory-insert.ts`

**Test scenarios:**
- Happy path: `completeAgentRun` with output_summary > 20 chars + task_id → memory row has `source = 'auto'`
- Happy path: `blockAgentRun` → memory row has `source = 'auto'`
- Happy path: `recall_memory` result objects include `source` field
- Edge case: `completeAgentRun` with output_summary ≤ 20 chars → no memory written (existing threshold preserved)
- Edge case: `completeAgentRun` without task_id → no memory written (existing guard preserved)
- Edge case: migration m052 run twice → idempotent, no error
- Edge case: manually written memory via `write_memory` MCP tool → `source = 'manual'` (default)

**Verification:**
- After `completeAgentRun`, `SELECT source FROM memories ORDER BY created_at DESC LIMIT 1` returns `'auto'`
- `recall_memory` JSON response includes `source` in each result

---

- [x] **Unit 3: CLAUDE.md generation fix (Feature 4)**

**Goal:** `agent-integration/claude/CLAUDE.md` always reflects the correct tool count (currently 27) and role count; CI fails if the file is stale; setup runs the generator automatically.

**Requirements:** R6

**Dependencies:** None (independent)

**Files:**
- Modify: `scripts/gen-claude-md.ts` (existing) — extend to regenerate the intro header tool count in addition to the `<!-- GENERATED -->` block
- Create: `agent-integration/claude/CLAUDE.md.template` — extract the static intro section with `{{TOOL_COUNT}}` placeholder
- Modify: `agent-integration/install.ts` — call `gen:claude-md` (or inline the generation) during setup
- Modify: root `package.json` — confirm `gen:claude-md` script is wired correctly (script already exists)
- Modify: `.github/workflows/ci.yml` (or equivalent CI config) — add `git diff --exit-code` check on `agent-integration/claude/CLAUDE.md`
- Test: `agent-integration/tests/gen-claude-md.test.ts` (new)

**Approach:**
- The existing `gen:claude-md` script regenerates the `<!-- GENERATED:tools-start -->` block but leaves the intro header ("exposes N tools") unchanged. Two options: (a) extend the script to also replace the intro header using a marker like `<!-- HEADER:tool-count -->`, or (b) move the intro text into `CLAUDE.md.template` with `{{TOOL_COUNT}}` substituted at generation time. Option (b) is cleaner and already described in the requirements doc.
- Generator reads `TOOL_SCHEMAS.length` from `packages/cli/src/mcp-tools.ts` and `SYSTEM_INVARIANTS.length` from `packages/policy/src/engine.ts` (already exported from index). Writes `{{TOOL_COUNT}}` replacement into template output.
- `install.ts` integration: add a step before the doctor gate that runs `pnpm gen:claude-md` (or imports and calls the generator inline). This keeps CLAUDE.md current after every setup.
- CI: add a step `pnpm gen:claude-md && git diff --exit-code agent-integration/claude/CLAUDE.md` in the lint/check job. Fail message: "CLAUDE.md is out of date — run pnpm gen:claude-md".

**Patterns to follow:**
- Existing `scripts/gen-claude-md.ts` structure

**Test scenarios:**
- Happy path: run `gen:claude-md` → CLAUDE.md intro reads "exposes 27 tools" (matching `TOOL_SCHEMAS.length`)
- Happy path: add a mock tool to `TOOL_SCHEMAS`, run gen → count increments correctly
- Edge case: template file missing → generator exits with error message "template not found: agent-integration/claude/CLAUDE.md.template"
- Integration: `pnpm run setup` runs the generator → resulting CLAUDE.md has the correct count

**Verification:**
- `grep "exposes [0-9]* tools" agent-integration/claude/CLAUDE.md` matches `TOOL_SCHEMAS.length`
- CI step `git diff --exit-code agent-integration/claude/CLAUDE.md` passes after running `gen:claude-md`

---

- [x] **Unit 4: Install-to-value checkpoint (Feature 7)**

**Goal:** `pnpm run setup` ends with a doctor gate (fails setup on FAIL-level checks) and seeds one task + one memory entry with `source: 'setup'` to prove the write path.

**Requirements:** R9

**Dependencies:** Unit 2 (source field on memories for seed write)

**Files:**
- Modify: `agent-integration/install.ts`
- Test: `agent-integration/tests/install.test.ts` (new or existing)

**Approach:**
- **Doctor gate**: After all existing install steps complete, call `spawnSync('fulcrum', ['doctor', '--json'])` and parse the output as `Array<{ name: string; status: string; message: string }>`. Filter for `status === 'fail'`. On failures: print each failure with `recoveryHintFor(f.name)` and mark the step as `fail`. The current `step()` helper continues on error — implement abort by checking the returned `StepResult.status` after the gate step and exiting early if `'fail'`.
- **Bypass**: Check `process.env.FULCRUM_SETUP_NO_GATE === '1'` at the top of the gate step; skip doctor call if set. Also parse `--no-doctor-gate` from `process.argv`.
- **Seed write**: After doctor gate passes, call `currentProjectIds()` to get workspace/project IDs, then `createTask` + `writeLifecycleMemory` (or `write_memory` via the core API). Both seed entries get `source: 'setup'`.
- **Idempotency guard**: Use `INSERT OR IGNORE` against a unique constraint rather than a SELECT-then-INSERT check. A SELECT-then-INSERT is not atomic and can produce duplicate rows if setup is run concurrently (e.g., Docker parallel build steps). Add a unique tag `fulcrum:setup-seed` on the task, or enforce via a `UNIQUE` constraint on a `source = 'setup'` column. This follows the existing `INSERT OR IGNORE` pattern used in schema_migrations and throughout `tasks.ts`.
- Note: `source: 'setup'` requires Unit 2 to be merged first (m052 migration + source field in LifecycleMemoryInput).

**Patterns to follow:**
- Existing `step()` helper and `recoveryHintFor()` in `agent-integration/install.ts`
- `currentProjectIds()` usage in `packages/cli/src/index.ts`

**Test scenarios:**
- Happy path: setup completes → `fulcrum doctor` exits 0, `fulcrum task list` shows seed task, `fulcrum memory recall --query "initialized"` returns seed memory
- Happy path: seed task + memory have `source: 'setup'` (or equivalent tag)
- Error path: doctor returns FAIL-level check → setup prints recovery hints and exits non-zero
- Edge case: `FULCRUM_SETUP_NO_GATE=1` → gate skipped, setup exits 0 regardless of doctor
- Edge case: `--no-doctor-gate` flag → same as above
- Edge case: setup run twice → idempotency guard skips seed, no duplicate task or memory
- Edge case: `fulcrum doctor --json` fails to parse (malformed JSON) → step marked `fail` with clear error, not a crash

**Verification:**
- After `pnpm run setup` from a clean state: `fulcrum task list` non-empty; `fulcrum memory recall` returns result
- After `pnpm run setup` from already-set-up state: no duplicate seed entries

---

- [x] **Unit 5: `get_current_context` readiness object (Feature 6)**

**Goal:** `get_current_context` response includes a `readiness` object giving agents an oriented path forward on every session start.

**Requirements:** R8

**Dependencies:** Unit 1 (optional — `hook_active` deferred; Unit 5 ships a partial readiness object without it)

**Files:**
- Modify: `packages/cli/src/mcp-tools.ts` — add `readiness` to outputSchema
- Modify: `packages/cli/src/index.ts` — update `get_current_context` handler
- Test: `packages/cli/src/tests/mcp-tools.test.ts` (or nearest)

**Approach:**
- Add `readiness` object to the handler response:
  ```
  {
    tools_available: TOOL_SCHEMAS.length,      // 27; constant, no probe
    monitor_url: string | null,                 // probed
    monitor_running: boolean,                   // probed
    suggested_next_call: "build_cos_context",  // static for now
  }
  ```
- Monitor probe: `fetch('http://127.0.0.1:${FULCRUM_MONITOR_PORT ?? 4721}/status', { signal: AbortSignal.timeout(200) })`. If response status is 200: `monitor_running: true`, `monitor_url: "http://127.0.0.1:4721"`. On any error or timeout: `monitor_running: false`, `monitor_url: null`.
- **Deferred in this unit**: `hook_active` and `doctor_warnings` — ship as absent fields or `null` placeholders. Add a comment noting they require Feature 1 and a follow-up PR.
- **Performance and caching**: Only the monitor probe adds latency; it is bounded by `AbortSignal.timeout(200)`. Total overhead ≤ 200ms per call. **Cache `monitor_running`** with a 10–30s in-process TTL (module-level `{ result: boolean, cachedAt: number }` object, invalidated when `Date.now() - cachedAt > TTL`). The probe fires per-call, not per-session; agents that call `get_current_context` on each sub-task turn pay 200ms × N calls without caching. The cached value is safe to serve stale within the TTL window — monitor start/stop events are infrequent relative to tool-call frequency.
- Update outputSchema in `TOOL_SCHEMAS` to document the `readiness` field.

**Patterns to follow:**
- `AbortSignal.timeout(200)` — standard Node 18+ pattern
- Existing `get_current_context` handler for return shape

**Test scenarios:**
- Happy path: monitor is running → `readiness.monitor_running: true`, `readiness.monitor_url` populated
- Happy path: monitor not running → `readiness.monitor_running: false`, `readiness.monitor_url: null`
- Happy path: `readiness.tools_available` equals `TOOL_SCHEMAS.length` (27)
- Happy path: `readiness.suggested_next_call` is always `"build_cos_context"`
- Error path: monitor probe times out (200ms) → `monitor_running: false`, response still returns in ≤ 250ms
- Edge case: `FULCRUM_MONITOR_PORT` env var set → probe uses the configured port

**Verification:**
- `get_current_context` always returns a `readiness` object
- Response time is < 250ms whether monitor is up or down
- `tools_available` matches `TOOL_SCHEMAS.length`

---

- [x] **Unit 6: Monitor auto-start with MCP server (Feature 5)**

**Goal:** `fulcrum serve mcp` automatically starts the monitor HTTP server as a child process; the monitor dies when the MCP server exits; opt-out available.

**Requirements:** R7

**Dependencies:** Unit 5 (monitor_url field in readiness object depends on this being live)

**Files:**
- Modify: `packages/cli/src/mcp-server.ts` — spawn monitor after `server.connect(transport)`
- Modify: `packages/cli/src/index.ts` — wire `--no-monitor` flag to `fulcrum serve mcp` command
- Modify: `packages/cli/package.json` — add `./serve-monitor` exports entry pointing to the compiled serve-monitor entry point (for npx context resolution)
- Test: `packages/cli/src/tests/mcp-server.test.ts`

**Approach:**
- After `server.connect(transport)` in `runFulcrumMcpServer`, check `options.noMonitor` flag and `process.env.FULCRUM_NO_MONITOR`. If neither is set, spawn the monitor.
- Entry point resolution: Commit to `import.meta.resolve('@fulcrum/cli/serve-monitor')` — `packages/cli` is native ESM (`"type": "module"`, `moduleResolution: NodeNext`), so `require.resolve` is unavailable without a `createRequire` shim. `import.meta.resolve` returns a `file://` URL; wrap with `fileURLToPath()` from `node:url` before passing to `spawn`. Do NOT use `path.join(__dirname, '../../...')` — invalid in the npx cache.
- The `./serve-monitor` subpath export is a **blocking prerequisite**: `import.meta.resolve('@fulcrum/cli/serve-monitor')` throws `ERR_PACKAGE_PATH_NOT_EXPORTED` until this entry exists in `packages/cli/package.json`'s `exports` map. The entry must point to `./dist/serve-monitor.js` (published package) and `./src/serve-monitor.ts` (monorepo dev via tsx).
- **Compilation path (blocking pre-implementation decision)**: the CLI currently runs source via the `tsx` shebang. The monitor subprocess can either (a) use `node --import tsx/esm <path>` (tsx must be an explicit dep in `packages/fulcrum-mcp/package.json`) or (b) target compiled `dist/` output. **This decision must be made before writing the `./serve-monitor` export entry** — the entry maps to different paths (`./src/serve-monitor.ts` vs `./dist/serve-monitor.js`) depending on which path is chosen, and the exports field cannot be correct until this is resolved.
- Subprocess SQLite isolation: monitor subprocess opens its own `better-sqlite3` connection. WAL mode is already active (`packages/core/src/db/client.ts` line 57 — `busy_timeout = 5000`); WAL supports concurrent readers + one writer, so read-heavy monitor queries are safe alongside the MCP server's writes.
- Lifecycle: `const monitorProcess = spawn(...)`. Register `process.on('exit', () => monitorProcess.kill())` — this ensures the monitor is killed on normal exits. Do NOT use `monitor.unref()` alone, which does not guarantee cleanup on SIGKILL (document as best-effort).
- Port conflict: Catch EADDRINUSE on spawn; log warning to stderr and continue — the MCP server is unaffected.
- Startup probe: Print `[fulcrum mcp] monitor started at http://127.0.0.1:4721` to stderr only after `/status` returns 200 (or after 2s timeout, print `[fulcrum mcp] monitor may still be starting`).
- `--no-monitor` flag: Parsed by the `fulcrum serve mcp` CLI command; passed into `runFulcrumMcpServer` options.

**Patterns to follow:**
- Existing `process.on('SIGTERM', ...)` shutdown handler in `runFulcrumMcpServer`
- Node.js `child_process.spawn` with `stdio: 'ignore'` for background processes

**Test scenarios:**
- Happy path: `runFulcrumMcpServer` called without `noMonitor` → monitor process spawned; `GET /status` returns 200 within 2s
- Happy path: `--no-monitor` flag → no monitor process spawned
- Happy path: `FULCRUM_NO_MONITOR=1` → no monitor process spawned
- Error path: port 4721 in use → warning logged to stderr; MCP server continues; monitor_running returns false
- Edge path: MCP server process receives SIGTERM → `process.on('exit')` handler kills monitor; no orphan process

**Verification:**
- After `fulcrum serve mcp`: `GET http://localhost:4721/status` returns `{ status: 'ok' }` within 2 seconds
- After MCP server exits: `lsof -i :4721` shows no listening process (best-effort; SIGKILL resistant only via documented limitation)

---

- [x] **Unit 7: npx bootstrap — `fulcrum-mcp` package (Feature 2)**

**Goal:** `npx -y fulcrum-mcp` starts the MCP server with all 27 tools in < 10 seconds on macOS arm64, with no repo clone and no Kuzu compilation.

**Requirements:** R3, R4

**Dependencies:** Units 1–6 should be stable before publishing (npx package pins a version; instability in prior units would be locked in)

**Files:**
- Create: `packages/fulcrum-mcp/package.json`
- Create: `packages/fulcrum-mcp/src/index.ts`
- Create: `packages/fulcrum-mcp/tsconfig.json`
- Modify: `packages/memory/package.json` — move `kuzu` from `dependencies` to `optionalDependencies`
- Modify: `pnpm-workspace.yaml` — add `packages/fulcrum-mcp` to workspace
- Modify: `packages/cli/package.json` — add `./serve-monitor` export (if not done in Unit 6)
- Create: `.github/workflows/npx-smoke.yml`
- Modify: `docs/guides/installation.md` — add "npx (quick start)" as the primary section

**Approach:**
- `packages/fulcrum-mcp/package.json`: `"bin": { "fulcrum-mcp": "./dist/index.js" }`, `"name": "fulcrum-mcp"`, `"preferGlobal": false`. Dependencies: `@fulcrum/cli` (runtime). Peer dev dependency on `@fulcrum/memory` with `optionalDependencies` for kuzu.
- `src/index.ts`: thin entry — imports and calls `runFulcrumMcpServer()` from `@fulcrum/cli/mcp-server`. The file has a shebang (`#!/usr/bin/env node`) for direct execution.
- **kuzu split**: Move `"kuzu": "^0.10.0"` in `packages/memory/package.json` from `dependencies` to `optionalDependencies`. The lazy import in `packages/memory/src/kuzu/client.ts` is already in place — this is the only required change.
- **better-sqlite3 prebuilts**: Do not build new prebuild infrastructure. `better-sqlite3 ^12.0.0` already ships prebuilt binaries via its own `prebuild-install` mechanism for Node 20 (ABI 115) and Node 22 (ABI 127) on macOS arm64/x64 and Linux x64. Verify that a cold `npx -y fulcrum-mcp` on those platforms downloads the prebuilt without triggering `node-gyp` (cleared npm cache, `time npx -y fulcrum-mcp --version` ≤ 10s is the acceptance gate). If the cold install exceeds budget, the mitigation is bundling the `.node` binaries directly in the tarball via the `files` field — not introducing new prebuild tooling. ABI coverage matrix: Node 20 (ABI 115) + Node 22 (ABI 127) on macOS arm64, macOS x64, Linux x64.
- **CI smoke job**: `npx -y fulcrum-mcp@latest &` → wait for MCP process to start → run a minimal MCP client that calls `get_current_context` via stdin/stdout → assert response includes `workspace_id`. Run on macOS arm64 and ubuntu-latest.
- **Publish prerequisites** (blocking): (a) add `"publishConfig": { "access": "public" }` to `packages/fulcrum-mcp/package.json` — without this, a scoped fallback (`@fulcrum/mcp`) defaults to private and the smoke job returns 404; (b) verify the npm account has rights to `fulcrum-mcp` (unscoped) or the `@fulcrum` org exists for the scoped fallback; (c) decide on manual-first vs CI-automated publish before Unit 7 ships ("manual first publish, automation deferred" is acceptable). These are prerequisites, not implementation details.

**Patterns to follow:**
- `packages/cli/src/mcp-server.ts` — `runFulcrumMcpServer` is the entry function
- Existing workspace package structure for tsconfig and build scripts

**Test scenarios:**
- Happy path: `npx -y fulcrum-mcp` in a temp directory → process starts; responds to `get_current_context` within 10s
- Happy path: all 27 MCP tools are listed in the capabilities response
- Happy path: `pnpm install` in the monorepo completes without kuzu build failure (simulated by setting `npm_config_optional=false`)
- Error path: kuzu binary missing at runtime → L2 disabled gracefully; L0/L1 memory still works; no crash
- Integration (CI): npx-smoke job passes on macOS arm64 and ubuntu-latest

**Verification:**
- `npx -y fulcrum-mcp` cold start ≤ 10 seconds on macOS arm64 CI runner (cleared npm cache, no kuzu compilation)
- CI smoke job green on macOS arm64 and ubuntu-latest
- `docs/guides/installation.md` has "npx (quick start)" as the first install path
- Publish prerequisites checklist completed (publishConfig, account rights, publish decision) before first publish

---

## System-Wide Impact

- **Interaction graph:** Unit 1 (`runPreHook`) fires on every Claude tool call. `better-sqlite3` is always synchronous — the INSERT is a blocking call in the hook subprocess. Under Claude Code's parallel tool-use fan-out, multiple hook subprocesses can race for the WAL write lock simultaneously. WAL allows only one writer at a time; concurrent writers queue behind `busy_timeout = 5000ms` (`packages/core/src/db/client.ts` line 57). The "< 5ms per write" budget applies to isolated writes only; under a parallel burst (5–10 concurrent hooks), worst-case wait approaches the `busy_timeout` ceiling. Verify empirically under a parallel-tool-call workload; if median wait exceeds 20ms, document it as an accepted trade-off rather than a guarantee. The monitor `/analytics/summary` endpoint already runs four unbounded `COUNT(*)` queries per request with no caching; adding a fifth on `hook_events` — the highest-velocity table — compounds this. Sourcing this count from a pre-aggregated value (e.g., a daily rollup) is preferable to a live `COUNT(*)`; if a live query is used, document the trade-off explicitly. `get_current_context` adds a network probe bounded at 200ms *per call* — not per session. Agents calling `get_current_context` on each sub-task turn (a likely pattern given the `suggested_next_call` field) pay this cost cumulatively: 50 calls × 200ms = 10s of dead wait. The Unit 5 implementation should cache the `monitor_running` result with a short in-process TTL (10–30s) to amortize repeated calls.
- **Error propagation:** Hook write failures are swallowed (try/catch + stderr). Memory write failures in `blockAgentRun` / `completeAgentRun` are already swallowed by `safeWriteMemory`. The install doctor gate is the only place where a new failure surfaces to the user — but only if the gate resolves correctly. Unit 4's `spawnSync('fulcrum', ['doctor', '--json'])` assumes `fulcrum` is on `$PATH`; on a first-time setup before global linking, the binary is in `node_modules/.bin/` but not PATH. An `ENOENT` returns empty stdout, which the JSON-parse path reports as "malformed JSON" instead of "fulcrum not found." The gate must resolve the binary path explicitly (see Key Technical Decisions).
- **State lifecycle risks:** m051 and m052 are additive migrations — no column removed or renamed. ALTER TABLE for m052 is idempotent. Janitor TTL for hook_events (30 days) is the primary cleanup mechanism, but the janitor's `running` skip guard (`packages/core/src/janitor.ts` line 277: `if (running) return`) means cleanup can be deferred indefinitely when a long embedding-consolidation cycle keeps the janitor busy — precisely when `hook_events` is growing fastest. Consider a lightweight separate cleanup task for `hook_events` independent of the main janitor cycle, or a row-count cap enforced at INSERT time as a secondary guard. Seed data in Unit 4 must use `INSERT OR IGNORE` against a unique constraint — not a SELECT-then-INSERT check — to be safe under concurrent setup runs (follows existing codebase pattern).
- **API surface parity:** The `recall_memory` MCP tool gains a `source` field in its response. Callers that destructure the response and ignore unknown fields are unaffected. The `readiness` field on `get_current_context` is additive.
- **Integration coverage:** Hook write → DB row → monitor analytics is a three-layer integration that unit tests alone will not prove. Critically, a row written with `workspace_id = ''` (empty-string fallback when context is absent) satisfies the hook write criterion but is invisible to the monitor query (`WHERE workspace_id = ?`). The three-layer integration test must cover: (a) hook called with correct workspace_id → `/analytics/summary` `hook_event_count` increments; (b) hook called with empty workspace_id → count does not increment for the workspace. The existing test scenario "edge case: empty workspace_id → row inserted with workspace_id = ''" is necessary but not sufficient.
- **Unchanged invariants:** The `run_id` flow for `start_agent_run` / `complete_agent_run` is unchanged. The five system invariants in `@fulcrum/policy` are unchanged. All 27 existing MCP tools are unchanged. The hook still exits 0 with `{ continue: true }` on every non-blocked call.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Hook write adds > 5ms latency on cold SQLite | WAL mode already active; add a benchmark test; fire write as microtask (not awaited inline) if needed |
| Monitor HTTP server has no authentication (local-only assumption) | Documented known gap; tracked in a separate task. Not addressed in this plan. |
| Prebuilt better-sqlite3 binaries drift from current Node ABI | Use prebuild-install with graceful compile fallback. Maintenance process tracked separately. |
| `npx fulcrum-mcp` package name may already be taken on npm | Verify name availability before publishing; have `@fulcrum/mcp` as fallback. |
| `process.on('exit')` cleanup doesn't fire on SIGKILL | Document as best-effort; no reliable cross-platform fix for SIGKILL. |
| Feature 7 doctor gate may hang if `fulcrum doctor --json` hangs | Add `timeout` option to `spawnSync` (e.g., 30 seconds). |
| m052 ALTER TABLE on large `memories` table may be slow | SQLite ALTER TABLE is O(1) for column addition; no table rewrite. Low risk. |
| Windows users attempt `npx fulcrum-mcp`; `node-gyp` fallback requires MSVC build tools not installed by default | Declare Windows out of scope at launch with a startup check (`process.platform === 'win32'` → clear error message), or add Windows x64 prebuilds. Defer to a tracked follow-up; document the scope boundary in `docs/guides/installation.md`. |
| Seed idempotency guard (Unit 4) is check-then-insert with no DB uniqueness enforcement; concurrent setup runs can produce duplicate seed rows | Use `INSERT OR IGNORE` against a unique constraint (unique tag `fulcrum:setup-seed` or dedicated column) — not a SELECT-then-INSERT. Follows existing `INSERT OR IGNORE` pattern already established in the codebase. |
| `fulcrum-mcp` npm publish has no defined process; missing `publishConfig`, account rights, and publish gating create a blocking prereq | Add `"publishConfig": { "access": "public" }` to `packages/fulcrum-mcp/package.json`; verify account rights to the package name before implementation; decide on manual vs automated publish. "Manual first publish, automation deferred" closes the gap. |
| Silent hook write failures (disk full, locked DB, migration error) have no in-band observability path until the deferred `hook_active` PR ships | Add a `fulcrum doctor` check `Hook events writable` as a Unit 1 deliverable: test INSERT + immediate DELETE on `hook_events`, report `warn` on failure. Uses existing doctor infrastructure; does not depend on the deferred `hook_active` field. |

## Documentation / Operational Notes

- `docs/guides/installation.md`: Add "npx (quick start)" as the primary install path once Unit 7 ships. Keep the existing monorepo install as "development install".
- `agent-integration/claude/CLAUDE.md`: Updated automatically by the generator (Unit 3). No manual updates needed after this plan ships.
- New env vars to document in `docs/guides/configuration.md`:
  - `FULCRUM_NO_MONITOR` (Unit 6) — skip monitor auto-start
  - `FULCRUM_MONITOR_PORT` (Unit 6) — monitor port override, default 4721
  - `FULCRUM_SETUP_NO_GATE` (Unit 4) — skip doctor gate in setup
  - These should be included in the CLAUDE.md generator output (extend Unit 3 to cover them)

## Sources & References

- **Origin document:** [docs/brainstorms/2026-04-15-fulcrum-ux-requirements.md](docs/brainstorms/2026-04-15-fulcrum-ux-requirements.md)
- Hook architecture: `packages/cli/src/hooks.ts`
- Run completion memory write: `packages/core/src/runs.ts`, `packages/core/src/memory-insert.ts`
- Migration pattern: `packages/core/src/db/migrations/m050.ts`
- MCP server entry: `packages/cli/src/mcp-server.ts`
- MCP tools: `packages/cli/src/mcp-tools.ts`
- Monitor status endpoint: `packages/monitor/src/server.ts`
- Install system: `agent-integration/install.ts`
- CLAUDE.md generation: `scripts/gen-claude-md.ts`, `agent-integration/claude/CLAUDE.md`
- kuzu lazy import: `packages/memory/src/kuzu/client.ts`
- Dynamic import pattern: `packages/core/src/index.ts` line 138
