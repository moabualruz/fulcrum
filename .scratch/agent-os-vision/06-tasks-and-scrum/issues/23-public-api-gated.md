---
Status: implemented
ImplRuntime: claude
Triage: AFK
Pillar: 06-tasks-and-scrum
Blocked-by: [07-task-crud-baseline, 17-sprints-trpc-crud, 21-velocity-and-cycle-time-reports]
PRD: .scratch/agent-os-vision/prds/06-tasks-and-scrum.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 13 section)
Decisions: [C1, Q28]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (API/webhooks/integrations row)
Docs: []
---

# Gated public REST/OpenAPI for tasks + sprints + reports

## Parent
PRD: `.scratch/agent-os-vision/prds/06-tasks-and-scrum.md` (issues breakdown lines T6-52)

## What to build
`FULCRUM_FEATURES=public-api` exposes `GET/POST/PATCH/DELETE /api/v1/tasks`,
`/api/v1/sprints`, `/api/v1/reports/{kind}` via `@hono/zod-openapi`. Auth required
(Better Auth session cookie or API key). OpenAPI 3.1 spec served at `/api/openapi.json`.
Flag OFF → all `/api/v1/*` routes return 404. Tests verify both states.

## Acceptance criteria
- [x] Logic: `FULCRUM_FEATURES=public-api` gates mount of Hono `@hono/zod-openapi` router; flag OFF → `/api/v1/tasks` returns 404
- [x] API `GET /api/v1/tasks`: accepts `project_id`, `status`, `sprint_id`, `assignee_id` query params; returns paginated `{data: TaskRow[], cursor}` with JSON schema matching tRPC `tasks.list` return
- [x] API `POST /api/v1/tasks`: creates task; 400 on Zod validation failure; 403 if no permission
- [x] API `PATCH /api/v1/tasks/:id`: partial update; 404 if not found; 403 if no permission
- [x] API `DELETE /api/v1/tasks/:id`: soft-delete; returns 204
- [x] API `GET /api/v1/sprints` + `POST` + `PATCH /:id`: sprint CRUD
- [x] API `GET /api/v1/reports/burndown?project_id=&sprint_id=`: returns burndown array
- [x] API `GET /api/v1/reports/velocity?project_id=`: returns velocity array
- [x] API auth: Better Auth session cookie validated; API key header (`Authorization: Bearer <key>`) also accepted; 401 on missing/invalid
- [x] OpenAPI 3.1 spec at `/api/openapi.json`; validated by `@readme/openapi-parser` in test
- [x] CLI: `fulcrum tasks list --json` continues to work via tRPC (unaffected by this flag)
- [x] TUI: unaffected (tRPC in-process)
- [x] Tests: flag OFF → `/api/v1/tasks` returns 404
- [x] Tests: flag ON → `GET /api/v1/tasks` returns 200 with valid schema (Zod parse of response)
- [x] Tests: unauthenticated request returns 401
- [x] Tests: OpenAPI spec parses without errors

## Blocked by
- 07-task-crud-baseline
- 17-sprints-trpc-crud
- 21-velocity-and-cycle-time-reports

## Notes / Tech-stack hints
- Hono router thin wrapper over existing tRPC procedures — no business logic duplication
- `@hono/zod-openapi` generates spec from route definitions; keep route Zod schemas in sync with tRPC Zod schemas via shared `src/schemas/tasks.ts`
- API key table: `api_keys(id, org_id, user_id, key_hash, name, created_at, last_used_at)` — add in this slice's migration
