---
phase: "03"
plan: "06"
title: "HTTP extension and Web/CLI/TUI dispatch parity"
subsystem: orchestration
tags: [symphony, http-extension, dispatch, tdd, trpc, cli, tui, web, SYM-25, SND-06]
dependency_graph:
  requires: ["03-01", "03-02", "03-03", "03-04", "03-05"]
  provides: [http-server-loopback, dispatchRun-trpc, cli-dispatch, tui-dispatch, web-dispatch]
  affects: [orchestration-router, cli-symphony, tui-orchestration, web-orchestration]
tech_stack:
  added: []
  patterns: [TDD-RED-GREEN, loopback-bind-default, dispatchRun-MikroORM, sandboxMode-host-alias]
key_files:
  created:
    - src/orchestration/symphony/http-server.ts
  modified:
    - src/orchestration/__tests__/symphony-conformance.test.ts
    - src/trpc/routers/orchestration.ts
    - src/cli/symphony.ts
    - src/cli/symphony.test.ts
    - src/tui/screens/orchestration.ts
    - src/web/src/routes/orchestration/+page.server.ts
decisions:
  - "HTTP server binds 127.0.0.1 by default; port:0 = ephemeral; wraps createHttpApiRoutes from product-kernel/symphony/http-api.ts"
  - "dispatchRun creates AgentRun via MikroORM EM (ARCH-12); defaults agentName=codex, sandboxMode=host (DB) / noSandbox (API)"
  - "sandboxMode 'noSandbox' is human-facing alias for DB value 'host' — check constraint allows host/docker/podman only"
  - "CLI symphony.ts SymphonyCaller gets dispatchRun as required method; stub updated in symphony.test.ts"
  - "TUI OrchestrationScreen.dispatch() is optional in caller interface — preserves existing screens without breaking changes"
  - "Web dispatch action imports tRPC local caller; no new raw SQL path (ARCH-09/ARCH-12)"
  - "web:check SIGABRT is pre-existing svelte-check OOM crash; not introduced by this plan"
metrics:
  duration: "~25 minutes"
  completed: "2026-05-05T00:45:00Z"
  tasks_completed: 6
  files_modified: 6
  files_created: 1
---

# Phase 03 Plan 06: HTTP Extension and Web/CLI/TUI Dispatch Parity Summary

**One-liner:** Symphony HTTP extension server binds loopback by default with all spec routes; `dispatchRun` tRPC procedure creates AgentRun via MikroORM; CLI `runs dispatch`, TUI `dispatch()`, and Web `dispatch` action all route through canonical tRPC path — all TDD RED-first.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 03-06-01 | RED tests — HTTP server, dispatchRun, CLI/TUI/Web dispatch | 9480aa69 | symphony-conformance.test.ts (+280 lines) |
| 03-06-02 | HTTP server with loopback bind | 5b1f44ca | http-server.ts (created) |
| 03-06-03 | tRPC dispatchRun procedure | cc30b1c5 | orchestration.ts |
| 03-06-04+05 | CLI, TUI, Web dispatch parity | ce26fe14 | symphony.ts, orchestration.ts (TUI), +page.server.ts |
| 03-06-06 (fix) | TypeScript errors from dispatchRun/http-server | 7222f639 | symphony-conformance.test.ts, http-server.ts, symphony.test.ts |

## Verification

- `bun test src/orchestration/__tests__/symphony-conformance.test.ts` — 80 pass, 0 fail
- `bun test src/trpc/routers/orchestration.test.ts` — 8 pass, 0 fail
- `bun test src/cli/symphony.test.ts` — 17 pass, 0 fail
- `bun test src/web/src/routes/orchestration/page.server.test.ts` — 4 pass, 0 fail
- `bun run ci` — typecheck ✓, symphony:lock ✓, symphony:conformance ✓, trpc:permissions ✓, test ✓, license-audit ✓, ci:codegen ✓, build:all ✓
  - `web:check` fails with SIGABRT (pre-existing svelte-check OOM crash; documented in 03-01 through 03-05 SUMMARYs — not introduced by this plan)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] sandboxMode 'noSandbox' violates DB check constraint**
- **Found during:** Task 03-06-03 (dispatchRun test failure)
- **Issue:** DB constraint on `agent_runs.sandbox_mode` only allows `host | docker | podman`; D-12 calls the default "noSandbox" but the DB enum uses "host" for that concept
- **Fix:** Map `noSandbox` -> `host` in dispatchRun before persisting; return `noSandbox` in API response for human-readable parity
- **Files modified:** `src/trpc/routers/orchestration.ts`
- **Commit:** cc30b1c5 (same task commit)

**2. [Rule 2 - Missing critical functionality] symphony.test.ts stubCaller missing dispatchRun**
- **Found during:** Task 03-06-06 typecheck
- **Issue:** `SymphonyCaller` now requires `dispatchRun` but test stub didn't include it; tsc error
- **Fix:** Added `dispatchRun` stub to `stubCaller()` in `symphony.test.ts`
- **Files modified:** `src/cli/symphony.test.ts`
- **Commit:** 7222f639

**3. [Rule 1 - Bug] Bun `server.hostname` and `server.port` may be undefined per types**
- **Found during:** Task 03-06-06 typecheck
- **Issue:** TypeScript strict: `server.hostname` and `server.port` returned `string | undefined` / `number | undefined`
- **Fix:** Fallback to input values (`host`, `port`) in return statement
- **Files modified:** `src/orchestration/symphony/http-server.ts`
- **Commit:** 7222f639

**4. [Rule 1 - Bug] Conformance test router cast used incompatible double-cast**
- **Found during:** Task 03-06-06 typecheck
- **Issue:** `as Record<string, ...>` cast on tRPC router caused TS2352 overlap error
- **Fix:** Changed to `as unknown as { _def: ... }` pattern; used typed dispatchRun access
- **Files modified:** `src/orchestration/__tests__/symphony-conformance.test.ts`
- **Commit:** 7222f639

## Known Stubs

None — all implemented behaviors are wired to real logic.

## Threat Surface Scan

| Flag | File | Description |
|------|------|-------------|
| threat_flag: http-bind | src/orchestration/symphony/http-server.ts | New HTTP server binds 127.0.0.1 by default — loopback only per T-03-16 mitigation. Caller must not expose to public network. |

## Requirements Addressed

SYM-22, SYM-24, SYM-25, SYM-26, SND-06

## Self-Check: PASSED
