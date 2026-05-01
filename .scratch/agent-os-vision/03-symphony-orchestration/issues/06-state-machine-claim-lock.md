---
Status: ready-for-agent
Triage: AFK
Pillar: 03-symphony-orchestration
Blocked-by: 03-schema-agent-runs-symphony-columns, 04-tracker-fetch-candidate-issues
---

# State machine: Unclaimed → Claimed with optimistic lock + events row

## Parent
PRD: `.scratch/agent-os-vision/prds/03-symphony-orchestration.md`

## What to build
Implement `claimRun(taskId, instanceId)` in `src/orchestration/symphony/orchestrator.ts`. Uses `INSERT INTO agent_runs (task_id, symphony_state, claimed_by, …) ON CONFLICT (task_id) WHERE symphony_state='claimed' DO NOTHING` to claim atomically. If `INSERT` returns 0 rows, throw `ClaimConflictError`. On success: emit `events` row `{org_id, subject_kind:'agent_run', verb:'state_changed', payload:{from:'unclaimed',to:'claimed'}}`. Expose `orchestration.claimRun` tRPC procedure (internal).

## Acceptance criteria
- [ ] Schema / state machine: `INSERT … ON CONFLICT DO NOTHING` references `agent_runs_claimed_unique` partial index; second concurrent claim on same task returns `ClaimConflictError`
- [ ] Tracker adapter: N/A
- [ ] Dispatch loop / hooks: `claimRun` callable from orchestrator poll loop (wired in slice 10)
- [ ] Surfaces (web/cli/tui parity): N/A (internal; visible in run state on Web board in slice 15)
- [ ] Tests: two parallel `claimRun` calls on same task — exactly one succeeds, one throws `ClaimConflictError`; `events` table has exactly one `state_changed unclaimed→claimed` row after success
- [ ] SPEC conformance traced in `docs/symphony-conformance.md`: §Claim Lock section mapped to `orchestrator.ts:claimRun`

## Blocked by
03-schema-agent-runs-symphony-columns, 04-tracker-fetch-candidate-issues

## Notes
The unique partial index on `agent_runs(task_id) WHERE symphony_state='claimed'` is the only synchronization primitive — no advisory locks needed for claim.
