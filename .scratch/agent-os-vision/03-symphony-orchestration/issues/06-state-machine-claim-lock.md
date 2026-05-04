---
Status: completed
Owner: codex-orchestrator
Triage: AFK
Pillar: 03-symphony-orchestration
Blocked-by: 03-schema-agent-runs-symphony-columns, 04-tracker-fetch-candidate-issues
---

# State machine: Unclaimed → Claimed with optimistic lock + events row

## Parent
PRD: `.scratch/agent-os-vision/prds/03-symphony-orchestration.md`

## What to build
Implement `claimRun(taskId, instanceId)` in `src/orchestration/symphony/orchestrator.ts`. Uses `agentRunRepo.nativeUpdate({ taskId, orchestrationState: 'unclaimed' }, { orchestrationState: 'claimed', claimedBy: instanceId })` — MikroORM's `nativeUpdate` maps to `UPDATE … WHERE … RETURNING` under the hood; if 0 rows updated, throw `ClaimConflictError`. The uniqueness of `agent_runs_claimed_unique` partial index prevents double-dispatch. On success: `eventsRepo.create({ org, subjectKind:'agent_run', verb:'state_changed', payload:{from:'unclaimed',to:'claimed'} }); em.flush()`. Expose `orchestration.claimRun` tRPC procedure (internal).

## Acceptance criteria
- [x] Schema / state machine: `nativeUpdate` with `orchestrationState:'unclaimed'` filter references `agent_runs_claimed_unique` partial index; second concurrent claim on same task returns `ClaimConflictError`
- [x] Tracker adapter: N/A
- [x] Dispatch loop / hooks: `claimRun` callable from orchestrator poll loop (wired in slice 10)
- [x] Surfaces (web/cli/tui parity): N/A (internal; visible in run state on Web board in slice 15)
- [x] Tests: two parallel `claimRun` calls on same task — exactly one succeeds, one throws `ClaimConflictError`; `events` table has exactly one `state_changed unclaimed→claimed` row after success
- [x] SPEC conformance traced in `docs/symphony-conformance.md`: §Claim Lock section mapped to `orchestrator.ts:claimRun`

## Blocked by
03-schema-agent-runs-symphony-columns, 04-tracker-fetch-candidate-issues

## Notes
The unique partial index on `agent_runs(task_id) WHERE symphony_state='claimed'` is the only synchronization primitive — no advisory locks needed for claim.
