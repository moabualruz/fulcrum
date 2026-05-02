---
Status: completed
Triage: AFK
Owner: codex-orchestrator
Pillar: 03-symphony-orchestration
Blocked-by: 02-schema-workflow-definitions, 03-schema-agent-runs-symphony-columns
---

# Tracker adapter: fetchCandidateIssues

## Parent
PRD: `.scratch/agent-os-vision/prds/03-symphony-orchestration.md`

## What to build
Implement `fetchCandidateIssues(orgId, limit)` in `src/orchestration/symphony/tracker.ts`. Queries `tasks` WHERE `status='ready'` AND `blocked_by_ids = '{}'` (or all blockers resolved) AND no `agent_runs` row with `symphony_state='claimed'` for the same `task_id`. ORDER BY `priority ASC, created_at ASC, id ASC`. Zod-validate output shape. Expose via tRPC procedure `orchestration.fetchCandidateIssues` (internal). Wire CLI command `fulcrum symphony runs list --state ready --json` to this procedure.

## Acceptance criteria
- [ ] Schema / state machine: uses `tasks_dispatch_eligible` partial index; query plan confirmed via `EXPLAIN` in test
- [ ] Tracker adapter: `fetchCandidateIssues` returns only tasks with `status='ready'`, no active blockers, no existing claimed run; ordering matches SPEC.md §Ordering
- [ ] Dispatch loop / hooks: N/A (called by orchestrator in later slice)
- [ ] Surfaces (web/cli/tui parity): `fulcrum symphony runs list --state ready --json` outputs valid JSON array; Web tRPC procedure callable from browser
- [ ] Tests: fixture with 5 tasks (mix of blocked/unblocked, claimed/unclaimed); assert correct subset returned in correct order; assert blocked task excluded; assert already-claimed task excluded
- [ ] SPEC conformance traced in `docs/symphony-conformance.md`: §Ordering section mapped to `tracker.ts:fetchCandidateIssues`

## Blocked by
02-schema-workflow-definitions, 03-schema-agent-runs-symphony-columns

## Notes
This is one of Symphony's three required tracker operations. Priority is numeric ASC (lower = higher priority). Tie-break on `created_at ASC` then `id ASC` (lexicographic UUID comparison).
