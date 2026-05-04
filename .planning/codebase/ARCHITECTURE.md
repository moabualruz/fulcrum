<!-- refreshed: 2026-05-04 -->
# Architecture

**Analysis Date:** 2026-05-04

## System Overview

```text
┌���────────────────────────────────────────────────────────────────────┐
│                       Presentation Layer                            │
├──────────────────┬──────────────────┬───────────────────────────────┤
│   Web (SvelteKit)│   CLI (Bun)      │    TUI (ANSI/picocolors)     │
│  `src/web/`      │  `src/cli/`      │   `src/tui/`                 │
│  `src/web/src/   │  `src/index.ts`  │   `src/tui/index.ts`         │
│   hooks.server.ts│                  │                               │
└────────┬─────────┴────────┬─────────┴──────────┬────────────────────┘
         │                  │                     │
         ▼                  ▼                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    tRPC Router (shared core)                        │
│         `src/trpc/router.ts` + `src/server/trpc/routers/`          │
├─────────────────────────────────────────────────────────────────────┤
│                    Hono REST API (public)                           │
│         `src/api/hono.ts` + `src/api/routes/`                      │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                     ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────────────────┐
│  MikroORM Layer │ │ Product Kernel  │ │  Orchestration (Symphony)   │
│  `src/db/`      │ │ `src/product-   │ │  `src/orchestration/`       │
│  entities/repos │ │  kernel/`       │ │  `vendor/openai-symphony/`  │
└────────┬────────┘ │  (PGlite/raw)   │ └─────────────────────────────┘
         │          └────────┬────────┘
         ▼                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PostgreSQL / PGlite (embedded)                                     │
│  `@electric-sql/pglite` (local) or `pg` (remote)                    │
└─────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| CLI entry | Parse args, dispatch subcommands | `src/index.ts` |
| Web entry | SvelteKit hooks — mount auth, tRPC, inject session | `src/web/src/hooks.server.ts` |
| TUI entry | ANSI terminal UI, in-process tRPC caller | `src/tui/index.ts` |
| tRPC router | Shared procedure layer for all 3 surfaces | `src/trpc/router.ts` |
| Server routers | Domain-specific tRPC procedure implementations | `src/server/trpc/routers/` |
| Hono REST API | Public REST API with OpenAPI 3.1, gated by feature flag | `src/api/hono.ts` |
| DB module | needle-di wiring for ORM + repositories | `src/db/db.module.ts` |
| Product kernel | Legacy PGlite-based data layer (raw SQL) | `src/product-kernel/` |
| Orchestration | Symphony state machine, agent dispatch, stall scanner | `src/orchestration/symphony/` |
| Agent profiles | Multi-agent registry (Claude, Codex, Gemini, OpenCode, Pi, Copilot) | `src/agents/` |
| Feature flags | FlagRegistry with DB + env resolution, 24 registered flags | `src/flags/registry.ts` |
| Event bus | In-process pub/sub for subscriptions | `src/subscriptions/event-bus.ts` |
| Connectors | External PM tool sync (Linear, Jira, GitHub, GitLab, etc.) | `src/connectors/` |
| Inference | Local Rust inference server (embed + generate) | `inference/` |
| Notifications | Fanout worker, rule engine, bell counter | `src/notifications/` |
| Hooks | Agent lifecycle hooks (format, lint-gate, pm-policy, etc.) | `src/hooks/` |

## Pattern Overview

**Overall:** Monorepo with 3 presentation surfaces sharing a tRPC core, backed by MikroORM entities and a needle-di container.

**Key Characteristics:**
- All surfaces (Web, CLI, TUI) converge on the same tRPC router — no surface has its own data path
- CLI and TUI use an in-process tRPC caller (zero HTTP); Web uses fetch adapter
- needle-di Container is the root DI mechanism, wired in `src/db/db.module.ts`
- Entity-Repository pattern: every domain has `src/db/entities/<domain>/` + `src/db/repositories/<domain>/`
- Feature flags gate every major capability (24 flags in `src/flags/registry.ts`)

## Layers

**Presentation (Web / CLI / TUI):**
- Purpose: User-facing surfaces
- Location: `src/web/`, `src/cli/`, `src/tui/`
- Contains: UI components, route handlers, command parsers, screens
- Depends on: tRPC router, needle-di container
- Used by: End users

**API Layer (tRPC + Hono):**
- Purpose: Shared procedure definitions and public REST API
- Location: `src/trpc/`, `src/server/trpc/`, `src/api/`
- Contains: Router definitions, middleware, schemas, OpenAPI routes
- Depends on: DB layer, product kernel, feature flags
- Used by: All 3 surfaces + external consumers (Hono)

**Domain Logic:**
- Purpose: Business rules, orchestration, connectors
- Location: `src/orchestration/`, `src/connectors/`, `src/notifications/`, `src/hooks/`, `src/search/`
- Contains: State machines, sync engines, rule engines
- Depends on: DB layer, feature flags, inference
- Used by: API layer, CLI commands

**Data Layer (Dual — architectural debt):**
- Purpose: Persistence and query
- Location: `src/db/` (MikroORM) + `src/product-kernel/db/` (PGlite raw SQL)
- Contains: Entities, repositories, migrations, raw SQL migrations
- Depends on: PostgreSQL / PGlite
- Used by: Everything above

**Infrastructure:**
- Purpose: Cross-cutting concerns
- Location: `src/flags/`, `src/auth/`, `src/secrets/`, `src/platform/`, `src/i18n/`
- Contains: Feature flags, auth (better-auth), credential encryption, i18n
- Depends on: DB layer
- Used by: All layers

## Data Flow

### Primary Request Path (Web)

1. HTTP request hits SvelteKit → `src/web/src/hooks.server.ts`
2. Better-Auth resolves session → injects `locals.session`, `locals.orgId`
3. tRPC fetch handler dispatches to `src/trpc/router.ts` → domain router
4. Domain router (e.g. `src/server/trpc/routers/tasks.ts`) resolves via needle-di container
5. Repository method executes MikroORM query → PostgreSQL/PGlite
6. Response flows back through tRPC → SvelteKit → HTTP response

### CLI / TUI Request Path (In-Process)

1. CLI parses args (`src/cli/arg-parser.ts`) or TUI renders screen (`src/tui/screens/`)
2. In-process tRPC caller (`src/cli/local-caller.ts`) invokes procedure directly
3. Same tRPC router → same domain routers → same DB layer
4. Result returned in-process (zero HTTP)

### Orchestration Flow (Symphony)

1. Task enters `Unclaimed` state in `agent_runs` table
2. Symphony orchestrator polls → claims run via optimistic locking (`src/orchestration/symphony/orchestrator.ts`)
3. Worker dispatches agent (`src/orchestration/symphony/worker.ts` → `src/orchestration/symphony/dispatch.ts`)
4. Lifecycle hooks fire (`src/orchestration/symphony/hooks.ts`)
5. Stall scanner monitors for stuck runs (`src/orchestration/symphony/stall.ts`)
6. Artifacts harvested post-run (`src/orchestration/artifact-harvest-hook.ts`)

### Subscription / Real-time Flow

1. Mutation occurs in tRPC router
2. EventBus.publish() fires topic event (`src/subscriptions/event-bus.ts`)
3. Subscribers receive event:
   - Web: WebSocket bridge
   - CLI: JSON lines output
   - TUI: In-process EventEmitter

**State Management:**
- Server: MikroORM EntityManager (request-scoped via `em.fork()`)
- Web client: Svelte stores + tRPC query cache
- TUI: In-memory state per screen, refreshed via tRPC calls
- Flags: FlagRegistry singleton with 60s TTL cache

## Key Abstractions

**needle-di Container:**
- Purpose: Dependency injection for all services and repositories
- Examples: `src/db/db.module.ts` (registration), `src/web/src/hooks.server.ts` (usage)
- Pattern: Register typed Repository subclasses as tokens; resolve via `container.get(UserRepository)`

**Entity-Repository:**
- Purpose: Domain data access via MikroORM v7
- Examples: `src/db/entities/tasks/Task.ts`, `src/db/repositories/auth/UserRepository.ts`
- Pattern: `@Entity()` decorator classes + custom `EntityRepository` subclasses. 83 entity files, 54 repository files across 18 domain subdirectories.

**FlagRegistry:**
- Purpose: Feature gating with DB → env → default-off resolution
- Examples: `src/flags/registry.ts`, `src/flags/evaluation.ts`, `src/flags/experiments.ts`
- Pattern: `flag("feature-name", { orgId, userId })` returns boolean. 24 registered flags.

**Agent Profiles:**
- Purpose: Multi-agent configuration (capabilities, paths, hooks per agent)
- Examples: `src/agents/profiles/claude-code.ts`, `src/agents/profiles/codex.ts`
- Pattern: Profile defines agent capabilities, hook wiring, and config paths. 6 agents supported.

## Entry Points

**CLI (`src/index.ts`):**
- Location: `src/index.ts`
- Triggers: `fulcrum <subcommand>` from terminal
- Responsibilities: Arg parsing, subcommand dispatch to `src/cli/` modules, ORM bootstrap

**Web (`src/web/src/hooks.server.ts`):**
- Location: `src/web/src/hooks.server.ts`
- Triggers: HTTP requests to SvelteKit dev server or built app
- Responsibilities: Auth mounting, tRPC adapter, session injection, locale detection

**TUI (`src/tui/index.ts`):**
- Location: `src/tui/index.ts`
- Triggers: `fulcrum tui`
- Responsibilities: ANSI terminal rendering, keyboard navigation, in-process tRPC calls

**Hono REST API (`src/api/hono.ts`):**
- Location: `src/api/hono.ts`
- Triggers: HTTP requests to `/api/v1/*`
- Responsibilities: Public REST API with OpenAPI 3.1 spec, gated by `public-api` feature flag

**Inference server (`inference/`):**
- Location: `inference/` (Rust workspace)
- Triggers: `fulcrum inference start`
- Responsibilities: Local embedding + text generation via Rust binaries

## Architectural Constraints

- **Threading:** Single-threaded Bun event loop for all TS surfaces. Inference server is multi-threaded Rust.
- **Global state:** FlagRegistry is a process singleton with TTL cache. EventBus is a process singleton. MikroORM EntityManager is forked per request.
- **Circular imports:** Lazy imports in `hooks.server.ts` avoid circular deps between Vite SSR and MikroORM entity graph. tRPC router imports are eager but one-directional.
- **No raw SQL in MikroORM layer:** Constraint C6 — all MikroORM queries use repository methods or `nativeUpdate`. Product kernel layer uses raw SQL intentionally.
- **Dual data layer:** MikroORM (`src/db/`) and PGlite raw SQL (`src/product-kernel/db/`) coexist. tRPC context carries both `em` and `db` fields. This is intentional tech debt during migration.

## Event System (3 Mechanisms)

### 1. EventBus (In-Process Pub/Sub)
- Location: `src/subscriptions/event-bus.ts`
- Purpose: Real-time subscription transport for all 3 surfaces
- Topics: `agent_run.<id>`, `project.<id>.tasks`, `org.<id>.notifications`, `orchestration.<orgId>`
- Pattern: `EventEmitter`-backed, process-singleton, subscribe/unsubscribe with cleanup

### 2. MikroORM Event Entity (Audit/Domain Events)
- Location: `src/db/entities/core/Event.ts`, `src/db/repositories/core/EventRepository.ts`
- Purpose: Persistent domain events stored in DB (audit trail, event sourcing lite)
- Pattern: `Event` entity persisted via MikroORM, queried by tRPC routers

### 3. Symphony Lifecycle Hooks
- Location: `src/orchestration/symphony/hooks.ts`
- Purpose: Orchestration lifecycle callbacks (pre-dispatch, post-completion, on-stall)
- Pattern: Typed hook interface dispatched during state machine transitions

## Anti-Patterns

### Dual Data Layer

**What happens:** tRPC context carries both `em: EntityManager` (MikroORM) and `db: ProductDb` (PGlite raw SQL). Some routers use `em`, others use `db`, some use both.
**Why it's wrong:** Two migration systems, two query patterns, two schemas that can drift. Developers must know which layer owns which domain.
**Do this instead:** Migrate remaining `ProductDb` consumers to MikroORM repositories. The `src/db/` layer is the canonical path. See `src/trpc/context.ts` lines 16-25 for the dual context.

### Missing Service Layer

**What happens:** tRPC routers contain business logic directly — validation, orchestration, side effects all live in procedure handlers.
**Why it's wrong:** Business logic is unreachable from CLI commands without going through tRPC. Testing requires full tRPC context setup.
**Do this instead:** Extract domain services (e.g. `TaskService`, `DocumentService`) that both tRPC routers and CLI commands can call. Repositories handle persistence; services handle business rules.

## Error Handling

**Strategy:** tRPC errors with typed error codes; no global error boundary.

**Patterns:**
- tRPC routers throw `TRPCError` with appropriate codes (`NOT_FOUND`, `UNAUTHORIZED`, etc.)
- Symphony orchestrator uses `ClaimConflictError` for optimistic locking failures (`src/orchestration/symphony/orchestrator.ts`)
- Error logs persisted via `ErrorLog` entity (`src/db/entities/platform/ErrorLog.ts`)
- Doctor subsystem checks for health issues (`src/doctor/`)

## Cross-Cutting Concerns

**Logging:** Console-based; no structured logging framework. Error logs persisted to DB via `ErrorLog` entity.
**Validation:** Zod schemas in `src/trpc/schemas/` for tRPC input validation; `@hono/zod-openapi` for REST API.
**Authentication:** Better-Auth (`better-auth` package) with session-based auth. Mounted in `hooks.server.ts`. Auto-session in local/dev mode.
**Authorization:** Feature flags gate capabilities. Casbin policy engine available but flag-gated (`casbin-policies`).
**i18n:** Flag-gated (`i18n`), locale detection in hooks.server.ts, message files in `src/web/messages/`.

---

*Architecture analysis: 2026-05-04*
