---
Status: completed
ImplRuntime: claude
Triage: AFK
Pillar: notifications-activity-audit
Blocked-by: [05-trpc-notify-procedures.md, 06-trpc-audit-procedures.md]
PRD: .scratch/agent-os-vision/prds/12-notifications-activity-audit.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 12 section)
Decisions: [Q28, C1, D5]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (API / webhooks / integrations row)
Docs: []
---

# Gated: public-api REST — GET|POST|PATCH|DELETE /api/v1/notifications/* + GET /api/v1/audit

## Parent
PRD: `.scratch/agent-os-vision/prds/12-notifications-activity-audit.md` (Gated: Public REST/OpenAPI; issues T12-39)

## What to build
When `FULCRUM_FEATURES=public-api` ON: expose notification and audit endpoints via `@hono/zod-openapi` wrapper: `GET /api/v1/notifications` (list), `POST /api/v1/notifications/:id/read` (mark read), `GET /api/v1/notifications/rules` + `POST`/`PATCH /:id`/`DELETE /:id` (rule CRUD), `POST /api/v1/notifications/rules/:id/config` (channel config), `GET /api/v1/audit` (query with filters). Auth enforced (API key or Bearer JWT). Webhook rule `secret` masked in response. OpenAPI 3.1 spec includes these paths. Flag OFF → 404.

## Acceptance criteria
- [ ] Schema migration: N/A.
- [ ] tRPC procedure / module: Hono routes wrap tRPC procedures; `@hono/zod-openapi` schema generated.
- [ ] Web surface: N/A.
- [ ] CLI command: `xh GET localhost:5173/api/v1/notifications --auth Bearer:<token> --check-status` returns `UserNotification[]`; `xh GET localhost:5173/api/v1/audit?kind=task --check-status` returns events.
- [ ] TUI screen: N/A.
- [ ] Tests: flag OFF → 404 all endpoints; ON → 200 valid JSON; auth missing → 401; bad params → 400; rule CRUD via REST; webhook secret masked; `GET /api/v1/audit` filter params correct; OpenAPI spec passes `swagger-cli validate`; RED→GREEN.

## Blocked by
- `05-trpc-notify-procedures.md` — `notify.*` procedures.
- `06-trpc-audit-procedures.md` — `audit.query`.
- Pillar 13 (API Gateway) — Hono app + `public-api` flag router setup.

## Notes / Tech-stack hints
- Webhook secret masking: replace all but first 4 chars with `***` in API response.
- `GET /api/v1/audit`: maps query params to `audit.query` filter object; auth must check `assertPermission(ctx, 'audit:read')`.
- Per Q28: REST endpoints are thin wrappers; no business logic in Hono routes.
- OpenAPI spec: expose `GET /api/openapi.json` from Hono app; spec includes all notification + audit paths.
