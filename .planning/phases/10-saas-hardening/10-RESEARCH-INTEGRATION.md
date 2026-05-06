# Phase 10 Research: Codebase Integration Map

**Date:** 2026-05-06
**Phase:** 10 SaaS Hardening

## Scope Mapping

| Requirement | Existing starting points | Required integration |
|---|---|---|
| SAS-01 multi-org isolation | `src/trpc/context.ts`, `src/trpc/middleware.ts`, `src/db/entities/**`, `tests/api/rest-parity.test.ts` | Cross-org negative tests for every domain. Optional PostgreSQL RLS migrations/helpers. |
| SAS-02 PostgreSQL pooling | `src/db/mikro-orm.config.ts`, `src/config/database.ts`, `src/cli/index.ts`, `src/cli/doctor.ts` | Env/config pool settings, pool metrics in doctor/status, load test. |
| SAS-03 injectable EventBus | `src/subscriptions/event-bus.ts`, `src/subscriptions/procedures.ts`, `src/subscriptions/pglite-bridge.ts`, `src/services/AutomationService.ts`, `src/workers/metrics-rollup.ts` | Replace `getEventBus()` singleton call sites with DI/context injection; add PostgreSQL NOTIFY adapter. |
| SAS-04 auth org switching/member management | `src/auth/index.ts`, `src/auth/adapter.ts`, `src/db/entities/auth/*`, `tests/auth/saas-auth.test.ts`, `tests/auth/better-auth-integration.test.ts`, CLI/TUI auth surfaces | Add Web/CLI/TUI/API parity for list/switch/members/roles/invites. |
| SAS-05 job queue coordination | `src/queue/index.ts`, `src/workers/registry.ts`, `src/repos/workers/*`, `src/notifications/*worker*.ts`, `src/artifacts/worker.ts`, `src/orchestration/symphony/worker.ts` | Graphile Worker adapter preserving task names, job keys, cron registration, retries. |
| SAS-06 PostgreSQL integration tests | `src/test-utils/db.ts`, `tests/db/migrator-service.test.ts`, `tests/db/migration-downgrade.test.ts`, `tests/infrastructure/test-utils.test.ts`, `scripts/ci.ts` | Testcontainers/URL-backed Postgres suite, gated CI step, no PGlite-only claims. |

## Event Producer / Consumer Map

### Current event systems

| System | Producer examples | Consumer examples | SaaS risk |
|---|---|---|---|
| `src/subscriptions/event-bus.ts` singleton | tRPC mutations, automation setup, metrics rollup setup | tRPC subscriptions, TUI live screens, CLI watch-like flows | Process-local only; no cross-instance delivery. |
| `src/subscriptions/pglite-bridge.ts` | PGlite `NOTIFY` helper | In-process EventBus | PGlite-specific; not wired as generic PostgreSQL adapter. |
| `src/router/event-bus.ts` `RoutingEventBus` | routing rule repository | rules engine hot reload | Separate bus; not SaaS injectable. |
| persisted `Event` entity | audit/domain event paths, repo sync, notifications | notification fanout, audit queries | Good persistence path; not always paired with realtime publish. |

### Required Phase 10 target

```text
Domain mutation
  -> service/repository writes tenant-scoped row
  -> persisted Event row where durable audit/fanout needed
  -> injected EventBus.publish(topic, payload)
  -> InProcess adapter for local/tests OR PostgresNotify adapter for SaaS
  -> subscriptions in Web/CLI/TUI receive same topic shape
```

### Files that must not break

- `src/subscriptions/procedures.ts` — public tRPC subscription contract.
- `src/tui/screens/runs.ts`, `src/tui/screens/notifications.ts`, `src/tui/screens/orchestration.ts` — live TUI consumers.
- `src/notifications/realtime-bell.ts`, `src/notifications/bell-counter-poll.ts` — notification parity.
- `src/services/AutomationService.ts` — task automation listener.
- `src/workers/metrics-rollup.ts` — metrics rollup listener.
- `tests/subscriptions/*.test.ts` — existing EventBus/PGlite bridge behavior.

## Auth / Organization Data Flow

```text
Request -> SvelteKit hooks/AuthService
  -> Better Auth session
  -> session.activeOrganizationId/session.orgId
  -> createContext({ userId, orgId, session, em, container })
  -> permissionedProcedure
  -> service/repository query scoped to ctx.orgId
  -> response includes active org where relevant
```

Required additions:

- Ensure active organization cannot be set to an org where user lacks `OrgMember`.
- Ensure `ctx.orgId` derives from active org in SaaS mode, not stale default org.
- Ensure member role checks gate org management mutations.
- Emit audit events for org switch, member add/remove, role change, invite create/cancel/accept.

Files:

- `src/auth/index.ts` — Better Auth config and plugin hooks.
- `src/auth/adapter.ts` — maps Better Auth `member` and `invitation` to MikroORM.
- `src/db/entities/auth/Org.ts`
- `src/db/entities/auth/OrgMember.ts`
- `src/db/entities/auth/Invitation.ts`
- `src/db/entities/auth/Session.ts`
- `src/web/src/hooks.server.ts`
- `src/cli/commands/auth.ts`
- `src/tui/screens/settings.ts` or new org screen if existing screen cannot fit.

## Tenant Isolation Audit Targets

Every tenant-owned entity/repository needs one of:

- PostgreSQL RLS policy with integration test; or
- explicit repository/service org-scope test explaining why RLS is not used.

High-priority tables/domains:

- Auth/org: `Org`, `User`, `Session`, `Account`, `OrgMember`, `Invitation`.
- Tasks: `Task`, `Sprint`, `TaskStatus`, `CustomFieldDef`, `SavedView`, comments/watchers/relationships/templates/recurrence.
- Docs/memory/search: `Document`, `DocVersion`, `DocComment`, `Memory`, `ContextSnapshot`, `SearchDocument`.
- Runs/orchestration: `AgentRun`, `WorkflowDefinition`.
- Repos/artifacts: `Repo`, `RepoBranch`, `RepoCommit`, `RepoFilesIndex`, `Artifact`, `Edge`.
- Notifications/audit/webhooks: `Notification*`, `Webhook*`, `Event`, `EventRetentionPolicy`.
- Platform/settings: `TenantSetting`, `Credential`, `TelemetryEvent`, `ErrorLog`, flags/experiments.

## PostgreSQL Pooling Integration

Current:

- `src/db/mikro-orm.config.ts` selects PGlite when passed `pglite`, PostgreSQL when `DATABASE_URL` resolves to postgres.
- `src/cli/index.ts` builds PostgreSQL ORM through `MikroORM.init(createOrmConfig())`.
- `pg@8.20.0` exists in root dependencies.

Required:

- Add typed database pool config parsing in `src/config/database.ts` or adjacent module.
- Pass `pool` into MikroORM config only for PostgreSQL mode.
- Add doctor check in `src/cli/doctor.ts` reporting backend, pool min/max/timeouts, and runtime pool counters if accessible.
- Add load test using concurrent tRPC/API calls and assert pool max not exceeded.

## Graphile Worker Integration

Current:

- `src/workers/registry.ts` is in-process task registry.
- `src/queue/index.ts` defines task/queue/cron abstractions.
- Worker task modules already define stable task names and payload assertions.

Target:

```text
Existing task module
  -> WorkerRegistry.registerTask(name, assertPayload, handler)
  -> GraphileWorkerAdapter registers task list
  -> queue.addJob(name, payload, { jobKey })
  -> graphile-worker executes handler with same payload assertion
```

Required constraints:

- Preserve `jobKey` dedupe semantics in repo sync helpers.
- Cron registration remains declarative; adapter translates `CronDefinition` to graphile-worker schedule.
- Failures propagate to graphile-worker retry/attempt handling; handlers must not swallow errors.
- In-memory registry remains test/local fallback.

Files:

- `src/queue/index.ts`
- `src/workers/registry.ts`
- `src/repos/workers/sync-local.ts`
- `src/repos/workers/sync-remote.ts`
- `src/artifacts/worker.ts`
- `src/notifications/fanout-worker.ts`
- `src/notifications/delivery-worker.ts`
- `src/notifications/delivery-retry.ts`
- `src/workers/metrics-rollup.ts`
- `src/services/RecurrenceService.ts`
- `src/orchestration/symphony/worker.ts`

## PostgreSQL Integration Test Plan

Add `tests/postgres/` or `tests/integration/postgres/` with helpers:

- `withPostgresTestDb()` chooses `FULCRUM_TEST_DATABASE_URL` first, else `@testcontainers/postgresql`.
- `createPostgresOrm()` initializes MikroORM against real PostgreSQL.
- `seedTwoOrgs()` creates org A/org B plus users/members.
- `expectNoCrossOrgLeak()` checks list/get/update/delete negative paths.

CI integration:

- Add optional-gated `postgres:integration` stage to `scripts/ci.ts`.
- Default local `bun run ci` can skip when Docker/URL unavailable, but Phase 10 completion must include a recorded run where PostgreSQL integration stage is green.
- If skipped, CI output must say exactly why and which env var enables it.

## Cross-Phase Dependencies

- Phase 08 parity decisions require every SaaS hardening capability to appear in Web/CLI/TUI/API where applicable.
- Phase 09 test/coverage gates require new PostgreSQL integration and parity tests to plug into `scripts/ci.ts`.
- Phase 07 notification/artifact/repo workers depend on graphile-worker adapter preserving task names and job keys.
- Phase 05 task hierarchy/comments/metrics/sprints depend on tenant isolation across the richest domain tables.
- Phase 03 Symphony orchestration depends on cross-instance job and EventBus behavior for SaaS run dispatch.

## Files Downstream Agents Must Read

- `.planning/phases/10-saas-hardening/10-RESEARCH-PLATFORMS.md`
- `.planning/phases/10-saas-hardening/10-RESEARCH-DEPENDENCIES.md`
- `.planning/ROADMAP.md` §Phase 10
- `.planning/REQUIREMENTS.md` §SaaS Hardening
- `.planning/phases/08-surface-delivery/08-CONTEXT.md`
- `.planning/phases/09-cross-cutting-testing/09-CONTEXT.md`
- `src/auth/index.ts`
- `src/auth/adapter.ts`
- `src/trpc/context.ts`
- `src/trpc/middleware.ts`
- `src/db/mikro-orm.config.ts`
- `src/db/db.module.ts`
- `src/subscriptions/event-bus.ts`
- `src/subscriptions/pglite-bridge.ts`
- `src/subscriptions/procedures.ts`
- `src/queue/index.ts`
- `src/workers/registry.ts`
- `scripts/ci.ts`
