---
Status: implemented
Triage: AFK
Pillar: api-and-webhooks
Blocked-by: [13/issues/04-public-api-hono-setup.md]
PRD: .scratch/agent-os-vision/prds/13-api-and-webhooks.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 13 section)
Decisions: [Q28, A4, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md ("API / webhooks / integrations" row)
Docs: [https://hono.dev/docs/middleware/third-party/zod-openapi]
---

## Parent

Pillar 13 — API Surface + Webhooks + Connector Framework

## What to build

REST endpoint parity for secondary domains: `GET /api/v1/search?q=&kind=&project=` → `search.query` tRPC; `GET/PATCH /api/v1/notifications` → `notify.list|markRead`; `GET /api/v1/audit?kind=&since=&until=` → `audit.query`; `GET /api/v1/runs`, `GET /api/v1/runs/:id` → `agent_runs.list|get`; `GET /api/v1/artifacts` → `artifacts.list`; `GET /api/v1/repos` → `repos.list`. Same Zod schemas, same JWT auth, same rate limiter. Audit export: `GET /api/v1/audit/export?format=json|csv` → streaming response.

- **Web**: `/settings/api` shows all available REST endpoints as copyable examples.
- **CLI**: `fulcrum search "query" --json`, `fulcrum audit query --since X --json`, `fulcrum runs list --json` all use in-process tRPC; REST routes verified separately.
- **TUI**: Audit log panel `E` key triggers `audit.export` tRPC (not REST); REST parity confirmed by integration test.

## Acceptance criteria

- [ ] `GET /api/v1/search?q=foo` → 200 + `SearchResult[]` Zod shape with `kind`, `id`, `title`, `snippet` fields.
- [ ] `GET /api/v1/audit?since=2026-01-01` → 200 + `AuditEvent[]`; facet filters applied.
- [ ] `GET /api/v1/audit/export?format=csv` → streaming CSV response; `Content-Disposition: attachment; filename=audit.csv`.
- [ ] `GET /api/v1/runs` → 200 + `AgentRun[]`; status filter via `?status=running`.
- [ ] `GET /api/v1/notifications` → 200 + `Notification[]`; `PATCH /api/v1/notifications/:id/mark-read` → 204.
- [ ] OpenAPI spec includes all new route groups.
- [ ] `fulcrum doctor --json` `api` subsystem check `rest-surface` passes when `public-api` ON.

## Blocked by

- 13/issues/04-public-api-hono-setup.md

## Notes

P13.13–P13.14 maps to this slice. Audit export streaming tested with 10k row fixture.
