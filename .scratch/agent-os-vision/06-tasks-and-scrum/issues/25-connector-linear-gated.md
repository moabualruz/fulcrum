---
Status: completed
ImplRuntime: claude
Triage: AFK
Pillar: 06-tasks-and-scrum
Blocked-by: [06-connector-framework-schema]
PRD: .scratch/agent-os-vision/prds/06-tasks-and-scrum.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 6 section)
Decisions: [C1, C5]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Jira-grade task management row)
Docs: []
---

# Gated connector-linear — Linear GraphQL adapter (one-way pull)

## Parent
PRD: `.scratch/agent-os-vision/prds/06-tasks-and-scrum.md` (issues breakdown lines T6-56, T6-58, T6-59)

## What to build
`FULCRUM_FEATURES=connector-linear` ships the Linear GraphQL adapter extending
`ConnectorBase`. Auth: `LINEAR_API_KEY`. Fetches issues via
`issues(filter:{team:{key:{eq:$team}}})` GraphQL query; maps state/priority/cycle to
Fulcrum fields; `external_id='linear:<uuid>'`. Cursor-based pagination. Delta sync
on re-run (only updated items).

## Acceptance criteria
- [ ] Logic: `LinearConnector extends ConnectorBase` in `src/connectors/linear.ts`; registered as `connector-linear` with flag guard
- [ ] Logic: `LinearConnector.fetch()` queries Linear GraphQL API at `https://api.linear.app/graphql` with `LINEAR_API_KEY` Bearer auth; cursor-based pagination via `pageInfo.endCursor`; returns `UpsertTaskInput[]`
- [ ] Logic: field mapping — Linear state → Fulcrum status; Linear priority enum (0–4) → Fulcrum priority; Linear cycle → Fulcrum sprint (matched by name or created if not found); Linear team → project mapping via `LINEAR_TEAM_KEY` env
- [ ] Logic: delta sync — stores `last_sync_cursor` in `connector_sync_log` row; on re-run fetches only `updatedAt > last_sync_cursor`
- [ ] Logic: `external_id='linear:<uuid>'` — Linear issue UUID is stable
- [ ] Flag OFF: no Linear API calls; connector disabled
- [ ] Flag ON: `fulcrum connectors sync linear` imports issues; re-run syncs only delta
- [ ] Tests: mock GraphQL endpoint returns 2 pages → all items imported across pagination
- [ ] Tests: delta sync — first run imports 5 items; second run with 0 updated items → `{imported: 0, updated: 0}`
- [ ] Tests: cycle→sprint mapping — existing sprint matched by name; new cycle creates new sprint row
- [ ] Tests: flag OFF → no GraphQL call (spy)
- [ ] Tests: `--json` output `{imported, updated, errors}` shape valid

## Blocked by
- 06-connector-framework-schema

## Notes / Tech-stack hints
- Linear GraphQL schema: `Issue { id, title, state { name }, priority, assignee { email }, labels { nodes { name } }, cycle { name, startsAt, endsAt } }`
- `LINEAR_TEAM_KEY` env var: maps Linear team to Fulcrum project_id via `connector_sync_log.config_json`
- Bi-directional sync behind `connector-linear-bidirectional` flag — not this slice
