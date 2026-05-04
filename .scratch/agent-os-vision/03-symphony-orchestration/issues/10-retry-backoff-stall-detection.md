---
Status: completed
Triage: AFK
Pillar: 03-symphony-orchestration
Blocked-by: none
Owner: claude-worker-p3-retry-stall
---

# Retry/backoff formula + stall detection engine

## Parent
PRD: `.scratch/agent-os-vision/prds/03-symphony-orchestration.md`

## What to build
Implement `src/orchestration/symphony/retry.ts`:
- `calcRetryDelay(attempt, maxMs)` — `min(10000 * 2^(attempt-1), maxMs)` — pure function, no side effects.
- `scheduleRetry(run, error)` — sets `symphony_state='retry_queued'`, writes `next_retry_at = NOW() + calcRetryDelay(attempt_count+1, max_retry_backoff_ms)`, increments `attempt_count`, sets `last_error_kind`, emits `events` row.
- Stall detection in `src/orchestration/symphony/stall.ts`: `scanForStalledRuns(orgId)` queries `agent_runs_stall_scan` index for runs where `started_at < NOW() - stall_timeout_ms`; calls `scheduleRetry` for each; runs on a 30s in-memory setInterval inside the orchestrator.

## Acceptance criteria
- [x] Schema / state machine: `next_retry_at`, `attempt_count`, `last_error_kind` updated correctly; stalled run transitions to `retry_queued`
- [x] Tracker adapter: N/A
- [x] Dispatch loop / hooks: stall scanner wired to orchestrator's secondary timer loop (slice 13)
- [x] Surfaces (web/cli/tui parity): retry schedule visible in Web run detail; `fulcrum symphony runs show --json` includes `nextRetryAt`, `attemptCount`
- [x] Tests: parameterized table test — attempt 1 → 10000ms, attempt 4 → 80000ms, attempt 10 → capped at `maxMs`; stall detection fires within 100ms of crossing `stall_timeout_ms` with mocked clock; `events` table has `state_changed running→retry_queued` row
- [x] SPEC conformance traced in `docs/symphony-conformance.md`: §Retry §Backoff formula mapped to `retry.ts:calcRetryDelay`

## Blocked by
None. `03-schema-agent-runs-symphony-columns` exists in runtime migrations; product-kernel base schema also now exposes retry fields for web run detail rows.

## Implementation log
2026-05-02 — Implemented. Linkage chain preserved: `MASTER-PLAN.md -> COVERAGE.md -> TASK-DAG.md -> TASK-BUNDLES.md -> this issue`.

Built:
- `src/orchestration/symphony/retry.ts` with exact capped exponential delay, CAS retry scheduling, retry metadata update, and `state_changed` event emission only when update wins.
- `src/orchestration/symphony/stall.ts` with org-scoped stalled-run scan and non-overlapping 30s scanner handle.
- CLI/web run detail retry metadata plumbing.
- Product-kernel base schema retry columns for fresh and existing local DBs.
- SPEC conformance mapping for retry queue + backoff formula.

Verification:
- PASS `bun test tests/orchestration/retry.test.ts tests/orchestration/stall.test.ts tests/cli/symphony.test.ts 'src/web/src/routes/runs/[id]/page.server.test.ts' 'src/web/src/routes/runs/[id]/page.svelte.test.ts' tests/symphony/prompt.test.ts tests/symphony/schemas.test.ts src/product-kernel/db/migrate.test.ts` — 55 pass, 0 fail.
- PASS `bun run lint`.
- PASS `bun run compress --check`.
- BROAD SUITE CAVEAT `bun test` attempted — 1817 pass, 2 skip, 6 fail, 2 errors. Failures are pre-existing/unrelated wide-suite environment/spec-lock issues: Rust inference sidecar health timeout, missing `vendor/openai-symphony/SPEC.md`, missing web optional packages `mode-watcher`, `formsnap`, and `runed`.

2026-05-02 fixback — Product-kernel/API/reliability review blockers resolved. Linkage chain preserved: `MASTER-PLAN.md -> COVERAGE.md -> TASK-DAG.md -> TASK-BUNDLES.md -> this issue`.

Fixback:
- Restored `0001_product_kernel.sql` baseline compatibility and added forward migration `0004_agent_runs_retry_stall.sql` for old baseline-applied DBs.
- Started stall scanner through the Symphony orchestrator lifecycle and wired `fulcrum web` shutdown to stop it.
- Enforced `maxAttempts`: exhausted retries move to terminal `failed`, clear `nextRetryAt`, persist `lastErrorKind`, and emit `state_changed`.
- Added scanner timeout handling so hung scans do not block later ticks.
- Added default scanner error logging when no `onError` handler is supplied.
- Added Casbin action mappings for orchestration procedure leaves used by CLI/web/API callers.
- Preserved omitted `max_retry_backoff_ms` compatibility at `300000` (5m); explicit override support remains pinned via schema and prompt config tests.

## Notes
Formula is exact per SPEC.md §Retry REQUIRED. Max cap `max_retry_backoff_ms` comes from `WORKFLOW.md` config; omitted-field compatibility default is 300000ms (5 min). Stall timeout default 300000ms (5 min) per PRD.
