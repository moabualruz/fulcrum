# ORM Import Audit — 2026-05-16

## App Surfaces (web/CLI/TUI)

Zero direct ORM imports in any app surface:
- `apps/web/src/` — 0 TypeORM imports (production files)
- `apps/cli/src/` — 0 TypeORM imports (production files)
- `apps/tui/src/` — 0 TypeORM imports (production files)

## MikroORM Production Imports

Zero `@mikro-orm` imports in production code outside archived migrations:
- Archived migrations: `services/platform-core/src/infrastructure/application-database/_archived-mikro-migrations/` — KEEP (historical reference)
- Test guard patterns (boundary.test.ts, no-raw-sql.test.ts, interface-parity tests) reference `@mikro-orm` in regex patterns that VERIFY code doesn't import it — correct behavior

## Service Keep/Delete Decisions

| Service | Decision | Reason |
|---|---|---|
| `services/inference-runtime/` | KEEP | 18 Rust files — real inference engine (protocol, classify, generate) |
| `services/planning-review/` | KEEP | 20+ files — ACP planning, approved plans, QA, review workflows, report generation |
| `services/agent-client-protocol/` | KEEP | 12 files — ACP bridge, session management, process/websocket transports |

## DTO Location Audit

All DTOs correctly located under `service/interface/http/dto/`:
- execution-orchestration, identity-access, integration-hub, knowledge-workspace, notification-center, platform-core, work-management, workflow-coordination

Zero DTO files found outside `interface/http/dto/` directories.

## Controller Thinness

Controllers delegate to service/store/application layers. Largest controllers (document: 1374, agent-run: 612, repository: 616) are large due to embedded DTO classes and Swagger decorators, not business logic. All controllers inject services and delegate via `this.service.*` / `this.store.*` calls.

One note: `document-public-api.controller.ts` injects `DataSource` into `DocumentPublicStore` — standard NestJS DI pattern, not direct ORM usage in controller logic.

## God-Module Split Status

Entities distributed across 8 bounded services:
- platform-core: 21 entities (cross-cutting: jobs, skills, settings, errors, telemetry)
- work-management: 16 entities
- integration-hub: 13 entities
- notification-center: 10 entities
- knowledge-workspace: 10 entities
- identity-access: 9 entities
- execution-orchestration: 8 entities
- workflow-coordination: 3 entities
- planning-review: 0 entities (application-layer only, no persistence)
- agent-client-protocol: 0 entities (protocol/transport layer, no persistence)
