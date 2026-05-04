# Phase 1: Architecture Convergence + Security - Context

**Gathered:** 2026-05-04
**Status:** Ready for planning
**Source:** Wave 2 adversarial architecture review (12 agents)

<domain>
## Phase Boundary

This phase converges Fulcrum's dual data layer into a single MikroORM-based architecture, introduces a service layer between tRPC routers and repositories, unifies three event mechanisms into one EventDispatcher, enforces module boundaries, and patches security vulnerabilities. Everything downstream depends on this — no feature work until architecture is clean.

</domain>

<decisions>
## Implementation Decisions

### Data Layer Convergence (ARCH-01, ARCH-02, ARCH-09)
- Migrate ALL 171+ raw SQL calls in `src/web/src/lib/server/` to use tRPC → service → MikroORM repository
- Remove `ProductDb.query()` from all app code (keep only for migration runner)
- Remove `db?: ProductDb` from TrpcContext — only `em: EntityManager` and `container: Container` remain
- Two complete task CRUD implementations exist (MikroORM in tasks router vs raw SQL in web/lib/server/tasks.ts) — eliminate the raw SQL version
- `openProductDb()` currently opens per-request with migrations — replace with single connection pool at startup

### Service Layer (ARCH-03)
- Extract business logic from tRPC routers into injectable service classes
- Target routers: `docs.ts` (763 lines → ~200 + DocService), `tasks.ts` (508 lines → ~200 + TaskService)
- Services use needle-di injection, consume repositories, emit domain events
- Service classes: `TaskService`, `DocService`, `SprintService`, `MemoryService`, `ArtifactService`, `NotificationService`, `RepoService`, `SearchService`

### Event Unification (ARCH-04)
- Three mechanisms exist: (1) MikroORM Event entity (UUID PKs), (2) appendEvent() raw SQL (ULID PKs), (3) EventBus singleton (no publishers)
- Converge to single `EventDispatcher` that: persists to events table via MikroORM (UUID PKs only), publishes to EventBus for WebSocket subscriptions
- Remove `appendEvent()` from product-kernel
- Remove `RoutingEventBus` — routing events go through unified EventDispatcher
- Fix: WebSocket subscriptions currently have zero publishers → EventDispatcher becomes the publisher

### Module Boundaries (ARCH-05, ARCH-06)
- Add barrel exports (`index.ts`) at each `src/` module boundary
- Enforce via ESLint rule: no cross-boundary deep imports
- Fix layering violations: product-kernel imports from web (router.ts:20), CLI imports from web (agent.ts, artifact.ts)
- Move `updateTaskAction`, `deleteTaskAction` from web/lib/server/ to TaskService
- Move run/artifact helpers from web/lib/server/ to respective services

### Router Cleanup (ARCH-07, ARCH-08)
- Remove ~200 lines of inline stub routers (crudRouter, listProcedure, getProcedure, mutationProcedure) from AppRouter
- Remove duplicate mounts: keep `skills` (drop `fulcrum_skills`), keep `memory` (drop `memories`), keep `runs` (drop `agent_runs`), keep `notifications` (drop `notify`)
- Duplicate mounts create Casbin authorization bypass (different resource strings for same operation)

### PGlite Connection Management (ARCH-10, ARCH-11)
- Single PGlite connection opened at startup, shared across requests
- Remove `openProductDb()` calls from SvelteKit page.server.ts files (20+ routes call it)
- Remove ALTER TABLE from `updateTaskAction` (tasks.ts:76-78) and `ensureDocLinksCompatibility` (documents.ts:39-47)
- All schema changes via migration files only

### API Consolidation (ARCH-12)
- Two Hono API implementations exist: `product-kernel/api/router.ts` and `src/api/hono.ts`
- Merge into single API at `src/api/` with unified auth middleware
- Product-kernel API has its own Bearer token auth (SHA-256 hash lookup) — migrate to shared auth

### Security Fixes (SEC-01 through SEC-04)
- SEC-01: `encrypted_secret` column in webhook_rule_configs stores plaintext — implement actual encryption (AES-256-GCM or similar)
- SEC-02: `agents.testProfile` spawns arbitrary binary from DB cliPath — validate against allowlist of known agent binaries (claude, codex, gemini, opencode, pi)
- SEC-03: Semgrep 14 findings — resolve non-literal regexp and IFS warnings
- SEC-04: Gitleaks 18 historical findings — audit each, rotate if sensitive, document if false positive

### Claude's Discretion
- Migration strategy for existing raw SQL data (event PK format conversion ULID→UUID)
- ESLint rule configuration for module boundary enforcement
- PGlite connection pooling implementation details (singleton vs pool)
- Service class method signatures (derive from existing router procedure signatures)
- Order of migration (which module to converge first)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture (current state)
- `src/trpc/router.ts` — AppRouter with stubs + duplicates (lines 80-381)
- `src/trpc/context.ts` — Dual-mode TrpcContext (em + db)
- `src/trpc/middleware.ts` — assertPermission + Casbin gate
- `src/server/trpc/routers/tasks.ts` — 508-line router with inline business logic
- `src/server/trpc/routers/docs.ts` — 763-line router with inline business logic
- `src/product-kernel/store/repositories.ts` — 713 lines raw SQL (appendEvent, createTask, etc.)
- `src/product-kernel/api/router.ts` — Second Hono API (imports from web layer)

### Data layer (dual paths)
- `src/web/src/lib/server/tasks.ts` — Raw SQL task CRUD (to be eliminated)
- `src/web/src/lib/server/documents.ts` — ALTER TABLE in request handler (to be eliminated)
- `src/web/src/lib/server/db.ts` — Per-request openProductDb() (to be replaced)
- `src/db/entities/` — MikroORM entities (canonical)
- `src/db/repositories/` — MikroORM repositories (canonical)

### Events (three mechanisms)
- `src/subscriptions/event-bus.ts` — Process-singleton EventBus (zero publishers)
- `src/router/event-bus.ts` — RoutingEventBus singleton
- `src/db/entities/core/Event.ts` — MikroORM Event entity (UUID PKs)
- `src/product-kernel/store/repositories.ts:138-160` — appendEvent raw SQL (ULID PKs)

### Security
- `src/product-kernel/api/router.ts:626-639` — Plaintext webhook secret storage
- `src/trpc/router.ts:226-232` — Command injection via testProfile

### Audit findings
- `.scratch/master-audit/AUDIT-REPORT.md` — Wave 1 architecture findings
- `.scratch/master-audit/WAVE2-CORRECTIONS.md` — Wave 2 adversarial findings (ADV-01 through ADV-12)

</canonical_refs>

<specifics>
## Specific Ideas

- Start with ARCH-02 (data layer convergence) as it's the largest effort and unblocks everything
- Migrate web/lib/server/ modules one domain at a time: tasks → docs → sprints → repos → artifacts → memory → notifications → search → audit
- Create service classes as you migrate each domain
- Event unification should happen after data layer convergence (events table cleanup depends on removing appendEvent)
- Router cleanup (stubs + duplicates) can be a quick win early
- Security fixes (SEC-01..04) are independent and can be parallelized

</specifics>

<deferred>
## Deferred Ideas

None — this phase is foundational, no items deferred.

</deferred>

---

*Phase: 01-architecture-convergence-security*
*Context gathered: 2026-05-04 from Wave 2 audit findings*
