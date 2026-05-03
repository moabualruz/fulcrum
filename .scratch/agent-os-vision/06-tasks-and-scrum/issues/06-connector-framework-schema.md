---
Status: in-progress
Triage: AFK
Pillar: 06-tasks-and-scrum
Blocked-by: [01-tasks-schema-extension]
PRD: .scratch/agent-os-vision/prds/06-tasks-and-scrum.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 6 section)
Decisions: [C1, C2, Q22]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Jira-grade task management row)
Docs: []
---

# Connector framework scaffolding + connector_sync_log schema

## Parent
PRD: `.scratch/agent-os-vision/prds/06-tasks-and-scrum.md` (issues breakdown lines T6-54)

## What to build
Idempotent migration creating `connector_sync_log(id, org_id, connector text,
status text, last_run_at timestamptz, error text)`. Implement
`src/connectors/framework.ts`: abstract `ConnectorBase` class with `fetch():
Promise<UpsertTaskInput[]>` abstract method, idempotent upsert on
`(org_id, external_id)` using `INSERT … ON CONFLICT(org_id, external_id) DO UPDATE`,
graphile-worker job registration per connector name, doctor-check helper that
reports each enabled connector's last sync time and error. `UpsertTaskInput`
Zod schema exported. Framework ships with feature-flag guard: connector job
only enqueued when `FULCRUM_FEATURES` includes the connector's flag name.
No per-connector adapters in this slice (those are slices 24–26).

## Acceptance criteria
- [ ] Schema migration: `connector_sync_log` created idempotently with all columns and composite index `connector_sync_log_org_connector(org_id, connector)`
- [ ] Logic: `ConnectorBase` abstract class exported from `src/connectors/framework.ts`; subclasses must implement `fetch()`
- [ ] Logic: `runConnectorJob(connector: ConnectorBase)` calls `fetch()`, upserts each row on `(org_id, external_id)`, writes sync log row on success/failure
- [ ] Logic: idempotent upsert — same `external_id` on second run updates fields, does not insert duplicate
- [ ] Logic: `UpsertTaskInput` Zod schema includes `external_id`, `title`, `status`, `priority`, `labels`, `assignee_external_id`, `sprint_external_id`
- [ ] Logic: `registerConnectorJob(name, connector, flag)` registers graphile-worker task; guards on feature flag before enqueuing
- [ ] Logic: `doctorConnectorCheck()` returns `{connector, last_run_at, status, error}[]` for all enabled connectors
- [ ] CLI: `fulcrum connectors list --json` lists enabled connectors + last sync status (reads `connector_sync_log`)
- [ ] CLI: `fulcrum connectors sync <name>` triggers immediate graphile-worker job dispatch; `--json` returns job ID
- [ ] TUI: `/connectors` panel lists connectors + status; `s` key dispatches manual sync
- [ ] Web: `/settings/connectors` page lists connectors (name, flag state, last sync, error); manual sync button; masked config form (host/token fields)
- [ ] Tests: `runConnectorJob` with mock `fetch()` returning 3 items → 3 rows upserted, sync log written
- [ ] Tests: second run with same items → row count unchanged, `updated_at` bumped
- [ ] Tests: feature flag OFF → job not enqueued (no graphile-worker call)
- [ ] Tests: `doctorConnectorCheck` returns correct data from `connector_sync_log`

## Blocked by
- 01-tasks-schema-extension (needs `external_id` column on `tasks`)

## Notes / Tech-stack hints
- `external_id` format: `'<connector>:<key>'` — matches slice 01 convention
- Connector adapters (Jira, Linear, GitHub) extend `ConnectorBase`; their feature flags are `connector-jira`, `connector-linear`, `connector-github-issues`
- Web `/settings/connectors` page is a settings sub-page under the project or org settings; masked fields use `type="password"` + reveal toggle
