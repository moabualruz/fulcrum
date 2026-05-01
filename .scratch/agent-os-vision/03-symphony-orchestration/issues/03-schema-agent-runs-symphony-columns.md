---
Status: ready-for-agent
Triage: AFK
Pillar: 03-symphony-orchestration
Blocked-by: None
---

# Schema migration: agent_runs Symphony state columns + partial indexes

## Parent
PRD: `.scratch/agent-os-vision/prds/03-symphony-orchestration.md`

## What to build
Drizzle migration adding five columns to `agent_runs`: `symphony_state TEXT CHECK(…)`, `attempt_count INTEGER NOT NULL DEFAULT 0`, `next_retry_at TIMESTAMPTZ`, `workspace_path TEXT`, `last_error_kind TEXT`. Create three partial indexes: `agent_runs_claimed_unique` (unique on `task_id WHERE symphony_state='claimed'`), `agent_runs_dispatch_poll` (`org_id, symphony_state, next_retry_at WHERE state IN ('unclaimed','retry_queued')`), `agent_runs_stall_scan` (`org_id, symphony_state, started_at WHERE symphony_state='running'`).

## Acceptance criteria
- [ ] Schema / state machine: all five columns present; CHECK constraint rejects invalid state strings; all three partial indexes created by name
- [ ] Tracker adapter: N/A
- [ ] Dispatch loop / hooks: N/A
- [ ] Surfaces (web/cli/tui parity): N/A
- [ ] Tests: migration forward + backward; unit test inserts a row with invalid `symphony_state` and expects DB error; unique partial index tested with two concurrent INSERT attempts on same `task_id` with state `claimed` — second must fail
- [ ] SPEC conformance traced in `docs/symphony-conformance.md`: state enum values documented as implementing SPEC.md §State Machine

## Blocked by
None

## Notes
Full `agent_runs` table structure is Pillar 4's responsibility; this migration uses `ALTER TABLE … ADD COLUMN IF NOT EXISTS` to be additive. The `claimed_unique` partial index is the core optimistic-lock mechanism that prevents double-dispatch.
