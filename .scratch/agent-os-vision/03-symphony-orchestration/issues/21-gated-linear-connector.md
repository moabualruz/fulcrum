---
Status: ready-for-agent
Triage: AFK
Pillar: 03-symphony-orchestration
Blocked-by: 04-tracker-fetch-candidate-issues, 05-tracker-fetch-by-states
---

# Gated: Linear connector — bidirectional PGlite ↔ Linear sync (connector-linear flag)

## Parent
PRD: `.scratch/agent-os-vision/prds/03-symphony-orchestration.md`

## What to build
Implement `src/orchestration/connectors/linear.ts` behind `FULCRUM_FEATURES=connector-linear`. Adapter implements the same Symphony tracker-adapter interface as `tracker.ts` against the Linear GraphQL API:
- `fetchCandidateIssues` → Linear issue query filtered by team/state.
- `fetchIssuesByStates` / `fetchIssueStatesByIds` → Linear batch queries.
- Bidirectional sync: Linear issues → Fulcrum `tasks` rows; Fulcrum task state changes → Linear issue state updates (via webhook + polling).
- Sync conflict strategy: last-write-wins with `updated_at` comparison; conflict row written to `events`.
- `fulcrum symphony sync --connector linear` triggers a manual full sync.
Web: `/settings/integrations/linear` — API key input, team selection, sync status. CLI: `fulcrum symphony connector linear sync --json`. TUI: integration status line in orchestration pane.

## Acceptance criteria
- [ ] Schema / state machine: when flag off, `connector-linear` code is unreachable; when on, Linear issues appear as `tasks` rows; task status change propagates back to Linear within one sync cycle
- [ ] Tracker adapter: `linear.ts` passes same unit-test fixture as `tracker.ts` (shared test helper)
- [ ] Dispatch loop / hooks: orchestrator swaps tracker adapter to `linear.ts` when flag on + Linear API key set
- [ ] Surfaces (web/cli/tui parity): `/settings/integrations/linear` page; `fulcrum symphony connector linear sync --json`; TUI integration status
- [ ] Tests: flag off → no Linear import errors; flag on → mock Linear API → `fetchCandidateIssues` returns mapped tasks; bidirectional sync test with mock webhook payload; conflict row written on concurrent update
- [ ] SPEC conformance traced in `docs/symphony-conformance.md`: §Connector Adapter section notes `linear.ts` as optional implementation

## Blocked by
04-tracker-fetch-candidate-issues, 05-tracker-fetch-by-states

## Notes
Gated `FULCRUM_FEATURES=connector-linear`; off by default per C1/C2. Linear API key stored in `settings(key='linear_api_key', encrypted=true)`. Adapter pattern designed here enables future Jira/GitHub Issues connectors with minimal new code.
