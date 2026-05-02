---
Status: in-progress
Triage: AFK
Owner: codex-orchestrator
Pillar: 03-symphony-orchestration
Blocked-by: 03-schema-agent-runs-symphony-columns
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
- [ ] Schema / state machine: `next_retry_at`, `attempt_count`, `last_error_kind` updated correctly; stalled run transitions to `retry_queued`
- [ ] Tracker adapter: N/A
- [ ] Dispatch loop / hooks: stall scanner wired to orchestrator's secondary timer loop (slice 13)
- [ ] Surfaces (web/cli/tui parity): retry schedule visible in Web run detail; `fulcrum symphony runs show --json` includes `nextRetryAt`, `attemptCount`
- [ ] Tests: parameterized table test — attempt 1 → 10000ms, attempt 4 → 80000ms, attempt 10 → capped at `maxMs`; stall detection fires within 100ms of crossing `stall_timeout_ms` with mocked clock; `events` table has `state_changed running→retry_queued` row
- [ ] SPEC conformance traced in `docs/symphony-conformance.md`: §Retry §Backoff formula mapped to `retry.ts:calcRetryDelay`

## Blocked by
03-schema-agent-runs-symphony-columns

## Notes
Formula is exact per SPEC.md §Retry REQUIRED. Max cap `max_retry_backoff_ms` comes from `WORKFLOW.md` config, default 3600000 (1h). Stall timeout default 300000ms (5 min) per PRD.
