# Phase 10: SaaS Hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-06
**Phase:** 10-SaaS Hardening
**Areas discussed:** Multi-org isolation, auth org management, PostgreSQL pooling, injectable EventBus, job coordination, PostgreSQL integration tests, maximum interface parity

---

## Invocation

User requested:

```text
$gsd-discuss-phase 10 --all --auto Make sure maximum feature parity in all interfaces as much as possible and do deep researches similar to the way we did researches in phase 5
```

`--all --auto` auto-selected every gray area and selected recommended defaults without interactive prompts.

---

## Multi-Org Isolation

| Option | Description | Selected |
|--------|-------------|----------|
| Shared-schema `org_id` plus tests | Keep existing architecture; prove org scoping everywhere | |
| Shared-schema `org_id` plus RLS where feasible | Add PostgreSQL defense in depth while preserving local-first | ✓ |
| Separate DB/schema per tenant | Strong isolation but large architecture change | |

**User's choice:** Auto-selected maximum parity / strongest practical SaaS hardening.
**Notes:** Selected shared-schema PostgreSQL with app scoping plus RLS where feasible. Separate DB/schema deferred.

---

## Auth Org Management

| Option | Description | Selected |
|--------|-------------|----------|
| Use Better Auth organization plugin fully | Extend existing integration to org switch/members/roles/invites across surfaces | ✓ |
| Replace with hosted SaaS auth provider | Clerk/Auth0/WorkOS SDK ownership | |
| Build custom org auth from scratch | More code and drift from Better Auth | |

**User's choice:** Auto-selected reuse-first Better Auth path.
**Notes:** Competitive patterns copied from Better Auth/Auth0; hosted SDKs avoided.

---

## PostgreSQL Pooling

| Option | Description | Selected |
|--------|-------------|----------|
| Configure MikroORM/pg pool | Use existing `pg` and MikroORM pool config with doctor/status/load tests | ✓ |
| Bundle PgBouncer | External pooler managed by Fulcrum | |
| Leave defaults implicit | Minimal changes, weak SAS-02 proof | |

**User's choice:** Auto-selected existing dependency path.
**Notes:** PgBouncer documented as deployment compatibility; not npm dependency.

---

## Injectable EventBus

| Option | Description | Selected |
|--------|-------------|----------|
| Keep singleton | Local-only, simplest | |
| Injectable port + PostgreSQL NOTIFY adapter | Local adapter plus SaaS cross-instance adapter | ✓ |
| Redis/NATS required | More scalable but adds infrastructure | |

**User's choice:** Auto-selected PostgreSQL-first v1 SaaS path.
**Notes:** Redis/NATS deferred.

---

## Job Coordination

| Option | Description | Selected |
|--------|-------------|----------|
| Keep in-process registry only | Local-only, fails multi-instance | |
| Add graphile-worker adapter | PostgreSQL-backed queue, fits existing stack | ✓ |
| Add Redis/RabbitMQ queue | Extra infra | |

**User's choice:** Auto-selected `graphile-worker` adapter path.
**Notes:** Preserve existing task names, payload assertions, cron declarations, and job keys.

---

## PostgreSQL Integration Tests

| Option | Description | Selected |
|--------|-------------|----------|
| PGlite-only tests | Fast but does not satisfy SAS-06 | |
| Testcontainers / `FULCRUM_TEST_DATABASE_URL` | Real PostgreSQL, local/developer flexibility | ✓ |
| External CI-only database | Harder local verification | |

**User's choice:** Auto-selected real PostgreSQL test suite.
**Notes:** Testcontainers preferred, URL fallback required.

---

## Maximum Interface Parity

| Option | Description | Selected |
|--------|-------------|----------|
| Web-only SaaS admin | Fast but violates Phase 8 parity | |
| Capability parity across Web/CLI/TUI/API | Full parity with surface-specific UX | ✓ |
| API-only hardening | Scriptable but not product-complete | |

**User's choice:** Auto-selected maximum feature parity.
**Notes:** Every SAS capability needs parity rows and tests.

## the agent's Discretion

- Exact plan wave split.
- Exact Web component/route placement.
- Exact CLI command names if they follow existing conventions and support `--json`.
- Exact graphile-worker version after install-time verification.
- Exact RLS helper shape if tests prove isolation.

## Deferred Ideas

- Billing/plans/quotas.
- SSO/SAML/OIDC beyond current OAuth.
- Multi-region deployment.
- Redis/NATS EventBus adapters.
- Separate database/schema per tenant.
- Hosted auth provider replacement.
