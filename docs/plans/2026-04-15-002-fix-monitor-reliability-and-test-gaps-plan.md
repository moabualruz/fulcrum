---
title: Fix Monitor Reliability, Test Gaps, and Housekeeping
id: 2026-04-15-002
status: completed
created: 2026-04-15
tags: [reliability, testing, cli, monitor, housekeeping]
---

# Fix Monitor Reliability, Test Gaps, and Housekeeping

## Problem Frame

The `ce:review` audit found three categories of outstanding work in the `packages/cli` and `scripts/` areas:

1. **Tautological tests** — `serve-mcp-monitor.test.ts` never exercises real functions. Every test provides its own mock handler to `makeConnectedPair(handler)`, so `probeMonitor`, `buildCurrentContextResponse`, and the `_monitorStarted` flag are never actually called. The `fulcrum-mcp` argv injection test doesn't test argv injection at all.
2. **Real reliability bugs** — the monitor auto-start catches errors silently without a recovery hint; `_monitorStarted` stays `false` after an error, enabling retry loops on the next invocation; no synchronous `process.on('exit')` cleanup runs when a direct `process.exit()` is called.
3. **Correctness gaps** — `spliceSection` corrupts CLAUDE.md when markers are inverted (appends duplicate markers instead of returning original); `suggested_next_call` is unconditionally hardcoded.

Housekeeping: `docs/brainstorms/` and `docs/ideation/` exist on disk but are untracked; `.claude/worktrees/agent-ae556031` is deleted on disk but tracked by git.

## Scope Boundaries

- Do NOT rewrite `buildCurrentContextResponse` — the shared-builder architecture from GAP-MCP-11 is correct; only add test exports.
- Do NOT change the monitor HTTP server implementation (`fulcrum-monitor`).
- Do NOT change JSON-RPC wire protocol or MCP tool schemas.
- `spliceSection` fix is a 2-line guard change only.
- `suggested_next_call` heuristic should be simple and fast — no new database queries.

## Confirmed Bugs (from code inspection)

| # | File | Bug | Evidence |
|---|------|-----|---------|
| 1 | `scripts/gen-claude-md.ts:47` | `spliceSection` appends duplicate markers when END precedes START (should `return original`) | Line 47: `return original.trimEnd() + '\n\n' + START_MARKER + ...` inside `endIdx < startIdx` branch |
| 2 | `packages/cli/src/index.ts:1084-1087` | EADDRINUSE error message gives no recovery hint | Error log: `Monitor auto-start failed (non-fatal): ${err.message}` — no mention of `FULCRUM_MONITOR_PORT` or `FULCRUM_NO_MONITOR` |
| 3 | `packages/cli/src/index.ts:1081` | `_monitorStarted` stays `false` after error — retry-hammer risk on next `runServeMcp()` call | Flag set only inside `try`, not in `catch` |
| 4 | `packages/cli/src/index.ts:629` | `suggested_next_call` hardcoded to `mcp__fulcrum__list_tasks` regardless of workspace state | Literal string at line 629 |
| 5 | `packages/cli/src/index.ts:663-680` | Only SIGTERM/SIGINT handlers stop the monitor — synchronous `process.exit()` bypasses them, leaking ports | No `process.on('exit', ...)` handler |

## Confirmed Non-Bugs (false positives closed)

| Finding | Verdict | Evidence |
|---------|---------|---------|
| `parseInt(FULCRUM_MONITOR_PORT)` passes NaN | Not a bug — `|| 4721` coerces NaN to 4721 | Line 1075: `parseInt(...) \|\| 4721` |
| `resp.ok` passes 4xx as true | Not a bug — Fetch API `.ok` is `status >= 200 && status < 300` | `probeMonitor` line 599 |
| Duplicated `get_current_context` handler | Not a bug — both paths call `buildCurrentContextResponse()` | Lines 618-631 (shared builder) |
| `writeSeedData` empty projectId | Not a bug — `if (workspaceId && projectId)` correctly rejects empty string | `agent-integration/install.ts` |

## Deferred to Implementation

- Whether `suggested_next_call` should query the DB or use a lightweight heuristic (e.g., env state, recent context). Prefer the simplest thing: check `listTasks` count in the already-loaded DB.
- Whether to add a `scripts/gen-claude-md.test.ts` or co-locate tests inside the existing vitest config — check `vitest.config.ts` at the root.

---

## Implementation Units

### Unit 1 — Export test helpers from index.ts + rewrite monitor tests

**Goal:** Make `probeMonitor` directly testable by exporting it (along with cache-reset and state-set helpers), then rewrite `serve-mcp-monitor.test.ts` to exercise real code.

**Files:**
- `packages/cli/src/index.ts` (add exports)
- `packages/cli/src/tests/serve-mcp-monitor.test.ts` (full rewrite)

**Approach:**
Add three test helper exports near the existing private state block (lines 582-603):

```typescript
// Test helpers — not part of the public CLI surface
export async function probeMonitorForTest(url: string): Promise<boolean> {
  return probeMonitor(url)
}
export function _resetMonitorProbeCache(): void {
  _monitorProbeCache.clear()
}
export function _setMonitorStarted(val: boolean): void {
  _monitorStarted = val
}
```

Rewrite `serve-mcp-monitor.test.ts` to import these helpers and exercise real code:

1. Import `probeMonitorForTest` + `_resetMonitorProbeCache` via `vi.importActual` (or dynamic import after `vi.stubGlobal`).
2. Each test: stub `fetch` globally → `_resetMonitorProbeCache()` → call `probeMonitorForTest(url)` → assert result.
3. TTL cache: first call returns true, advance fake timer to 0ms (within TTL) → second call should NOT re-fetch; advance 16s → third call should re-fetch.
4. `_monitorStarted` guard: use `_setMonitorStarted(true)` to simulate already-started state, then verify the MCP start path via a subprocess-style invocation does not call `startMonitorServer` again.
5. `FULCRUM_MONITOR_PORT` test: use real `buildCurrentContextResponse` (via the MCP tool handler), not a mock handler — assert the URL in the response matches the env var.

**Patterns to follow:** `packages/cli/src/tests/serve-mcp-monitor.test.ts` (existing structure), `packages/core/src/tests/*.test.ts` for vi.stubGlobal + vi.resetModules patterns.

**Execution note:** Test-first — write the failing tests against the missing exports first, then add the exports to make them pass.

**Test scenarios:**
- `probeMonitorForTest('http://localhost:X')` with `fetch` returning `{ ok: true }` → `true`
- `probeMonitorForTest(url)` with `fetch` throwing `ECONNREFUSED` → `false`
- `probeMonitorForTest(url)` with `fetch` returning `{ ok: false, status: 404 }` → `false`
- Cache hit: call twice with same URL within 15s, fetch called exactly once
- Cache miss: call twice, advance 16s between, fetch called twice
- `_resetMonitorProbeCache()` clears cache so next call fetches fresh
- `_setMonitorStarted(true)` + `runServeMcp` invocation → `startMonitorServer` not called

**Verification:** `cd packages/cli && pnpm test` — all 7 new probeMonitor tests pass; no tautological test assertions remain (review that assertions actually fail when implementation is broken).

---

### Unit 2 — Fix _monitorStarted error path + process.exit cleanup

**Goal:** Prevent retry-hammer on EADDRINUSE; add synchronous port cleanup on process.exit; improve error message.

**Files:**
- `packages/cli/src/index.ts` (3 changes)

**Approach:**

Change 1 — Set `_monitorStarted = true` in catch block (lines 1084-1087):
```typescript
} catch (err) {
  _monitorStarted = true  // prevent retry on next runServeMcp() call
  const hint = err instanceof Error && err.message.includes('EADDRINUSE')
    ? ' (port in use — set FULCRUM_MONITOR_PORT or FULCRUM_NO_MONITOR=1)'
    : ''
  process.stderr.write(`[fulcrum] Monitor auto-start failed (non-fatal): ${(err as Error).message}${hint}\n`)
}
```

Change 2 — Add `process.on('exit', ...)` synchronous cleanup alongside existing SIGTERM/SIGINT handlers (inside or after `registerOtelShutdown`, line 663):
```typescript
process.on('exit', () => {
  try { _monitorServer?.stop() } catch { /* best-effort */ }
})
```

Change 3 — Ensure `_monitorServer` is set to `null` when stop is called (already present in SIGTERM handler — verify).

**Patterns to follow:** Existing `registerOtelShutdown()` at line 663.

**Test scenarios:**
- Mock `startMonitorServer` to throw `EADDRINUSE` → `_monitorStarted` is `true` after catch
- Error message includes recovery hint
- A second call to `runServeMcp` after failure does NOT call `startMonitorServer` again
- `process.on('exit')` handler calls `_monitorServer.stop()` when `_monitorServer` is non-null

**Verification:** `cd packages/cli && pnpm test` — new reliability tests pass; unit tests for error path behavior pass.

---

### Unit 3 — Fix spliceSection inverted-markers bug

**Goal:** `spliceSection` should return `original` unchanged (no-op) when END marker precedes START marker — same behavior as `spliceToolCount`.

**Files:**
- `scripts/gen-claude-md.ts` (1-line fix)
- `scripts/gen-claude-md.test.ts` (new test file)

**Approach:**

`spliceSection` has two separate guard cases to handle differently:
- **Both markers absent** (`startIdx === -1 && endIdx === -1`) → append at end (correct first-run behavior — CLAUDE.md has no markers yet)
- **One marker missing or inverted** → return `original` unchanged (the bug case that corrupts files)

Fix (lines 45-47): split the single condition into two:
```typescript
if (startIdx === -1 && endIdx === -1) {
  // First run — no markers yet, append the generated section
  return original.trimEnd() + '\n\n' + START_MARKER + '\n\n' + generated + '\n\n' + END_MARKER + '\n'
}
if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
  // One marker missing or inverted — don't corrupt, return unchanged
  return original
}
```

For tests: check vitest root config to see if `scripts/` is included. If not, add `scripts/` to the include list, or create a standalone test. Pattern: `packages/core/src/tests/*.test.ts`.

**Test scenarios for `spliceSection`:**
- Happy path: markers present in order → content between markers is replaced
- Both markers absent (first run) → appends `START_MARKER…generated…END_MARKER` at end
- Only START marker present (no END) → returns `original` unchanged
- Only END marker present (no START) → returns `original` unchanged
- END precedes START (inverted) → returns `original` unchanged (the fixed bug)
- Consecutive calls on same file → idempotent (second call replaces, not appends)

**Test scenarios for `spliceToolCount`:**
- Happy path: both markers present in order → count line is replaced
- Missing markers → returns `original` (already correct, add regression test)
- Inverted → returns `original` (already correct, add regression test)

**Verification:** `pnpm test` at root includes the script tests; all spliceSection/spliceToolCount cases pass.

---

### Unit 4 — Add fulcrum-mcp argv injection test

**Goal:** Verify that `packages/fulcrum-mcp/src/index.ts` injects `['serve', 'mcp']` into `process.argv` before delegating.

**Files:**
- `packages/fulcrum-mcp/src/tests/index.test.ts` (add test)

**Approach:**

The existing tests check `package.json` fields only. Add a test that:
1. Saves `process.argv`
2. Sets `process.argv = ['node', '/fulcrum-mcp/src/index.ts']`
3. Mocks `fulcrum-cli` with `vi.mock('fulcrum-cli', () => ({}))` to prevent actual CLI boot
4. Uses `vi.resetModules()` before import to get a fresh module
5. Dynamically imports `'../index.js'`
6. Asserts `process.argv[2] === 'serve'` and `process.argv[3] === 'mcp'`
7. Restores `process.argv`

ESM note: `vi.mock` hoisting works with `vi.resetModules()`. The import must be dynamic (not top-level) for the mock to take effect.

**Test scenarios:**
- Clean argv `['node', 'path']` → after import, argv is `['node', 'path', 'serve', 'mcp']`
- Existing args `['node', 'path', '--no-monitor']` → argv becomes `['node', 'path', 'serve', 'mcp', '--no-monitor']` (splice inserts at index 2)

**Verification:** `cd packages/fulcrum-mcp && pnpm test` — new tests pass.

---

### Unit 5 — Context-aware suggested_next_call

**Goal:** Replace the hardcoded `'mcp__fulcrum__list_tasks'` with a lightweight heuristic that guides agents to the most useful next action.

**Files:**
- `packages/cli/src/index.ts` (modify `buildCurrentContextResponse`)

**Approach:**

After deriving `ids`, call `listTasks` with `workspace_id` and `limit: 1` to check if any tasks exist:
```typescript
let suggested_next_call = 'mcp__fulcrum__list_tasks'
try {
  const { listTasks } = await import('fulcrum-core')
  const tasks = listTasks({ workspace_id: ids.workspace_id, limit: 1 })
  if (tasks.length === 0) {
    suggested_next_call = 'mcp__fulcrum__create_task'
  } else {
    // tasks exist — list is the right starting point
    suggested_next_call = 'mcp__fulcrum__list_tasks'
  }
} catch {
  // DB not ready yet or no workspace — fall through to default
}
```

This is the simplest useful heuristic: empty workspace → guide to create; non-empty → guide to list. The DB call is bounded (LIMIT 1) and already in-process.

**Test scenarios:**
- No tasks in workspace → `suggested_next_call === 'mcp__fulcrum__create_task'`
- Tasks exist → `suggested_next_call === 'mcp__fulcrum__list_tasks'`
- DB error (e.g., not initialized) → falls back to `'mcp__fulcrum__list_tasks'`

**Verification:** `cd packages/cli && pnpm test` — new suggested_next_call tests pass; existing readiness shape tests still pass.

---

### Unit 6 — Housekeeping: commit untracked docs, stage worktree deletion

**Goal:** Clean up the untracked `docs/brainstorms/` and `docs/ideation/` directories, and stage the deletion of `.claude/worktrees/agent-ae556031`.

**Files:**
- `docs/brainstorms/` (stage for commit)
- `docs/ideation/` (stage for commit)
- `.claude/worktrees/agent-ae556031` (stage deletion)

**Approach:**
1. `git add docs/brainstorms/ docs/ideation/` — commit the requirements and ideation documents produced by this session's `ce:brainstorm` and `ce:ideate` runs
2. `git rm -r --cached .claude/worktrees/agent-ae556031` — stage the deletion of the worktree directory (it's already gone from disk, just not staged)
3. Commit as a single housekeeping commit: `chore: commit brainstorms/ideation docs, remove stale worktree ref`

**Verification:** `git status` shows no untracked files in `docs/brainstorms/` or `docs/ideation/`; `.claude/worktrees/agent-ae556031` shows as deleted and staged; clean `git diff --cached` before merge.

---

## Sequencing

```
Unit 6 (housekeeping — no code deps)   → can run immediately, independently
Unit 3 (spliceSection fix)             → small, no deps, do first among code units
Unit 1 (export test helpers + tests)   → largest unit, do before Unit 2
Unit 2 (error path + exit cleanup)     → depends on Unit 1 test harness
Unit 4 (fulcrum-mcp argv test)         → independent, do in parallel with Unit 2
Unit 5 (suggested_next_call)           → independent, last (smallest behavioral change)
```

Units 3, 4, and 6 are fully independent. Units 1 and 2 share the same file — do in order.

## Test File Summary

| File | Action |
|------|--------|
| `packages/cli/src/index.ts` | Add 3 test helper exports |
| `packages/cli/src/tests/serve-mcp-monitor.test.ts` | Rewrite to use real exports |
| `packages/fulcrum-mcp/src/tests/index.test.ts` | Add argv injection test |
| `scripts/gen-claude-md.ts` | Fix `spliceSection` inverted-markers guard |
| `scripts/gen-claude-md.test.ts` | New test file for splice helpers |

## Success Criteria

- [x] `probeMonitor` is tested with real fetch stubs, not mock handlers
- [x] `_monitorStarted` guard has at least one test exercising the real flag
- [x] `fulcrum-mcp` argv injection test exists and passes
- [x] `spliceSection` with inverted markers returns original (no file corruption)
- [x] `scripts/gen-claude-md.test.ts` covers all 4 marker combinations
- [x] Monitor EADDRINUSE error message includes recovery hint
- [x] `_monitorStarted = true` in catch block prevents retry on next invocation
- [x] `process.on('exit')` synchronous cleanup stops monitor port
- [x] `suggested_next_call` is `create_task` for empty workspace, `list_tasks` otherwise
- [x] `docs/brainstorms/` and `docs/ideation/` committed
- [x] `.claude/worktrees/agent-ae556031` deletion staged and committed
- [x] All existing tests still pass (1367 passing + 6 skipped across 101 test files)
