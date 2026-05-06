<!-- refreshed: 2026-05-06 -->
# Architecture

**Analysis Date:** 2026-05-06

## System Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                    User-Facing Surfaces                      │
├──────────────────┬──────────────────┬───────────────────────┤
│ Web SvelteKit    │ Bun CLI          │ OpenTUI Terminal UI   │
│ `src/web/`       │ `src/index.ts`   │ `src/tui/index.ts`    │
│ `src/web/src/    │ `src/cli/`       │ `src/tui/screens/`    │
│ hooks.server.ts` │                  │                       │
└────────┬─────────┴────────┬─────────┴──────────┬────────────┘
         │                  │                     │
         ▼                  ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│              Shared API / Application Boundary              │
│  `src/trpc/router.ts`  `src/server/trpc/routers/`           │
│  `src/trpc/routers/`   `src/services/`                      │
├─────────────────────────────────────────────────────────────┤
│                Public REST / OpenAPI Boundary                │
│  `src/api/hono.ts`  `src/api/routes/`                       │
└────────┬──────────────────────┬─────────────────────────────┘
         │                      │
         ▼                      ▼
┌───────────────────────┐ ┌───────────────────────────────────┐
│ Canonical ORM Layer   │ │ Legacy ProductDb Compatibility     │
│ `src/db/`             │ │ `src/product-kernel/`              │
│ `src/db/db.module.ts` │ │ `src/web/src/lib/server/db.ts`     │
└───────────┬───────────┘ └────────────────┬──────────────────┘
            │                              │
            ▼                              ▼
┌─────────────────────────────────────────────────────────────┐
│            PostgreSQL-compatible persistence                 │
│ `@mikro-orm/postgresql`, `@electric-sql/pglite`, `pg`        │
│ `src/db/migrations/`  `src/product-kernel/db/migrations/`   │
└─────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────┐
│       Cross-Cutting Runtime Systems                          │
│ `src/orchestration/` `src/subscriptions/` `src/search/`      │
│ `src/notifications/` `src/inference/` `src/collab/`          │
└─────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Root CLI dispatcher | Parses top-level `fulcrum` command and lazy-loads subcommands | `src/index.ts` |
| CLI command hub | Handles broad product commands, DB bootstrap, web server launch, TUI launch | `src/cli/index.ts` |
| Web request hook | Initializes ProductDb singleton, mounts Better-Auth and tRPC, forks ORM request context | `src/web/src/hooks.server.ts` |
| Web route loaders | Load server data for SvelteKit pages and API route handlers | `src/web/src/routes/` |
| TUI app root | Renders keyboard-first terminal screens and consumes in-process tRPC caller | `src/tui/index.ts` |
| TUI router | Maintains terminal route state and back stack | `src/tui/router.ts` |
| tRPC root router | Composes internal application API across all domains | `src/trpc/router.ts` |
| tRPC context | Carries session, org, request-scoped `EntityManager`, DI container, deprecated ProductDb shim | `src/trpc/context.ts` |
| tRPC base procedures | Adds request IDs and OpenTelemetry span wrapper to procedures | `src/trpc/trpc.ts` |
| Domain tRPC routers | Implement procedure handlers for tasks, docs, auth, flags, inference, reports, etc. | `src/server/trpc/routers/`, `src/trpc/routers/` |
| Public REST API | Builds Hono OpenAPI app gated by `public-api` feature flag | `src/api/hono.ts` |
| REST route adapters | Register public API routes backed by ProductDb/services or static OpenAPI metadata | `src/api/routes/` |
| DB DI module | Binds MikroORM `EntityManager`, repositories, `FlagRegistry`, and migrator into `needle-di` | `src/db/db.module.ts` |
| ORM entities | Define canonical PostgreSQL schema model by domain | `src/db/entities/` |
| ORM repositories | Provide typed domain repositories used by services and routers | `src/db/repositories/` |
| ORM migrations | Define current canonical database migrations | `src/db/migrations/` |
| ProductDb shim | Adapts ORM connection to legacy `ProductDb.query/exec/close` interface for web compatibility | `src/web/src/lib/server/db.ts` |
| Product kernel | Holds older SQL-first stores, migrations, and compatibility modules | `src/product-kernel/` |
| Services | Encapsulate cross-router domain logic for tasks, docs, sprints, comments, reports, workflows | `src/services/` |
| Symphony orchestrator | Claims agent runs, dispatches lifecycle hooks, starts stall scanner | `src/orchestration/symphony/orchestrator.ts` |
| Agent registry | Defines supported agent profiles and capabilities | `src/agents/registry.ts`, `src/agents/profiles/` |
| Subscriptions | Provides EventBus, polling fallback, and PGlite LISTEN/NOTIFY bridge | `src/subscriptions/` |
| Search | Provides query service, indexers, saved searches, cache, filters | `src/search/` |
| Notifications | Provides fanout worker, delivery retry, quiet hours, bell counters, delivery handlers | `src/notifications/` |
| Collaboration | Provides Yjs document collaboration server/client surfaces | `src/collab/`, `src/server/yjs-server.ts`, `src/web/src/lib/collab/` |
| Inference | Provides backend probes, lifecycle, client, model metadata, routing config | `src/inference/` |
| Hooks | Provides installed agent hook recipes | `src/hooks/` |
| Components | Defines installable Fulcrum component specs and planner | `src/components/` |

## Pattern Overview

**Overall:** Local-first TypeScript monorepo with three first-party surfaces sharing a tRPC application boundary, canonical MikroORM persistence, and compatibility shims for legacy ProductDb modules.

**Key Characteristics:**
- Use `src/trpc/router.ts` as shared internal API for Web, CLI, TUI, and tests.
- Use `src/api/hono.ts` for external REST/OpenAPI exposure; keep feature gate behavior in `src/api/feature-flags.ts`.
- Use request-scoped MikroORM `EntityManager` plus `needle-di` container for canonical data access.
- Keep `ProductDb` compatibility isolated to `src/product-kernel/`, `src/web/src/lib/server/db.ts`, and explicit deprecated context fields.
- Keep domain logic in `src/services/` or domain folders; do not put data rules directly in Svelte components or CLI formatters.
- Use registered feature flags, auth/session context, and org scoping on user-facing data paths.

## Layers

**Surface Layer:**
- Purpose: User interaction through web, command line, and terminal UI.
- Location: `src/web/`, `src/cli/`, `src/tui/`, `src/index.ts`.
- Contains: SvelteKit routes/components, CLI command modules, OpenTUI screens, route loaders.
- Depends on: tRPC router, SvelteKit hooks, request/session locals, CLI/TUI local callers.
- Used by: End users and automation invoking `fulcrum`.

**Application/API Layer:**
- Purpose: Stable internal and external API boundaries.
- Location: `src/trpc/`, `src/server/trpc/routers/`, `src/api/`.
- Contains: Router composition, procedures, middleware, schemas, Hono OpenAPI route registration.
- Depends on: `EntityManager`, `Container`, services, feature flags, auth, ProductDb shim for remaining compatibility.
- Used by: Web hooks, SvelteKit API routes, CLI local caller, TUI caller, external REST clients.

**Domain Service Layer:**
- Purpose: Business behavior spanning repositories and events.
- Location: `src/services/`, plus focused domains such as `src/orchestration/`, `src/router/`, `src/notifications/`, `src/search/`, `src/docs/`, `src/memory/`.
- Contains: `TaskService`, `DocService`, sprint/report/workflow/comment services, Symphony state machine, routing engine, notification workers, indexers.
- Depends on: MikroORM entities/repositories, events, subscriptions, inference clients, feature flags.
- Used by: tRPC routers, Hono routes, CLI commands, workers.

**Canonical Data Layer:**
- Purpose: PostgreSQL-compatible persistence via ORM entities, repositories, and migrations.
- Location: `src/db/`.
- Contains: `src/db/entities/`, `src/db/repositories/`, `src/db/migrations/`, `src/db/db.module.ts`, `src/db/migrator-service.ts`, `src/db/mikro-orm.config.ts`.
- Depends on: `@mikro-orm/postgresql`, `@electric-sql/pglite`, `pg`, `needle-di`.
- Used by: services, tRPC routers, web hooks, CLI DB commands, TUI local caller.

**Compatibility Data Layer:**
- Purpose: Preserve older ProductDb and SQL store contracts while migration proceeds.
- Location: `src/product-kernel/`, `src/web/src/lib/server/db.ts`.
- Contains: `ProductDb` interface, raw SQL migrations, PGlite/Postgres adapters, store modules, ORM-backed shim.
- Depends on: PGlite/Postgres-compatible SQL connection.
- Used by: legacy stores, tests, selected web loaders/API routes, orchestration compatibility procedures.

**Infrastructure Layer:**
- Purpose: Cross-cutting runtime support.
- Location: `src/auth/`, `src/flags/`, `src/secrets/`, `src/platform/`, `src/i18n/`, `src/errors/`, `src/doctor/`, `src/workers/`, `src/subscriptions/`.
- Contains: Better-Auth integration, feature flags, credential encryption, i18n, error reporter, health checks, workers, realtime events.
- Depends on: DB layer, environment, optional external services.
- Used by: all surfaces and domain services.

**Vendor/Distribution Layer:**
- Purpose: Package mirroring, agent skill/rule distribution, vendored protocol inputs.
- Location: `skills/`, `rules/`, `plugins/`, `.claude-plugin/`, `vendor/openai-symphony/`, `hooks/recipes/`.
- Contains: Authored skills, sentinel rules, marketplace metadata, hook snippets, Symphony submodule.
- Depends on: filesystem, agent runtime paths, release scripts.
- Used by: `fulcrum install`, `fulcrum skills sync`, `just sync-symphony`.

## Data Flow

### Primary Web Request Path

1. Request enters SvelteKit server hook (`src/web/src/hooks.server.ts`).
2. Hook initializes ProductDb singleton once with `initProductDb()` (`src/web/src/lib/server/db.ts`).
3. Hook lazily initializes MikroORM, Better-Auth, `FlagRegistry`, and request-scoped `Container` (`src/web/src/hooks.server.ts`).
4. `/api/auth/**` delegates to `AuthService.handler` (`src/auth/index.ts`).
5. `/api/trpc/**` delegates to `fetchRequestHandler` with `appRouter` and `createContext()` (`src/web/src/hooks.server.ts`, `src/trpc/router.ts`, `src/trpc/context.ts`).
6. Procedure invokes service/repository logic in `src/server/trpc/routers/`, `src/trpc/routers/`, or `src/services/`.
7. ORM operations execute through forked `EntityManager` and custom repositories bound in `src/db/db.module.ts`.
8. Response returns through tRPC/SvelteKit to browser.

### Web Page Loader Path

1. SvelteKit route loader runs from `src/web/src/routes/**/+page.server.ts`.
2. Loader reads `event.locals` populated by `src/web/src/hooks.server.ts`.
3. Loader calls tRPC/service/ProductDb helpers depending on route maturity.
4. Svelte component renders from loader data in matching `+page.svelte`.
5. Client-only shared state belongs under `src/web/src/lib/state/` or route-local component state.

### CLI Command Path

1. `fulcrum` starts at `src/index.ts`.
2. Top-level switch lazy-loads command-specific modules or delegates broad commands to `src/cli/index.ts`.
3. DB-backed CLI commands build a `needle-di` container and initialize MikroORM/PGlite or Postgres (`src/cli/index.ts`).
4. Command handlers call local modules, services, tRPC local caller, or DB repositories.
5. Output formatting stays in CLI command modules; domain behavior stays in services/routers.

### TUI Path

1. `fulcrum tui` dispatches through `src/index.ts` and `src/cli/index.ts`.
2. TUI app starts in `src/tui/index.ts`.
3. `TuiCaller` invokes in-process tRPC-like methods; tests inject FakeTTY and fake callers.
4. `TuiRouter` maps terminal paths to screens (`src/tui/router.ts`, `src/tui/screens/`).
5. Screens load data on mount and render with the OpenTUI/FakeTTY-compatible renderer.

### Public REST API Path

1. Hono app is created by `createPublicApiRouter()` (`src/api/hono.ts`).
2. `/api/openapi.json` returns static generated OpenAPI document even outside feature-gated `/api/v1`.
3. `/api/v1/*` requests are blocked with 404 unless `isPublicApiEnabled()` passes (`src/api/feature-flags.ts`).
4. When deps are provided, Hono context receives `ProductDb` and optional tRPC object (`src/api/hono.ts`).
5. Route adapters in `src/api/routes/` call kernel/service implementations and return JSON.

### Orchestration Flow

1. Agent run rows are created in `agent_runs` via routers/services using `src/db/entities/orchestration/AgentRun.ts`.
2. Symphony orchestrator starts from web server launch or command path (`src/cli/index.ts`, `src/orchestration/symphony/orchestrator.ts`).
3. `claimRun()` forks `EntityManager`, selects one unclaimed run, CAS-updates state, and emits `Event` row (`src/orchestration/symphony/orchestrator.ts`).
4. Lifecycle hooks wrap dispatch with before/after/failure/cancel events (`src/orchestration/symphony/hooks.ts`).
5. Stall scanner monitors stuck runs (`src/orchestration/symphony/stall.ts`).
6. Artifacts and events feed search/notifications/subscriptions via their domain modules.

### Realtime / Collaboration Flow

1. Domain mutation creates persistent events or publishes subscription event.
2. EventBus distributes in-process messages (`src/subscriptions/event-bus.ts`).
3. PGlite bridge and polling fallback cover DB-backed event delivery (`src/subscriptions/pglite-bridge.ts`, `src/subscriptions/polling-fallback.ts`).
4. tRPC subscription routers expose run, notification, and orchestration streams (`src/subscriptions/procedures.ts`).
5. Document collaboration uses Yjs server/client paths (`src/server/yjs-server.ts`, `src/collab/server.ts`, `src/web/src/lib/collab/`).

**State Management:**
- Server request state: `event.locals` in `src/web/src/hooks.server.ts`, `TrpcContext` in `src/trpc/context.ts`.
- DB unit of work: forked MikroORM `EntityManager` per web request; command-scoped EntityManager for CLI/TUI.
- Persistent state: PostgreSQL/PGlite tables from `src/db/migrations/` and legacy SQL in `src/product-kernel/db/migrations/`.
- Realtime state: process-local EventBus plus polling/PGlite bridge in `src/subscriptions/`.
- Web client state: Svelte stores under `src/web/src/lib/state/` and page/component local state.
- TUI state: screen-local state in `src/tui/screens/` plus `TuiRouter` history.

## Key Abstractions

**`TrpcContext`:**
- Purpose: Request/session/org/data-access envelope for internal API calls.
- Examples: `src/trpc/context.ts`, `src/web/src/hooks.server.ts`, `src/web/src/routes/api/trpc/[...path]/+server.ts`.
- Pattern: Pass `session`, `orgId`, `userId`, `em`, `container`, optional deprecated `db`, and response headers into `createContext()`.

**`needle-di` Container:**
- Purpose: Typed dependency registry for repositories, feature flags, and migration services.
- Examples: `src/db/db.module.ts`, `src/web/src/hooks.server.ts`, `src/cli/index.ts`.
- Pattern: Bind concrete repository classes as tokens; use request-scoped `EntityManager` when available.

**MikroORM Entity/Repository:**
- Purpose: Canonical data model and persistence operations.
- Examples: `src/db/entities/tasks/Task.ts`, `src/db/repositories/tasks/TaskRepository.ts`, `src/db/entities/docs/Document.ts`.
- Pattern: Add entity under `src/db/entities/<domain>/`, repository under `src/db/repositories/<domain>/`, bind it in `src/db/db.module.ts`, migrate in `src/db/migrations/`.

**Domain Service:**
- Purpose: Business rules that span repositories, events, validation, and side effects.
- Examples: `src/services/TaskService.ts`, `src/services/DocService.ts`, `src/services/SprintService.ts`, `src/services/AutomationService.ts`.
- Pattern: Constructor receives `EntityManager`; public methods accept `orgId`/context and return serialized DTOs.

**`ProductDb`:**
- Purpose: Minimal SQL interface retained for compatibility.
- Examples: `src/product-kernel/db/types.ts`, `src/web/src/lib/server/db.ts`, `src/trpc/context.ts`.
- Pattern: New code uses `EntityManager`; only compatibility or explicitly legacy paths use `ProductDb.query()`/`exec()`.

**Agent Profile:**
- Purpose: Describes supported agent runtime capabilities and install surfaces.
- Examples: `src/agents/registry.ts`, `src/agents/profiles/codex.ts`, `src/agents/profiles/claude-code.ts`.
- Pattern: Add profile file, export profile, register in canonical registry.

**Symphony Run Claiming:**
- Purpose: Coordinates agent run state transitions with DB-level uniqueness and process-local queueing.
- Examples: `src/orchestration/symphony/orchestrator.ts`, `src/db/entities/orchestration/AgentRun.ts`.
- Pattern: Fork EM, run transaction, CAS state update, emit persistent `Event`.

**Feature Flag Registry:**
- Purpose: Central feature gating for product and platform behavior.
- Examples: `src/flags/registry.ts`, `src/db/db.module.ts`, `src/api/feature-flags.ts`.
- Pattern: Register canonical flags and resolve through `FlagRegistry` or shared feature-flag helpers.

**EventBus / Subscriptions:**
- Purpose: Process-local realtime stream abstraction with fallback bridges.
- Examples: `src/subscriptions/event-bus.ts`, `src/subscriptions/procedures.ts`, `src/subscriptions/pglite-bridge.ts`.
- Pattern: Publish domain-specific topics; expose streams through subscription routers or polling fallback.

## Entry Points

**Root CLI:**
- Location: `src/index.ts`.
- Triggers: `fulcrum <command>`.
- Responsibilities: top-level command dispatch, lazy module loading, hook subcommand dispatch, help/version output.

**CLI Command Hub:**
- Location: `src/cli/index.ts`.
- Triggers: delegated commands such as `doctor`, `db`, `web`, `tui`, product domains.
- Responsibilities: DB container bootstrap, migration compatibility checks, built web server launch, Symphony startup.

**Web Runtime:**
- Location: `src/web/src/hooks.server.ts`.
- Triggers: SvelteKit server request handling.
- Responsibilities: ProductDb startup, auth handler mount, session hydration, request-scoped ORM/DI locals, tRPC mount, local-dev auto-session.

**Web tRPC Route:**
- Location: `src/web/src/routes/api/trpc/[...path]/+server.ts`.
- Triggers: SvelteKit API route requests to `/api/trpc/**`.
- Responsibilities: route-level fetch adapter for tests/direct route path; creates tRPC context from locals.

**Web Public API Route:**
- Location: `src/web/src/routes/api/v1/+server.ts`.
- Triggers: SvelteKit API requests to `/api/v1`.
- Responsibilities: feature-gated public API placeholder/static handler; Hono canonical app lives in `src/api/hono.ts`.

**Hono Public API Factory:**
- Location: `src/api/hono.ts`.
- Triggers: callers creating public API router.
- Responsibilities: OpenAPI document, auth/rate limit middleware, route registration, feature-gated delegation.

**TUI Runtime:**
- Location: `src/tui/index.ts`.
- Triggers: `fulcrum tui`.
- Responsibilities: OpenTUI/FakeTTY rendering, routing, screen lifecycle, keyboard handling, local caller consumption.

**Yjs Collaboration Server:**
- Location: `src/server/yjs-server.ts`, `src/collab/server.ts`.
- Triggers: collaboration server startup paths.
- Responsibilities: Yjs document sync, WebSocket handling, snapshot persistence.

**Tests:**
- Location: `src/**/*.test.ts`, `src/web/tests/`, `tests/`.
- Triggers: `bun test`, web Vitest/Playwright commands.
- Responsibilities: unit/integration/e2e coverage for routers, services, routes, TUI, web.

## Architectural Constraints

- **Threading:** TypeScript runtime uses Bun/Node-style event loop. TUI rendering and CLI command handling are single-process. DB transactions and async IO provide concurrency. Inference and external subprocesses run outside main event loop when started.
- **Global state:** `src/web/src/lib/server/db.ts` holds ProductDb singleton; `src/web/src/hooks.server.ts` holds lazy `_runtimePromise`; `src/orchestration/symphony/orchestrator.ts` holds process-local `claimQueues`; subscription/event modules expose process-local buses; these must be reset explicitly in tests.
- **Circular imports:** Web hooks use lazy imports for `src/trpc/router.ts`, `src/trpc/context.ts`, `src/auth/index.ts`, and DB setup to avoid Vite SSR and entity graph import cycles.
- **Module boundaries:** `scripts/check-module-boundaries.ts` enforces `product-kernel/`, `cli/`, and `services/` must not import from `web/`.
- **Data access direction:** Use `src/db/` + services for new code. Treat `TrpcContext.db` and `src/product-kernel/` stores as compatibility surfaces.
- **Tenant/org scoping:** User data paths carry `orgId` through `TrpcContext`, services, repositories, and route inputs. New data access must include org scoping.
- **Feature gating:** Public REST API is hidden with 404 when disabled. Optional product capabilities use registered flags rather than ad hoc env parsing.
- **Migration safety:** ORM migrations are canonical in `src/db/migrations/`; `MigratorService` validates checksums and protects lossy down migrations.
- **No GitHub Actions source of truth:** Project gates are local scripts in `package.json`, especially `bun run ci` and `bun run scripts/check-module-boundaries.ts`.

## Anti-Patterns

### New Code Calling `ProductDb` Directly

**What happens:** New procedures/loaders call `ProductDb.query()` or legacy stores under `src/product-kernel/store/`.
**Why it's wrong:** `TrpcContext.db` is explicitly deprecated and retained for compatibility; direct SQL bypasses repository conventions, org scoping patterns, and MikroORM migration safety.
**Do this instead:** Add/extend entities and repositories under `src/db/`, bind them in `src/db/db.module.ts`, and expose behavior through services such as `src/services/TaskService.ts` or routers in `src/server/trpc/routers/`.

### Surface Logic Owning Business Rules

**What happens:** Svelte route loaders, TUI screens, or CLI commands implement validation, workflow transitions, event writes, or bulk mutation rules inline.
**Why it's wrong:** Web/CLI/TUI drift because each surface can fork behavior.
**Do this instead:** Put rules in `src/services/` or a domain folder and call them from `src/server/trpc/routers/`, CLI local caller paths, and TUI caller paths.

### Importing Web From Core Layers

**What happens:** Modules under `src/product-kernel/`, `src/cli/`, or `src/services/` import `src/web/`.
**Why it's wrong:** It breaks the enforced dependency direction and can pull SvelteKit/Vite-only code into CLI or tests.
**Do this instead:** Move shared logic to `src/services/`, `src/utils/`, `src/platform/`, or domain folders; keep Svelte UI adapters under `src/web/`.

### Eager Web Imports of ORM/Auth Graph

**What happens:** `hooks.server.ts` or Svelte route modules import heavy ORM/auth/router modules eagerly at top level without checking SSR constraints.
**Why it's wrong:** Existing hook comments document Vite SSR failures from entity graph imports.
**Do this instead:** Follow lazy import pattern in `src/web/src/hooks.server.ts` for `src/trpc/router.ts`, `src/trpc/context.ts`, `src/auth/index.ts`, and DB modules.

### Duplicate Public API Gating

**What happens:** A route defines its own public API feature flag parsing.
**Why it's wrong:** `src/api/feature-flags.ts` is the canonical `public-api` gate; duplicate gates can expose routes inconsistently.
**Do this instead:** Import `isPublicApiEnabled()` from `src/api/feature-flags.ts` and keep public REST route registration in `src/api/hono.ts` / `src/api/routes/`.

## Error Handling

**Strategy:** Surface errors at API boundaries with structured request IDs and domain-specific error classes; keep best-effort side effects from crashing primary mutations unless explicitly critical.

**Patterns:**
- tRPC error formatter injects request ID in `src/trpc/trpc.ts`.
- Domain validation uses `TRPCError` in services such as `src/services/TaskService.ts` and `src/services/DocService.ts`.
- Migration safety uses specific error classes in `src/db/migrator-service.ts`.
- Web auth/session hydration catches auth/runtime failures and falls back to empty session where appropriate in `src/web/src/hooks.server.ts`.
- Best-effort side effects catch non-critical failures, e.g. watcher subscription in `src/services/TaskService.ts`.
- Public REST feature gate returns 404 rather than route details when disabled in `src/api/hono.ts`.

## Cross-Cutting Concerns

**Logging:** Use console output for CLI/web startup and selected server failures (`src/cli/index.ts`, `src/web/src/hooks.server.ts`); use event/audit rows for durable domain history (`src/db/entities/core/Event.ts`, `src/router/telemetry.ts`, `src/events/`).

**Validation:** Use Zod in routers/schemas (`src/trpc/router.ts`, `src/router/decision-schema.ts`, `src/api/routes/`) and service-level validation for workflow/custom field constraints (`src/services/WorkflowService.ts`, `src/services/FieldDependencyService.ts`).

**Authentication:** Better-Auth handles web session APIs through `src/auth/index.ts` and `src/web/src/hooks.server.ts`; public REST uses bearer API-key auth in `src/api/auth.ts`; local dev can auto-create a session unless `FULCRUM_REQUIRE_AUTH` is set.

**Authorization:** tRPC protected procedure metadata and permission middleware live under `src/trpc/` and `src/server/trpc/middleware/`; project state records `EntityManager` as canonical data access and bearer API-key as unified REST auth.

**Feature Flags:** Register and evaluate flags through `src/flags/registry.ts`, `src/db/db.module.ts`, and specific helpers such as `src/api/feature-flags.ts`.

**Migrations:** CLI DB commands use `src/cli/index.ts` and `src/db/migrator-service.ts`; ProductDb compatibility still has SQL migration runner in `src/product-kernel/db/migrate.ts`.

**Search/Indexing:** Domain writes call indexers such as `src/docs/search-indexer.ts` and `src/search/indexers/`; search queries live under `src/search/query-service.ts` and route/CLI adapters.

**Realtime:** Use `src/subscriptions/event-bus.ts`, `src/subscriptions/procedures.ts`, and bridges/fallbacks rather than ad hoc websocket state.

---

*Architecture analysis: 2026-05-06*
