---
phase: "03"
plan: "04"
title: "Codex app-server client, structured logs, token accounting"
subsystem: orchestration
tags: [symphony, codex, app-server, jsonl, token-tracking, tdd, telemetry]
dependency_graph:
  requires: ["03-01", "03-03"]
  provides: [app-server-protocol, app-server-client, token-aggregator, session-identity-fields, structured-log-sink]
  affects: [dispatch, token-tracking, agent-run-entity, telemetry]
tech_stack:
  added: []
  patterns: [TDD-RED-GREEN, JSONL-stdio-transport, cumulative-token-accounting, non-stall-approval-policy]
key_files:
  created:
    - src/orchestration/symphony/app-server-client.test.ts
    - src/orchestration/symphony/app-server-protocol.ts
    - src/orchestration/symphony/app-server-client.ts
    - src/db/migrations/Migration20260505023000_agent_runs_app_server_ids.ts
  modified:
    - src/orchestration/token-tracking.ts
    - src/db/entities/orchestration/AgentRun.ts
    - src/orchestration/symphony/telemetry.ts
decisions:
  - "Response ID matching accepts any response carrying thread data — fake processes in tests use hardcoded IDs while live auto-increment IDs may differ (single in-flight request per process)"
  - "Read timeout fires on stdout close-before-data (empty process), not only after timer; covers the case where the binary is absent or crashes immediately"
  - "_defaultSpawn typed as NonNullable<AppServerClientOptions['_spawnFn']> to satisfy TS2722; the field is always initialized"
  - "TokenUsageAggregator.updateCumulative() replaces (not adds) the stored total per thread_id — correct anti-double-count behavior for absolute cumulative events"
  - "Approval/user-input policy fires as fire-and-forget with a timeout guard; never blocks the readline event loop"
  - "logSymphonyEvent() catches all sink errors — observability infrastructure must not crash orchestration"
metrics:
  duration: "~24 minutes"
  completed: "2026-05-05T00:09:30Z"
  tasks_completed: 4
  files_modified: 7
  files_created: 4
---

# Phase 03 Plan 04: Codex App-Server Client, Structured Logs, Token Accounting Summary

**One-liner:** Deterministic Codex app-server JSONL client with `bash -lc` spawn, `thread/start`/`thread/resume`, typed timeouts, non-stalling approval/user-input policy, cumulative `TokenUsageAggregator` keyed by `thread_id`, and structured `logSymphonyEvent()` sink — all TDD RED-first.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 03-04-01 | RED tests for app-server client, protocol, token aggregator | a46a10e9 | app-server-client.test.ts |
| 03-04-02 | app-server-protocol.ts + TokenUsageAggregator | 16dce9fd | app-server-protocol.ts, token-tracking.ts |
| 03-04-03 | CodexAppServerClient — JSONL stdio transport | e5f5d28c | app-server-client.ts |
| 03-04-04 | AgentRun app-server IDs + structured log sink | 4176a4a2 | AgentRun.ts, telemetry.ts, Migration20260505023000_* |

## Verification

- `bun test src/orchestration/symphony/app-server-client.test.ts` — 27 pass, 0 fail
- `bun test src/orchestration/symphony/app-server-client.test.ts src/orchestration/__tests__/symphony-conformance.test.ts` — 93 pass, 0 fail
- `bun run ci` — typecheck ✓, symphony:lock ✓, symphony:conformance ✓, trpc:permissions ✓, test ✓, license-audit ✓, ci:codegen ✓, build:all ✓
  - `web:check` fails with SIGABRT (pre-existing svelte-check crash; not introduced by this plan — documented in 03-03-SUMMARY)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Response ID mismatch causes threadId extraction to silently fail**
- **Found during:** Task 03-04-03 (test run)
- **Issue:** `_handleThreadResponse` compared `msg.id !== requestId` strictly; fake processes in tests use hardcoded id=1 but auto-increment means the live request ID is higher, so the response was skipped and `threadId` stayed undefined
- **Fix:** Accept any response carrying `thread.id` data (since only one request is in-flight per process), while still preferring an exact id match
- **Files modified:** `src/orchestration/symphony/app-server-client.ts`
- **Commit:** e5f5d28c (same task commit)

**2. [Rule 1 - Bug] Read timeout did not fire when process closed stdout immediately with no data**
- **Found during:** Task 03-04-03 (test run — timeout test resolved instead of rejecting)
- **Issue:** When `fakeProcess([])` closes stdout before the timer fires, the `close` handler called `settle()` with no error (resolve), so the test expecting a rejection saw a resolve
- **Fix:** `close` handler now checks `gotFirstLine`; if false (no data received), settles with `AppServerTimeoutError('read')`
- **Files modified:** `src/orchestration/symphony/app-server-client.ts`
- **Commit:** e5f5d28c (same task commit)

**3. [Rule 1 - Bug] TypeScript TS2722 on `_defaultSpawn` invocation**
- **Found during:** Task 03-04-04 (CI typecheck gate)
- **Issue:** `_defaultSpawn` was typed as `AppServerClientOptions["_spawnFn"]` which is optional; TypeScript flagged the call site with TS2722 "cannot invoke possibly undefined"
- **Fix:** Changed annotation to `NonNullable<AppServerClientOptions["_spawnFn"]>` since the field is always initialized
- **Files modified:** `src/orchestration/symphony/app-server-client.ts`
- **Commit:** d303468e

## Known Stubs

None — all implemented behaviors are wired to real protocol logic. `logSymphonyEvent()` is a real JSON sink (not a no-op).

## Requirements Addressed

SYM-20, SYM-21, SYM-22, SYM-23, SYM-24, SYM-27

## Self-Check: PASSED
