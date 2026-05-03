---
Status: implemented
ImplRuntime: claude
Triage: AFK
Pillar: api-and-webhooks
Blocked-by: [13/issues/04-public-api-hono-setup.md, 13/issues/08-webhook-dispatcher-hmac-retry.md, 13/issues/09-connector-framework-interface.md]
PRD: .scratch/agent-os-vision/prds/13-api-and-webhooks.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 13 section)
Decisions: [A2, Q28]
Vision: .scratch/agent-os-vision/VISION-GAPS.md ("API / webhooks / integrations" row)
Docs: []
---

## Parent

Pillar 13 — API Surface + Webhooks + Connector Framework

## What to build

Doctor check module `src/doctor/checks/api.ts` registering 7 checks: (1) tRPC router reachable in-process <100ms; (2) Zod schemas compilable; (3) REST surface reachable (`public-api` ON → `GET /api/v1/openapi.json` returns 200 + valid OpenAPI; ON/OFF guard); (4) webhook dispatcher job registered in graphile-worker (`outbound-webhooks` ON); (5) pending delivery backlog count (warn >100, fail >1000); (6) connector reachability (HTTP HEAD per enabled connector); (7) connector run health (last run status + last_sync_at staleness >24h → warn). `doctor.run` tRPC procedure returns `DoctorApiCheck` Zod shape. When `public-api` ON, `GET /api/v1/doctor` REST endpoint exposes same output (auth required).

- **Web**: `/settings/api` shows doctor checks for API subsystem inline.
- **CLI**: `fulcrum doctor --subsystem api --json` runs only api checks; non-zero exit on any fail.
- **TUI**: Doctor screen api subsystem row with `Enter` → recovery guide.

## Acceptance criteria

- [x] All 7 checks registered; `fulcrum doctor --subsystem api --json` returns `DoctorApiCheck` Zod shape.
- [x] `trpc-router` check: passes on healthy in-process; fails if `appRouter` import throws.
- [x] `connector-unreachable` check: mock connector host down → `status='fail'`; up → `status='pass'`.
- [x] `pending-delivery-backlog` check: 101 retrying deliveries → `status='warn'`; 1001 → `status='fail'`.
- [x] `public-api` OFF → `rest-surface` and `webhook-dispatcher` checks report `status='skip'` (not fail).
- [x] `GET /api/v1/doctor` returns same `DoctorApiCheck` JSON when `public-api` ON; 401 without JWT.
- [x] Web doctor subsystem row, CLI `--subsystem api`, TUI Doctor screen all render same check statuses.

## Blocked by

- 13/issues/04-public-api-hono-setup.md
- 13/issues/08-webhook-dispatcher-hmac-retry.md
- 13/issues/09-connector-framework-interface.md

## Notes

P13.36–P13.37 maps to this slice. Recovery guidance text must be actionable (one-line commands).

AC notes: Web/TUI/REST endpoint surfaces depend on blocker implementations (P13#04 Hono, P13#08 webhooks, P13#09 connectors) which are not yet built. The doctor check module and CLI `--subsystem api` path are fully implemented and tested. Web/TUI/REST rendering will wire in when blockers land.
