---
Status: ready-for-agent
Triage: AFK
Pillar: notifications-activity-audit
Blocked-by: [01-schema-migration.md]
PRD: .scratch/agent-os-vision/prds/12-notifications-activity-audit.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 12 section)
Decisions: [A4, Q28]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Audit log row)
Docs: []
---

# tRPC audit.* procedures: query + export + retentionPolicy CRUD (A4 scope)

## Parent
PRD: `.scratch/agent-os-vision/prds/12-notifications-activity-audit.md` (Issues T12-06; A4 compliance requirement)

## What to build
`audit.*` tRPC procedures in `src/trpc/routers/audit.ts`. `audit.query` (filters: org_id, project_id, user_id, subject_kind, verb, date_range; default last 7 days; paginated; `created_at DESC`); `audit.export` (streams <100k rows directly; enqueues graphile-worker job for larger; returns `{jobId}` or `{rows: []}`; formats: JSON, CSV); `audit.retentionPolicy.get`; `audit.retentionPolicy.set(orgId, days)`; `audit.retentionPolicy.list`. All Zod-validated; `assertPermission(ctx, 'audit:read')` on queries; `assertPermission(ctx, 'audit:admin')` on retention CRUD. Per-event-type Zod payload schemas registered at module-init (A4).

## Acceptance criteria
- [ ] Schema migration: reads `Event` (Pillar 1 entity); reads/writes `EventRetentionPolicy` (created in migration class `Migration<timestamp>`).
- [ ] tRPC procedure / module: `audit.query` returns paginated events with filter combos; `audit.export` streams JSON/CSV; `audit.retentionPolicy.set` updates org's retention days; per-event-type Zod schemas registered in `src/notifications/event-schemas.ts`.
- [ ] Web surface: `/audit` route uses `audit.query` with filter params; CSV export button calls `audit.export`; retention settings on `/settings/notifications` uses `audit.retentionPolicy.*`.
- [ ] CLI command: `fulcrum audit query --kind task --verb status_changed --since 2026-01-01 --json` returns filtered events; `fulcrum audit export --format csv --output ./audit.csv`.
- [ ] TUI screen: Audit panel uses `audit.query`; `E` key triggers `audit.export --format json`.
- [ ] Tests: filter combos (kind+verb+date_range) — correct repository filter; pagination — page 2 offset correct; export CSV — headers + rows correct; retention policy CRUD round-trips; `retain_days=0` = forever; per-event Zod schemas validated on write; RED→GREEN.

## Blocked by
- `01-schema-migration.md` — `EventRetentionPolicy` entity.
- Pillar 1 (Foundation) — `Event` entity + Q23 `org_id` backfill.

## Notes / Tech-stack hints
- A4: `audit.list` is the same as `audit.query` (different naming in A4 vs PRD — use `audit.query`).
- Per-event-type Zod schemas: `TASK_CREATED`, `TASK_STATUS_CHANGED`, `DOC_UPDATED`, `AGENT_RUN_COMPLETED`, etc. — registered in `src/notifications/event-schemas.ts`; `events.payload` validated on write against matching schema.
- Export streaming: for >100k rows, enqueue `audit.export-job` graphile-worker task; client polls `audit.exportStatus(jobId)` until complete, then downloads.
- CSV format: headers = event columns; one row per event; timestamps in ISO 8601.
