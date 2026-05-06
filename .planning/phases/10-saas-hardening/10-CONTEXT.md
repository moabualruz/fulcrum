# Phase 10: SaaS Hardening - Context

**Gathered:** 2026-05-06
**Status:** Ready for planning
**Research basis:** Deep platform, dependency, and codebase integration research persisted in `10-RESEARCH-PLATFORMS.md`, `10-RESEARCH-DEPENDENCIES.md`, and `10-RESEARCH-INTEGRATION.md`.

<domain>
## Phase Boundary

Phase 10 validates Fulcrum's SaaS posture on real PostgreSQL after local-first product completion: multi-org data isolation, Better Auth organization switching and member management, PostgreSQL pooling, injectable cross-instance EventBus, PostgreSQL-backed job coordination, and PostgreSQL integration tests. Scope is hardening and proving SAS-01..06 with maximum practical Web/CLI/TUI/API parity. Scope is not billing, SSO/SAML, multi-region hosting, marketplace hosting, or replacing Better Auth.

</domain>

<decisions>
## Implementation Decisions

### Deep Research Standard
- **D-01:** Phase 10 planning must follow Phase 5/8/9 research rigor: competitive platform UX research, dependency/library research, and codebase integration mapping must be read before implementation decisions.
- **D-02:** Downstream plans must name exact packages, exact platform patterns, exact interaction behavior, exact integration files, event producer/consumer paths, and files that must not break.
- **D-03:** Research artifacts are canonical and disk-backed: `.planning/phases/10-saas-hardening/10-RESEARCH-PLATFORMS.md`, `10-RESEARCH-DEPENDENCIES.md`, and `10-RESEARCH-INTEGRATION.md`.

### Maximum Interface Parity
- **D-04:** Every SAS capability needs an explicit parity row across Web, CLI, TUI, API/tRPC, and tests where applicable: org switcher, org members/roles/invites, tenant isolation audit/status, database pool status, EventBus status, worker/queue status, PostgreSQL integration status.
- **D-05:** Parity is capability-equivalent: Web is full admin UX, CLI is scriptable JSON/status/action UX, TUI is keyboard operational/admin UX, API/tRPC is shared automation contract.
- **D-06:** No surface owns SaaS business logic. Web/CLI/TUI/API call shared auth/tRPC/service/repository paths. Direct DB shortcuts from surfaces are bugs unless isolated test utilities already do so.
- **D-07:** Every CLI command added or hardened in Phase 10 must support `--json` and return schema-shaped data. Human output is secondary.

### Multi-Org Isolation
- **D-08:** Fulcrum v1 SaaS uses shared-schema PostgreSQL with `org_id` tenant discriminator. Do not split tenants into separate databases or schemas in Phase 10.
- **D-09:** Tenant isolation must be defense in depth: application-level `ctx.orgId` scoping on every service/repository path plus PostgreSQL RLS where feasible for SaaS mode.
- **D-10:** PostgreSQL RLS should be evaluated with transaction-local tenant identity, e.g. `SET LOCAL fulcrum.org_id = ...`; do not depend on session-level settings because PgBouncer transaction pooling can break session assumptions.
- **D-11:** SAS-01 is not complete until a cross-org negative test matrix covers list/get/update/delete or equivalent read/mutate paths for tasks, docs, memory, runs, repos, artifacts, notifications, audit/events, credentials/secrets, settings, search, and REST/tRPC surfaces.
- **D-12:** Any table that cannot use RLS must have a documented exception in planning plus repository/service org-scope tests proving no cross-org leakage.

### Auth Org Switching + Member Management
- **D-13:** Keep Better Auth as the SaaS organization/member provider. Do not adopt Clerk/Auth0/WorkOS SDKs in v1; copy their platform patterns only.
- **D-14:** Active organization is the workspace scope. SaaS request context must derive `ctx.orgId` from the user's active organization and reject orgs where the user lacks `OrgMember`.
- **D-15:** Role checks use organization-scoped membership roles, not global user role shortcuts. Baseline roles: `owner`, `admin`, `member`.
- **D-16:** Org management parity: Web settings/admin page, CLI `orgs` commands, TUI organization screen, and tRPC/API procedures for list/switch/members/invites/role update/remove.
- **D-17:** Member and org mutations emit audit events: org switch, member add/remove, role change, invite create/cancel/accept/reject.

### PostgreSQL Pooling
- **D-18:** Use existing `pg@8.20.0` and MikroORM PostgreSQL pool configuration. Do not add another database client.
- **D-19:** Add explicit SaaS pool config: `FULCRUM_DB_POOL_MIN`, `FULCRUM_DB_POOL_MAX`, `FULCRUM_DB_IDLE_TIMEOUT_MS`, `FULCRUM_DB_CONNECTION_TIMEOUT_MS`, and optional max lifetime if supported cleanly.
- **D-20:** Default pool max remains conservative (`10` unless planner finds existing config says otherwise). Doctor/status must expose configured values and runtime pool health where accessible.
- **D-21:** PgBouncer is deployment compatibility guidance, not a bundled dependency. Fulcrum code must avoid session-level features in paths expected to work behind transaction pooling.
- **D-22:** SAS-02 requires load/concurrency verification against real PostgreSQL, including a failure mode test for pool exhaustion/timeout.

### Injectable Cross-Instance EventBus
- **D-23:** Replace process-singleton assumptions with an injectable EventBus port while keeping current topic names stable.
- **D-24:** Required adapters: in-process local/test adapter and PostgreSQL `LISTEN/NOTIFY` SaaS adapter. Redis/NATS adapters are v2 unless PostgreSQL NOTIFY cannot satisfy tests.
- **D-25:** `getEventBus()` may remain as compatibility shim during migration, but new service/router code must receive EventBus through DI/context.
- **D-26:** Cross-instance test must prove publisher instance A can notify subscriber instance B through PostgreSQL using existing subscription topics.
- **D-27:** Do not break existing local/PGlite EventBus and subscription tests; local-first remains default behavior.

### Job Queue Coordination
- **D-28:** Add PostgreSQL-backed worker coordination with `graphile-worker`, preserving existing task names, payload assertions, cron declarations, retry behavior, and `jobKey` dedupe semantics.
- **D-29:** The in-process `WorkerRegistry` remains local/test abstraction; graphile-worker is an adapter for SaaS PostgreSQL mode, not a rewrite of every worker module.
- **D-30:** Required coordinated tasks include repo sync local/remote/LRU warmup, artifact harvest/prune, notification fanout/delivery/retry, metrics rollup, recurrence processing, audit prune, and Symphony poll/stall where applicable.
- **D-31:** Worker/queue status parity must show queue depth, failed jobs, delayed jobs, last processed time, instance ID, and worker health in Web/CLI/TUI/API.
- **D-32:** SAS-05 requires a two-worker PostgreSQL integration test proving one logical job is processed once under concurrent workers.

### PostgreSQL Integration Testing
- **D-33:** PGlite unit/default tests are not sufficient for Phase 10 completion. Add a real PostgreSQL suite using `@testcontainers/postgresql@11.6.0` or `FULCRUM_TEST_DATABASE_URL`.
- **D-34:** `scripts/ci.ts` remains local CI source of truth. Add a visible PostgreSQL integration stage that can skip only with an explicit reason, but Phase 10 completion must record a green PostgreSQL run.
- **D-35:** PostgreSQL integration suite must cover tenant isolation, auth org switch/member roles, pooling/load, EventBus cross-instance, graphile-worker coordination, and migrations up/down.
- **D-36:** Use `postgres:17-alpine` or the current PostgreSQL stable container image selected by the planner; record exact image tag in plan and tests.

### the agent's Discretion
- Exact plan wave split is planner discretion, but research and parity matrix must come before implementation tasks.
- Exact Web route/component placement is flexible if it fits existing settings/admin navigation.
- Exact CLI command spelling can follow existing command registry conventions, but canonical Phase 10 examples should use plural domain `orgs`.
- Exact RLS helper implementation is planner discretion if tests prove no cross-org leakage and PgBouncer-compatible transaction-local behavior.
- Exact graphile-worker version must be verified at implementation time and pinned in `package.json`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 10 Research
- `.planning/phases/10-saas-hardening/10-RESEARCH-PLATFORMS.md` — competitive SaaS/org/RLS/pooling/job/test platform patterns.
- `.planning/phases/10-saas-hardening/10-RESEARCH-DEPENDENCIES.md` — exact package decisions and dependency adoption/avoidance.
- `.planning/phases/10-saas-hardening/10-RESEARCH-INTEGRATION.md` — codebase integration map, event producer/consumer map, files that must not break.

### Requirements
- `.planning/ROADMAP.md` §Phase 10 — scope, dependencies, TDD expectation, success criteria.
- `.planning/REQUIREMENTS.md` §SaaS Hardening (SAS-01..06) — requirement source of truth.
- `.planning/PROJECT.md` — local-first, three-surface, PostgreSQL SaaS path, no-deferrals v1 posture.
- `.planning/STATE.md` — current branch/session state; Phase 09 complete and ready for Phase 10.

### Prior Phase Decisions
- `.planning/phases/08-surface-delivery/08-CONTEXT.md` — maximum parity contract across Web/CLI/TUI/REST.
- `.planning/phases/09-cross-cutting-testing/09-CONTEXT.md` — local CI, coverage, audit, PostgreSQL-related hardening gates.
- `.planning/phases/07-repos-artifacts-notifications/07-CONTEXT.md` — worker/task/event dependencies for repos, artifacts, notifications.
- `.planning/phases/05-task-management-metrics/05-CONTEXT.md` — rich tenant-scoped task/project/sprint domain and Phase 5 research standard.

### External References
- Better Auth organization plugin: https://better-auth.com/docs/plugins/organization
- Auth0 organization member roles: https://auth0.com/docs/manage-users/organizations/configure-organizations/add-member-roles
- PostgreSQL row security policies: https://www.postgresql.org/docs/17/ddl-rowsecurity.html
- node-postgres Pool API: https://node-postgres.com/apis/pool
- MikroORM connection configuration: https://mikro-orm.io/docs/configuration
- PgBouncer feature map: https://www.pgbouncer.org/features.html
- Graphile Worker repository: https://github.com/graphile/worker
- Testcontainers PostgreSQL module: https://node.testcontainers.org/modules/postgresql/

### Codebase Starting Points
- `src/auth/index.ts` — Better Auth configuration, organization plugin, SaaS auth gate.
- `src/auth/adapter.ts` — Better Auth model mapping to MikroORM entities.
- `src/db/entities/auth/Org.ts`, `src/db/entities/auth/OrgMember.ts`, `src/db/entities/auth/Invitation.ts`, `src/db/entities/auth/Session.ts` — org/session persistence.
- `src/web/src/hooks.server.ts` — session/context injection for Web.
- `src/trpc/context.ts` — request context carrying session/user/org/EM/container.
- `src/trpc/middleware.ts` — permission/session enforcement.
- `src/db/mikro-orm.config.ts` — PostgreSQL/PGlite ORM config and entity list.
- `src/db/db.module.ts` — DI registration.
- `src/config/database.ts` — database backend resolution.
- `src/cli/index.ts` — CLI PostgreSQL/PGlite container bootstrap.
- `src/cli/doctor.ts` — doctor/status checks.
- `src/subscriptions/event-bus.ts` — current in-process EventBus.
- `src/subscriptions/pglite-bridge.ts` — current PGlite LISTEN/NOTIFY bridge.
- `src/subscriptions/procedures.ts` — tRPC subscriptions.
- `src/router/event-bus.ts` and `src/router/rules-engine.ts` — separate routing EventBus to reconcile.
- `src/queue/index.ts` — queue/cron abstractions.
- `src/workers/registry.ts` — in-process worker registry.
- `src/repos/workers/sync-local.ts`, `src/repos/workers/sync-remote.ts` — repo worker task/jobKey patterns.
- `src/artifacts/worker.ts`, `src/artifacts/pruner.ts` — artifact worker/prune tasks.
- `src/notifications/fanout-worker.ts`, `src/notifications/delivery-worker.ts`, `src/notifications/delivery-retry.ts` — notification worker tasks.
- `src/workers/metrics-rollup.ts` — EventBus-driven metrics worker.
- `src/services/RecurrenceService.ts` — recurrence worker integration.
- `src/orchestration/symphony/worker.ts` — Symphony worker/cron lifecycle.
- `src/test-utils/db.ts` — current test DB utilities.
- `tests/auth/saas-auth.test.ts`, `tests/auth/better-auth-integration.test.ts` — auth baseline tests.
- `tests/api/rest-parity.test.ts` — current REST org mismatch baseline.
- `tests/subscriptions/` — EventBus/PGlite bridge/subscription tests.
- `tests/workers/registry.test.ts` — worker registry baseline.
- `scripts/ci.ts` — local CI source of truth.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/auth/index.ts`: Better Auth organization plugin already enabled, SaaS-only OAuth/magic/OTP gated behind `saas-auth`.
- `src/auth/adapter.ts`: existing mapping for `member` and `invitation` models to `OrgMember` and `Invitation`.
- `src/trpc/context.ts` and `src/trpc/middleware.ts`: already require session/user/org for protected tRPC procedures.
- `src/db/mikro-orm.config.ts`: single entity list and backend selection for PGlite vs PostgreSQL.
- `src/subscriptions/event-bus.ts`, `src/subscriptions/pglite-bridge.ts`, `src/subscriptions/procedures.ts`: existing topic model and local bridge to preserve.
- `src/queue/index.ts` and `src/workers/registry.ts`: adapter seam for graphile-worker without rewriting worker modules.
- `tests/api/rest-parity.test.ts`: existing 403 org mismatch pattern for REST.
- `tests/auth/saas-auth.test.ts`: existing SaaS auth flag baseline.

### Established Patterns
- Web/CLI/TUI/API should converge on tRPC/service/repository paths.
- MikroORM is canonical; product-kernel/raw SQL expansion is forbidden.
- Feature flags use `FULCRUM_FEATURES` / `FULCRUM_FLAG_*`.
- Root tests use `bun:test`; web tests use Vitest/Playwright; CI gate is `bun run ci`.
- Local-first PGlite remains default; PostgreSQL SaaS is opt-in by `DATABASE_URL` or explicit config.

### Integration Points
- Better Auth session -> active organization -> `createContext()` -> permission middleware -> org-scoped service/repository query.
- Tenant mutation -> durable `Event` where needed -> injected EventBus publish -> Web/CLI/TUI subscription topics.
- Existing queue definitions -> graphile-worker adapter -> PostgreSQL job table -> existing task handler and payload assertion.
- PostgreSQL pool config -> MikroORM/pg driver -> doctor/status metrics -> load/concurrency tests.
- PostgreSQL test helper -> real migrations -> two-org seed -> cross-org negative test matrix.

</code_context>

<specifics>
## Specific Ideas

- Copy Better Auth's active organization and member-management API shape directly; avoid custom org semantics.
- Copy Auth0's "roles assigned to organization members" mental model, not global account roles.
- Copy Supabase/PostgreSQL RLS defense-in-depth posture for pooled shared-schema tenancy.
- Copy Graphile Worker's PostgreSQL-only queue posture; avoid Redis/RabbitMQ/NATS for v1.
- Copy GitHub/Sentry-style operational status panels for worker health, queue depth, failed jobs, pool health, and tenant isolation test status.
- Keep Phase 8/9 parity discipline: every SaaS hardening feature gets Web/CLI/TUI/API/test rows.

</specifics>

<deferred>
## Deferred Ideas

- Billing, plans, subscriptions, metering, and usage quotas — future SaaS/business phase.
- SSO/SAML/OIDC beyond Google/GitHub OAuth — v2 requirement ADV-08.
- Multi-region deployment and tenant placement — v2 requirement ADV-06.
- Redis/NATS event bus adapters — future scale option; PostgreSQL NOTIFY is v1 SaaS target.
- Separate database/schema per tenant — enterprise/v2 isolation option, not Phase 10.
- Hosted Clerk/Auth0/WorkOS replacement — out of scope; Better Auth remains v1 auth provider.

</deferred>

---

*Phase: 10-SaaS Hardening*
*Context gathered: 2026-05-06*
