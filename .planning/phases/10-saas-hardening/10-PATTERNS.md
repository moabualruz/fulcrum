# Phase 10: SaaS Hardening - Pattern Map

**Date:** 2026-05-06

## Closest Existing Patterns

| New work | Existing analog | Reuse rule |
|---|---|---|
| Org switch/member procedures | `src/auth/index.ts`, `src/auth/adapter.ts`, `tests/auth/better-auth-integration.test.ts` | Keep Better Auth/MikroORM adapter shape; add parity wrappers, not custom auth storage. |
| Tenant isolation checks | `tests/api/rest-parity.test.ts`, `src/trpc/middleware.ts` | Reuse `ctx.orgId` and 403 mismatch expectations. |
| PostgreSQL ORM bootstrap | `src/db/mikro-orm.config.ts`, `src/cli/index.ts`, `tests/db/migrator-service.test.ts` | Extend existing config resolver and MikroORM init path. |
| EventBus migration | `src/subscriptions/event-bus.ts`, `src/subscriptions/pglite-bridge.ts`, `src/subscriptions/procedures.ts` | Keep topic names and subscription payload schemas stable. |
| Worker adapter | `src/queue/index.ts`, `src/workers/registry.ts`, `src/repos/workers/sync-remote.ts` | Preserve task names, payload assertions, `jobKey` dedupe. |
| CI integration | `scripts/ci.ts`, `tests/platform/gate-regressions.test.ts` | Add deterministic local CI stage and gate regression assertion. |

## Files That Must Not Break

- `src/trpc/context.ts`
- `src/trpc/middleware.ts`
- `src/auth/index.ts`
- `src/auth/adapter.ts`
- `src/db/mikro-orm.config.ts`
- `src/subscriptions/procedures.ts`
- `src/queue/index.ts`
- `src/workers/registry.ts`
- `scripts/ci.ts`

## Implementation Bias

Prefer adapter seams over rewrites. Phase 10 is a hardening phase: prove and connect existing architecture under PostgreSQL SaaS constraints.
