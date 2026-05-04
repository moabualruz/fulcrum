---
Status: completed
ImplRuntime: claude
Triage: AFK
Pillar: search-and-discovery
Blocked-by: [05-fts-query-ranking.md, 06-suggest-and-quick-filter.md, 07-saved-searches.md]
PRD: .scratch/agent-os-vision/prds/11-search-and-discovery.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 11 section)
Decisions: [Q28, C1, D5]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (API / webhooks / integrations row)
Docs: []
---

# Gated: public-api search REST endpoints — GET /api/v1/search + /suggest + /search/saved

## Parent
PRD: `.scratch/agent-os-vision/prds/11-search-and-discovery.md` (Issues T11-34)

## What to build
When `FULCRUM_FEATURES=public-api` ON: expose search endpoints via `@hono/zod-openapi` wrapper around tRPC procedures: `GET /api/v1/search` (same params as `search.query`), `GET /api/v1/search/suggest`, `GET /api/v1/search/saved` (list), `POST /api/v1/search/saved` (create). Auth enforced (API key or Bearer JWT from Better-Auth). OpenAPI 3.1 spec includes these paths. Flag OFF → 404 on all `/api/v1/search` routes.

## Acceptance criteria
- [ ] Schema migration: N/A.
- [ ] tRPC procedure / module: Hono routes wrap tRPC procedures; `@hono/zod-openapi` schema generated from Zod; spec visible at `GET /api/openapi.json`.
- [ ] Web surface: N/A (REST API, no Web UI changes).
- [ ] CLI command: `xh GET localhost:5173/api/v1/search?q=foo --auth Bearer:<token> --check-status` returns valid `SearchResult[]` JSON when flag ON; 404 when flag OFF.
- [ ] TUI screen: N/A.
- [ ] Tests: flag OFF → 404; ON → 200 with valid JSON matching Zod schema; auth missing → 401; bad params → 400; saved search CRUD via REST; OpenAPI spec passes `swagger-cli validate`; RED→GREEN.

## Blocked by
- `05-fts-query-ranking.md` — `search.query`.
- `06-suggest-and-quick-filter.md` — `search.suggest`.
- `07-saved-searches.md` — saved search procedures.
- Pillar 13 (API Gateway) — Hono app + `@hono/zod-openapi` setup; `public-api` flag router.

## Notes / Tech-stack hints
- Per Q28: Hono + `@hono/zod-openapi` thin wrapper; no duplicated business logic.
- Auth: API key in `Authorization: Bearer <key>` header; validated via Better-Auth session or org API key table.
- Spec generation: `app.getOpenAPI31Document()` from `@hono/zod-openapi`; served at `/api/openapi.json`.
- Per C1: flag OFF is default; REST layer is an additive wrapper, not a replacement for tRPC.
