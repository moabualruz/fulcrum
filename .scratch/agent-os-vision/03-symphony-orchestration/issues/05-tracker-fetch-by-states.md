---
Status: ready-for-agent
Triage: AFK
Pillar: 03-symphony-orchestration
Blocked-by: 03-schema-agent-runs-symphony-columns
---

# Tracker adapter: fetchIssuesByStates + fetchIssueStatesByIds

## Parent
PRD: `.scratch/agent-os-vision/prds/03-symphony-orchestration.md`

## What to build
Implement the two remaining Symphony tracker operations in `src/orchestration/symphony/tracker.ts`:
- `fetchIssuesByStates(orgId, states[], limit?)` — repository call `agentRunRepo.find({ org: orgId, orchestrationState: { $in: states } }, { limit })`; returns full run + task rows; Zod-validated output.
- `fetchIssueStatesByIds(orgId, runIds[])` — lightweight `agentRunRepo.find({ id: { $in: runIds }, org: orgId }, { fields: ['id', 'orchestrationState'] })`; returns `{id, state}[]`; used for fast polling without fetching full row.
Both exposed as tRPC procedures `orchestration.fetchIssuesByStates` and `orchestration.fetchIssueStatesByIds`.

## Acceptance criteria
- [ ] Schema / state machine: both queries hit `agent_runs_dispatch_poll` or `agent_runs_stall_scan` index as appropriate; verified with EXPLAIN
- [ ] Tracker adapter: `fetchIssuesByStates` returns full shape; `fetchIssueStatesByIds` returns slim `{id, state}[]`; both Zod-validated; empty id list returns empty array without error
- [ ] Dispatch loop / hooks: N/A
- [ ] Surfaces (web/cli/tui parity): tRPC procedures callable; CLI `fulcrum symphony runs list --state <state> --json` reuses `fetchIssuesByStates`
- [ ] Tests: fixture runs in multiple states; assert correct subset per state filter; assert `fetchIssueStatesByIds` returns only id+state; assert unknown ids omitted from result
- [ ] SPEC conformance traced in `docs/symphony-conformance.md`: §Tracker Operations section mapped to both functions

## Blocked by
03-schema-agent-runs-symphony-columns

## Notes
`fetchIssueStatesByIds` is the hot polling path; must stay read-only with no joins heavier than the partial index allows. Use `{ fields: ['id','orchestrationState'] }` in MikroORM `find()` to avoid loading full entity.
