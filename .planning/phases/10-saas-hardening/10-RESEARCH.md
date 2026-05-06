# Phase 10: SaaS Hardening - Research

**Date:** 2026-05-06
**Status:** Research complete

## Research Complete

Phase 10 planning is grounded in four disk-backed deep research artifacts created during discuss-phase and closure expansion:

- `.planning/phases/10-saas-hardening/10-RESEARCH-PLATFORMS.md`
- `.planning/phases/10-saas-hardening/10-RESEARCH-DEPENDENCIES.md`
- `.planning/phases/10-saas-hardening/10-RESEARCH-INTEGRATION.md`
- `.planning/phases/10-saas-hardening/10-RESEARCH-DEFERRED-CLOSURE.md`

## Planning Guidance

Planner must implement SAS-01..06 and CLOSURE-01..18 as one milestone closure program:

- Shared-schema PostgreSQL SaaS with `org_id` tenant discriminator.
- Application-level `ctx.orgId` scoping plus PostgreSQL RLS where feasible.
- Better Auth organization plugin remains the auth/org source of truth.
- Existing `pg@8.20.0` and MikroORM PostgreSQL driver own connection pooling.
- EventBus becomes injectable with local and PostgreSQL NOTIFY adapters.
- `graphile-worker` becomes the PostgreSQL-backed worker adapter.
- Real PostgreSQL integration tests use `@testcontainers/postgresql@11.6.0` or `FULCRUM_TEST_DATABASE_URL`.
- Deferred Phases 2-9 items are imported into CLOSURE requirements and plans 10-10..10-13.
- `$huashu-design` is a mandatory product-surface gate for Web, CLI, and TUI, recorded in `10-UI-SPEC.md`.
- Hosted/cloud integrations are config-gated adapters. Local PGlite mode must remain green with no external secrets.

## Validation Architecture

Phase 10 cannot pass with PGlite-only tests. Validation requires:

- Two-org tenant isolation matrix.
- Auth org switch/member role tests.
- PostgreSQL pool config/load tests.
- Cross-instance EventBus tests.
- Two-worker graphile-worker coordination tests.
- PostgreSQL migration up/down and CI integration stage.
- Closure product feature tests for task/time/goals/reports/search/docs.
- Closure integration tests for Slack/Discord/email/tracker/billing/attestation/observability adapters.
- Huashu Web/CLI/TUI source/snapshot/FakeTTY tests.
- Final parity matrix covering SAS-01..06 and CLOSURE-01..18.

## Sources

See the source lists in the four `10-RESEARCH-*.md` artifacts.
