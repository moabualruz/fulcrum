# Phase 10 Research: SaaS Platform Patterns

**Date:** 2026-05-06
**Phase:** 10 SaaS Hardening
**Scope:** SAS-01..06: multi-org isolation, PostgreSQL pooling, injectable EventBus, org switching/member management, graphile-worker coordination, PostgreSQL integration tests.

## Executive Summary

Phase 10 should harden Fulcrum as a pooled, shared-schema SaaS, not introduce separate databases or schemas per tenant. Fulcrum already models `orgId` throughout entities, tRPC context, REST test auth, and Better Auth organization tables; the competitive pattern to match is "workspace/organization switcher + role-scoped membership + defense-in-depth tenant isolation".

The strongest platform references:

| Platform | Pattern to Copy | Phase 10 Impact |
|---|---|---|
| Better Auth organization plugin | Active organization, list orgs, member CRUD, invitations, owner/admin/member roles | Keep Better Auth as source for auth/org UX; expose parity through Web/CLI/TUI/API |
| Auth0 Organizations | Roles assigned per organization member, not globally | Avoid global user role shortcuts in SaaS paths |
| Supabase/PostgreSQL RLS | Database-enforced row filtering as defense in depth | Add RLS or mandatory org-scope audit for tenant tables |
| Graphile Worker | PostgreSQL-backed horizontal job queue | Use `graphile-worker` for multi-instance job coordination rather than bespoke in-memory registry |
| PgBouncer/node-postgres | App pool metrics + optional external pooler | Configure MikroORM/pg pool first; document PgBouncer constraints for SaaS deploys |
| Testcontainers Node PostgreSQL | Throwaway real PostgreSQL DBs for integration tests | Add gated PostgreSQL integration suite, not PGlite-only assertions |

## Multi-Org Product UX

### Organization switcher

Better Auth's organization plugin provides the exact UX/API shape Fulcrum should match:

- `organization.list` lists organizations for the session user.
- `organization.setActive` changes active organization by `organizationId` or `organizationSlug`.
- `organization.getActiveMember` and `getActiveMemberRole` expose role in active org.
- `organization.listMembers`, `addMember`, `removeMember`, and `updateMemberRole` cover member management.

Fulcrum decision: active org is the request scope for Web/tRPC. CLI/TUI/API must explicitly show current org and support switching, but they must not introduce alternative membership state.

Exact surface behaviors:

| Surface | Required behavior |
|---|---|
| Web | Settings/organization page with org switcher, member list, invite/add member, update role, remove member. Header/dashboard shows active org name/slug. |
| CLI | `fulcrum orgs list --json`, `fulcrum orgs switch <slug-or-id> --json`, `fulcrum orgs members list --json`, `add`, `remove`, `role set`. Output includes `active: true` and current role. |
| TUI | Organization screen with active org selector, member table, role column, owner/admin/member labels, and switch action. |
| API/tRPC | `auth.whoami` or org router returns `userId`, `orgId`, `activeOrganizationId`, role, memberships. Mutations enforce member role. |

### Role model

Better Auth defaults map cleanly to Fulcrum v1:

- `owner`: full control.
- `admin`: full control except deleting org/changing owner.
- `member`: read/basic collaboration.

Auth0's organization role pattern reinforces that roles are scoped to organization membership, not global account state. Fulcrum should keep local/dev `admin@local.fulcrum` behavior, but SaaS paths must use `OrgMember.role` and active organization.

## Tenant Isolation Patterns

### Shared schema + `org_id`

Fulcrum already uses shared-schema tenant discrimination. This should remain the v1 SaaS shape because:

- Existing entities and tests already thread `orgId`.
- Local-first/PGlite remains default; separate databases would fracture parity.
- PostgreSQL integration can validate the same schema under `DATABASE_URL`.

### RLS vs application-only scoping

PostgreSQL RLS is a strong defense-in-depth layer. PostgreSQL docs state that when RLS is enabled, rows must be allowed by policy or are default-denied. That exactly matches SAS-01's "zero cross-org leakage" target.

Phase 10 decision: implement the strongest practical tenant isolation:

1. Application layer must pass `ctx.orgId` into every repository/service query.
2. PostgreSQL SaaS mode should enable RLS on tenant-owned tables where feasible.
3. Test suite must include cross-org negative tests for every public domain router and REST route.
4. If a table cannot use RLS because PGlite compatibility blocks it, the plan must document the exception and add a repository-level org-scope test.

Exact RLS approach for planners to evaluate:

```sql
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_tasks ON tasks
  USING (org_id = current_setting('fulcrum.org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('fulcrum.org_id', true)::uuid);
```

Fulcrum must set `SET LOCAL fulcrum.org_id = '<ctx.orgId>'` inside PostgreSQL request transactions if RLS lands. Because PgBouncer transaction pooling can break session-level state, never depend on session-level `SET` for tenant identity.

## Multi-Instance Events

Current Fulcrum uses in-process `EventBus` plus PGlite LISTEN/NOTIFY bridge. This is good local-first architecture but insufficient for SaaS because process-local subscribers do not see events published by another instance.

Competitive SaaS pattern: pluggable transport with local adapter for development, PostgreSQL `LISTEN/NOTIFY` adapter for v1 SaaS, optional Redis/NATS adapter later.

Phase 10 decision:

- Introduce `EventBus` interface/port with adapters:
  - `InProcessEventBus` for local/PGlite/tests.
  - `PostgresNotifyEventBus` for PostgreSQL SaaS v1.
  - `NoopEventBus` for isolated tests if needed.
- Do not add Redis/NATS runtime dependency in v1 unless PostgreSQL NOTIFY cannot satisfy tests.
- Keep topics compatible: `agent_run.<id>`, `project.<id>.tasks`, `org.<id>.notifications`, `orchestration.<orgId>`.

## Job Coordination

Fulcrum currently has an in-process worker registry and queue definitions; Phase 7/9 plans refer to graphile-worker semantics, but root `package.json` does not include `graphile-worker`. SaaS requires real PostgreSQL-backed coordination, not process-local enqueues.

Graphile Worker is the right v1 match because it is a Node/PostgreSQL job queue and fits the existing stack. It avoids Redis/RabbitMQ/NATS as required infrastructure.

Required behavior:

- Multi-instance workers may all run the same registered tasks.
- Duplicate work prevention uses graphile-worker job keys/advisory-lock semantics.
- Existing task names remain stable: `repo.sync.local`, `repo.sync.remote`, artifact harvest, notification fanout/delivery/retry, metrics rollup, recurrence, audit prune, Symphony poll/stall where applicable.
- CLI/TUI/Web status surfaces show worker health, queue depth, failed jobs, delayed jobs, and instance ID.

## Connection Pooling

Phase 10 should configure application-level pooling through MikroORM/`pg` first. node-postgres exposes `max`, `min`, `idleTimeoutMillis`, `connectionTimeoutMillis`, `maxLifetimeSeconds`, and pool counts (`totalCount`, `idleCount`, `waitingCount`) that map directly to doctor/status checks.

PgBouncer is deployment guidance, not a required embedded dependency. If supported, session pooling is safest. Transaction pooling requires care because it breaks session-level features such as `LISTEN` and session-level advisory locks; therefore Fulcrum cannot use session-level RLS settings or session-level advisory locks in code paths that may run behind PgBouncer transaction pooling.

## PostgreSQL Integration Tests

SAS-06 requires real PostgreSQL tests. PGlite remains local-first unit/default test backend, but PostgreSQL integration must run against:

- A real PostgreSQL container through `@testcontainers/postgresql@11.6.0` when Docker is available.
- Or `FULCRUM_TEST_DATABASE_URL` for developer/CI environments without Testcontainers.

Required test classes:

- Tenant isolation matrix across org A/org B for tasks, docs, memory, runs, repos, artifacts, notifications, settings, credentials, audit, search.
- Auth organization switch/member role flows.
- Connection pool load and timeout behavior.
- EventBus cross-process simulation with two app instances sharing PostgreSQL.
- graphile-worker duplicate job coordination across two workers.
- Migration up/down on PostgreSQL.

## Sources

- Better Auth organization plugin: https://better-auth.com/docs/plugins/organization
- Auth0 organization member roles: https://auth0.com/docs/manage-users/organizations/configure-organizations/add-member-roles
- PostgreSQL row security policies: https://www.postgresql.org/docs/17/ddl-rowsecurity.html
- Graphile Worker: https://github.com/graphile/worker
- node-postgres Pool API: https://node-postgres.com/apis/pool
- MikroORM configuration: https://mikro-orm.io/docs/configuration
- PgBouncer features/pooling modes: https://www.pgbouncer.org/features.html
- Testcontainers PostgreSQL module: https://node.testcontainers.org/modules/postgresql/
