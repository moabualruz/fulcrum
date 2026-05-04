---
Status: completed
Triage: AFK
Pillar: api-and-webhooks
Blocked-by: [13/issues/04-public-api-hono-setup.md]
PRD: .scratch/agent-os-vision/prds/13-api-and-webhooks.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 13 section)
Decisions: [Q28, C4, D5]
Vision: .scratch/agent-os-vision/VISION-GAPS.md ("API / webhooks / integrations" row)
Docs: [https://hono.dev/docs/middleware/third-party/zod-openapi]
---

## Parent

Pillar 13 — API Surface + Webhooks + Connector Framework

## What to build

REST endpoint parity for the core task and doc domains. Register Hono+zod-openapi routes that delegate to the same tRPC procedures under `public-api` flag: `POST/GET/PATCH/DELETE /api/v1/tasks`, `POST/GET/PATCH/DELETE /api/v1/docs`, `POST/GET/PATCH/DELETE /api/v1/sprints`, `GET/POST/DELETE /api/v1/saved-views`. Same Zod schemas as tRPC; 201 on create; 200 on get/list; 204 on delete. Error propagation: tRPC `TRPCError` → HTTP status + REST error shape.

- **Web**: Playwright test hits REST endpoint directly (simulates external client); verifies `POST /api/v1/tasks` creates row visible in web UI.
- **CLI**: `fulcrum tasks create --title T --project P --json` calls tRPC in-process (not REST); REST endpoints are for external clients only.
- **TUI**: same — in-process tRPC; REST parity test exercises the REST layer separately.

## Acceptance criteria

- [ ] `POST /api/v1/tasks` with valid JWT → 201 + `Task` Zod shape; same row appears via `tRPC tasks.get`.
- [ ] `POST /api/v1/docs` → 201 + `Doc` shape; `doc_type` defaults to `note` per C2 decision.
- [ ] `POST /api/v1/sprints` → 201 + `Sprint` shape.
- [ ] `GET /api/v1/saved-views` → 200 + `SavedView[]`.
- [ ] `PATCH` on each resource → 200 + updated row; `bun run type-check` detects any schema drift between tRPC output and REST response shape.
- [ ] OpenAPI spec `GET /api/v1/openapi.json` includes all four resource groups with correct request/response schemas.
- [ ] FORBIDDEN (403) when JWT `orgId` does not own the resource; NOT_FOUND (404) on missing ID.
- [ ] Performance: `POST /api/v1/tasks` p95 <80ms (tRPC + Hono wrapper overhead ≤10ms over bare tRPC).

## Blocked by

- 13/issues/04-public-api-hono-setup.md

## Notes

P13.10–P13.12 maps to this slice. Does not include memories/search/notifications — those are in the next slice to keep slices thin.
