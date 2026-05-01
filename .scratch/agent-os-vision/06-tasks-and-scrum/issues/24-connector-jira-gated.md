---
Status: ready-for-agent
Triage: AFK
Pillar: 06-tasks-and-scrum
Blocked-by: [06-connector-framework-schema]
PRD: .scratch/agent-os-vision/prds/06-tasks-and-scrum.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 6 section)
Decisions: [C1, C5]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Jira-grade task management row)
Docs: []
---

# Gated connector-jira — Jira REST adapter (one-way pull)

## Parent
PRD: `.scratch/agent-os-vision/prds/06-tasks-and-scrum.md` (issues breakdown lines T6-55, T6-58, T6-59)

## What to build
`FULCRUM_FEATURES=connector-jira` ships the Jira REST adapter extending `ConnectorBase`.
Auth: `JIRA_HOST` + `JIRA_EMAIL` + `JIRA_API_TOKEN` env vars. Fetches issues via
`/rest/api/3/search`; maps type/status/priority/assignee/labels to Fulcrum fields;
`external_id='jira:<key>'`. Idempotent upsert via framework. CLI/Web/TUI connector surfaces
from slice 06 (no new surface code needed; framework handles dispatch).

## Acceptance criteria
- [ ] Logic: `JiraConnector extends ConnectorBase` in `src/connectors/jira.ts`; registered as `connector-jira` with flag guard
- [ ] Logic: `JiraConnector.fetch()` calls `/rest/api/3/search?jql=...` with `JIRA_HOST`/`JIRA_EMAIL`/`JIRA_API_TOKEN`; paginates via `startAt`/`maxResults`; returns `UpsertTaskInput[]`
- [ ] Logic: field mapping — Jira issue type → Fulcrum task type label; Jira status → closest Fulcrum status name (configurable map in `config_json`); Jira priority → Fulcrum priority enum; Jira assignee email → Fulcrum user lookup (by email); Jira labels → Fulcrum labels
- [ ] Logic: idempotent upsert — duplicate `jira:<key>` re-run updates existing task, does not insert new row
- [ ] Logic: status map configurable via `connector_sync_log.config_json` (per-connector config stored in DB)
- [ ] Flag OFF: no Jira API calls; no sync jobs enqueued; `fulcrum connectors list` shows connector as disabled
- [ ] Flag ON: `fulcrum connectors sync jira` imports issues; second run is no-op for unchanged issues
- [ ] Tests: mock Jira `/rest/api/3/search` returns 3 issues → 3 tasks upserted with correct `external_id='jira:<key>'`
- [ ] Tests: duplicate run (same 3 issues) → row count unchanged, `updated_at` bumped on at least one field
- [ ] Tests: status map config translates Jira "In Progress" → Fulcrum "in_progress"
- [ ] Tests: flag OFF → `JiraConnector.fetch()` not called (spy assertion)
- [ ] Tests: `fulcrum connectors sync jira --json` returns `{imported: number, updated: number, errors: []}`

## Blocked by
- 06-connector-framework-schema

## Notes / Tech-stack hints
- Jira Cloud base URL: `https://<JIRA_HOST>.atlassian.net`; Jira Server: `https://<JIRA_HOST>`; connector detects by auth flow
- `xh` (from global rules §2) preferred over `fetch` for Jira HTTP calls — handles non-200 exits correctly
- Bi-directional sync gated behind separate `connector-jira-bidirectional` flag — not in scope for this slice
