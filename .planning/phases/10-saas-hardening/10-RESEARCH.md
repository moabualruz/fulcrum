# Phase 10: SaaS Hardening - Research

**Date:** 2026-05-06
**Status:** Research complete

## Research Complete

Phase 10 planning is grounded in the three disk-backed deep research artifacts created during discuss-phase:

- `.planning/phases/10-saas-hardening/10-RESEARCH-PLATFORMS.md`
- `.planning/phases/10-saas-hardening/10-RESEARCH-DEPENDENCIES.md`
- `.planning/phases/10-saas-hardening/10-RESEARCH-INTEGRATION.md`

## Planning Guidance

Planner must implement SAS-01..06 as one SaaS hardening program:

- Shared-schema PostgreSQL SaaS with `org_id` tenant discriminator.
- Application-level `ctx.orgId` scoping plus PostgreSQL RLS where feasible.
- Better Auth organization plugin remains the auth/org source of truth.
- Existing `pg@8.20.0` and MikroORM PostgreSQL driver own connection pooling.
- EventBus becomes injectable with local and PostgreSQL NOTIFY adapters.
- `graphile-worker` becomes the PostgreSQL-backed worker adapter.
- Real PostgreSQL integration tests use `@testcontainers/postgresql@11.6.0` or `FULCRUM_TEST_DATABASE_URL`.

## Validation Architecture

Phase 10 cannot pass with PGlite-only tests. Validation requires:

- Two-org tenant isolation matrix.
- Auth org switch/member role tests.
- PostgreSQL pool config/load tests.
- Cross-instance EventBus tests.
- Two-worker graphile-worker coordination tests.
- PostgreSQL migration up/down and CI integration stage.

## Sources

See the source lists in the three `10-RESEARCH-*.md` artifacts.
