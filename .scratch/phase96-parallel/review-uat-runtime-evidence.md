# Phase 9.6 — Review/UAT/Runtime Hardening Slice Evidence

**Date:** 2026-05-17
**Branch:** mo/copy-first-agpl-replacement
**Slice scope:** ReviewWorkbench inline annotation, AI streaming, E2E visibility, feedback loop hardening

## Changes Made

### 1. Interactive Inline Annotation Selection (W5/W12)

**File:** `apps/web/src/lib/components/review/ReviewWorkbench.svelte`

- Multi-line selection via shift+click or mouse drag across diff lines
- Visual highlight (primary/15 ring) on selected range
- Annotation draft auto-populates with line range from selection
- Click annotation in sidebar → scrolls to line in diff pane with yellow highlight flash
- Annotations rendered as clickable buttons with L{start}-{end} line indicators
- Cancel clears selection state

### 2. Live AI/Agent Review Session Streaming (W5/W12)

**File:** `apps/web/src/lib/components/review/ReviewWorkbench.svelte`

- AI tab upgraded from static placeholder to live streaming UI
- EventSource SSE connection via `aiStreamUrl` prop
- Message history with user/assistant roles
- Streaming indicator (green pulse dot)
- Context-aware: sends selected file path and line range with AI queries
- Stop button to cancel in-flight stream
- Enter-to-send, shift+enter for newline
- `onAskAi` callback with context object for server integration

### 3. Generated E2E Run Visibility (W13)

**Files:**
- `apps/web/src/routes/projects/[id]/e2e/+page.server.ts` — loads run history on page load
- `apps/web/src/routes/projects/[id]/e2e/+page.svelte` — run history table with status indicators
- `services/planning-review/src/application/reports/generated-e2e-run-actions.ts` — `listGeneratedE2eRunHistory` function
- `services/planning-review/src/interface/project-review-reports.ts` — interface export
- `services/workflow-coordination/src/interface/http/workflow-api-client.ts` — `listGeneratedE2eRuns` API method

Run history table shows: time, status (color-coded), runner, test count, exit code, trace ID.

### 4. Runtime Feedback Loop Hardening (W10)

**Files:**
- `services/execution-orchestration/src/application/automated-feedback-loop.ts`
- `services/work-management/src/application/tasks/schema.ts`

Additions:
- Per-iteration timeout (`iterationTimeoutMs`, default 5 min) via `withTimeout` wrapper
- Stale run detection (`staleThresholdMs`, default 10 min) — if no progress between iterations, loop terminates
- Cancellation signal propagation (`signal: AbortSignal`) — checked each iteration
- New stop reasons: `cancelled`, `iteration_timeout`, `stale_run_detected`
- Zod schemas updated for new input/output fields
- tRPC contract updated (schema enum widened)

## Verification Evidence

### Typecheck
```
bun run --bun tsc --noEmit → exit 0
```

### Focused Tests — All Green
```
review-workbench-session-actions.integration.test.ts → 2 pass, 21 assertions
final-qa-actions.integration.test.ts → 2 pass, 12 assertions
automated-feedback-loop.integration.test.ts → 4 pass, 25 assertions
symphony-conformance.test.ts → 91 pass, 223 assertions
uat-decision-actions + uat-handoff-actions + final-qa-feedback-gate → 10 pass, 73 assertions
workflow-end-to-end.test.ts → 3 pass, 29 assertions
web:test → 32 files, 200 tests pass
```

### ORM Boundary Scan
```
rg "typeorm|EntityManager|..." apps/web/src/lib/components/review/ → no matches
rg "typeorm|EntityManager|..." apps/web/src/routes/projects/[id]/e2e/ → no matches
```

### Pre-existing Issues (Not This Slice)
- `web:build` has 5 unresolved `project-request-scope` imports in PM routes (modules, gantt, intake, backlog, calendar, sprints) — outside scope; marked soft-fail in CI config.
- `pm-structure.ts` spread type issue — pre-existing, not modified by this slice.

## Exit Criteria Assessment

| Criterion | Status |
|---|---|
| QA/review → UAT/code review → generated real-data E2E path proven | ✓ workflow-end-to-end.test.ts passes |
| Runtime logic in planning-review/execution-orchestration/workflow-coordination | ✓ all changes in correct services |
| Web routes/components are visualization/invocation only | ✓ no ORM/business logic in web layer |
| Focused runtime/review tests green | ✓ 112 pass across 8 test files |
| No global Phase 9.6 closure claim | ✓ slice status only |

## Remaining After This Slice

- Live AI stream backend endpoint (service-side SSE handler) — needs planning-review HTTP route
- Inline annotation selection Playwright E2E coverage — E2E spec has structural tests, lacks interaction-level coverage for drag selection
- Run history re-run button (trigger re-run from history row)
- Pre-existing PM route build errors need separate fix (out of scope)
