# Phase 10 Research: Dependency Decisions

**Date:** 2026-05-06
**Phase:** 10 SaaS Hardening

## Dependency Matrix

| Need | Adopt / Keep / Avoid | Exact package | Rationale |
|---|---|---|---|
| Organization auth/member management | Keep | `better-auth` existing | Already integrated with organization plugin, sessions, `OrgMember`, invitations. Extend parity; do not replace. |
| PostgreSQL driver/pool | Keep | `pg@8.20.0`, `@types/pg@8.20.0` | Already present. Expose MikroORM pool config and doctor metrics. |
| ORM pool config | Keep | `@mikro-orm/postgresql` existing | MikroORM supports `pool?: PoolConfig` in connection options. Add env/config mapping. |
| PostgreSQL job queue | Add | `graphile-worker@0.18.0` or current latest compatible with Bun/Node ESM at implementation time | Best stack fit: PostgreSQL-backed queue, no Redis/RabbitMQ service. Must be researched again by planner before final install because current exact latest can change. |
| PostgreSQL integration tests | Add dev dependency | `@testcontainers/postgresql@11.6.0`, `testcontainers@11.6.0` if peer/direct import needed | Official Node Testcontainers PostgreSQL module. Use only for gated integration suite. |
| External pooler | Do not add npm package | PgBouncer deployment config/docs only | PgBouncer is external infrastructure. Fulcrum should be compatible, not bundle it. |
| Redis event bus | Avoid for v1 | `ioredis`, `redis` | Adds required SaaS infrastructure; PostgreSQL NOTIFY is enough for v1 tests. |
| NATS event bus | Avoid for v1 | `nats` | Same reason; useful v2 option only. |
| RLS helper library | Avoid | `pg-tenant`, custom wrappers | Fulcrum has MikroORM context and migrations; add small explicit helper/tests instead of dependency. |
| SaaS auth provider | Avoid | Clerk/Auth0/WorkOS SDKs | Better Auth already owns auth; platform patterns copied without hosted dependency. |
| Load testing | Prefer scripts first | none initially; optional `autocannon` only if planner needs HTTP load | SAS-02 can test pool directly through `pg`/MikroORM and app router calls. |

## Exact Configuration Decisions

### MikroORM / pg pool env vars

Add config mapping for SaaS mode:

- `FULCRUM_DB_POOL_MIN` default `0`
- `FULCRUM_DB_POOL_MAX` default `10`
- `FULCRUM_DB_IDLE_TIMEOUT_MS` default `30000`
- `FULCRUM_DB_CONNECTION_TIMEOUT_MS` default `2000`
- `FULCRUM_DB_MAX_LIFETIME_SECONDS` optional; apply only if supported by current driver path

MikroORM config target:

```ts
pool: {
  min,
  max,
  idleTimeoutMillis,
  connectionTimeoutMillis,
}
```

Do not set large defaults. If SaaS runs multiple app instances, total DB usage is roughly `instances * pool.max + worker pools + admin connections`.

### PostgreSQL integration test dependencies

Preferred:

```bash
bun add -d @testcontainers/postgresql@11.6.0 testcontainers@11.6.0
```

Planner must verify package resolution with Bun before implementation. If Testcontainers fails under Bun, fallback is a documented `FULCRUM_TEST_DATABASE_URL` path with Docker Compose or developer-provided PostgreSQL.

### Graphile Worker

Preferred:

```bash
bun add graphile-worker
```

Planner must pin the exact resolved version in `package.json` and verify:

- Bun runtime import works.
- Task registration can wrap existing `WorkerRegistry` task names.
- Job keys preserve dedupe semantics already expected by repo sync tests.
- Advisory-lock/coordination behavior works with two worker instances against one PostgreSQL DB.

## Avoided Architectures

### Hosted auth replacement

Do not adopt Clerk/Auth0/WorkOS SDKs for v1. Fulcrum already uses Better Auth and local-first is a product constraint. Hosted providers are research references only.

### Required Redis/NATS

Do not require Redis/NATS for SaaS v1. A PostgreSQL-only deployment keeps ops simpler and matches Graphile Worker/PostgreSQL already required by SAS.

### Separate databases per tenant

Do not split tenants into separate DBs/schemas in Phase 10. Existing code, local-first mode, and tests are built around shared schema with `orgId`.

### PgBouncer transaction-mode assumptions

Do not require code behavior that depends on session-level state. If RLS uses `current_setting`, set it transaction-locally in the same transaction as protected queries.

## Required Dependency Verification

Before Phase 10 implementation:

- Run `bun install` after adding dependencies.
- Run `bun run lint`.
- Run focused PostgreSQL integration smoke using Testcontainers or `FULCRUM_TEST_DATABASE_URL`.
- Run full `bun run ci` before claiming complete.

## Sources

- Better Auth organization plugin: https://better-auth.com/docs/plugins/organization
- MikroORM connection configuration: https://mikro-orm.io/docs/configuration
- node-postgres Pool API: https://node-postgres.com/apis/pool
- Graphile Worker repository: https://github.com/graphile/worker
- Testcontainers PostgreSQL module: https://node.testcontainers.org/modules/postgresql/
- PgBouncer feature map: https://www.pgbouncer.org/features.html
