---
Status: completed
Triage: AFK
Pillar: 08-memory-context-engine
Blocked-by: [07-trpc-memory-crud-and-search.md, 08-context-bundle-assembler.md]
PRD: .scratch/agent-os-vision/prds/08-memory-context-engine.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 8 section)
Decisions: [Q28, C1, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Memory + Context rows)
Docs: PRD §Surfaces — API (OpenAPI REST gated public-api); Q28 — @hono/zod-openapi wrapper
---

## What to build

OpenAPI REST endpoints for memory (gated `FULCRUM_FEATURES=public-api`). Thin `@hono/zod-openapi` wrapper over the existing tRPC procedures — no new business logic.

Routes:
```
GET    /api/memory                    → memory.list
POST   /api/memory                    → memory.create
GET    /api/memory/:id                → memory.get
PATCH  /api/memory/:id                → memory.update
DELETE /api/memory/:id                → memory.forget
POST   /api/memory/:id/promote        → memory.promote
POST   /api/memory/:id/archive        → memory.archive
POST   /api/memory/:id/restore        → memory.restore
GET    /api/context/preview?taskId=   → context.preview
```

Feature-flag guard: when `public-api` is off, all routes return `404`. Spec endpoint `/api/openapi.json` always returns spec JSON (not gated — spec is static).

## Acceptance criteria

- [ ] All 9 REST routes defined; each maps 1:1 to a tRPC procedure with no duplicated logic
- [ ] `FULCRUM_FEATURES=public-api` off → all routes return `404`; spec endpoint returns spec regardless
- [ ] OpenAPI spec at `/api/openapi.json` passes `openapi-validator` lint (`openapi.memory.test.ts`)
- [ ] Request/response payload schemas match tRPC Zod schemas exactly (generated from same Zod definitions)
- [ ] `PATCH /api/memory/:id` returns 422 on Zod validation failure with error detail in body
- [ ] `DELETE /api/memory/:id` requires `?confirm=true` query param; returns 400 without it
- [ ] Integration test: `public-api` ON → `POST /api/memory` creates row; `GET /api/memory` lists it; `DELETE /api/memory/:id?confirm=true` removes it
- [ ] Auth: Bearer token required; `assertPermission()` called; org-scope enforced same as tRPC
- [ ] `bun run ci` type-check includes Hono route types

## Blocked by

- `07-trpc-memory-crud-and-search.md`
- `08-context-bundle-assembler.md`
