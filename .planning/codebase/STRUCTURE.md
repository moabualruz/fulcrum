# Codebase Structure

**Analysis Date:** 2026-05-04

## Directory Layout

```
fulcrum/
├── src/                    # All TypeScript source (monorepo root)
│   ├── index.ts            # CLI entry point (`fulcrum` binary)
│   ├── agents/             # Agent profile registry (13 files)
│   ├── api/                # Hono REST API — public /api/v1 (12 files)
│   ├── artifacts/          # Artifact harvesting + indexing (7 files)
│   ├── auth/               # Auth helpers (3 files)
│   ├── backup/             # DB backup/restore (4 files)
│   ├── cli/                # CLI subcommand handlers (155 files)
│   ├── collab/             # Real-time collaboration (8 files)
│   ├── components/         # Fulcrum component system (20 files)
│   ├── connectors/         # External PM tool connectors (16 files)
│   ├── context/            # Context assembly for agents (3 files)
│   ├── data/               # Data import/export (12 files)
│   ├── db/                 # MikroORM entities, repos, migrations (190 files)
│   ├── docs/               # Document management logic (21 files)
│   ├── doctor/             # Health check subsystem (14 files)
│   ├── errors/             # Error types (2 files)
│   ├── events/             # Domain event handlers (2 files)
│   ├── filters/            # Query filter system (2 files)
│   ├── flags/              # Feature flag registry + experiments (5 files)
│   ├── hooks/              # Agent lifecycle hooks (16 files)
│   ├── i18n/               # Internationalization (2 files)
│   ├── importers/          # Data importers (6 files)
│   ├── inference/          # TS client for Rust inference server (19 files)
│   ├── keybindings/        # Keyboard shortcut system (4 files)
│   ├── marketplace/        # Skill marketplace (5 files)
│   ├── memory/             # Memory extraction + retrieval (16 files)
│   ├── notifications/      # Notification fanout + rules (6 files)
│   ├── orchestration/      # Symphony orchestrator + workers (26 files)
│   ├── permissions/        # Casbin policy engine (2 files)
│   ├── platform/           # Platform utilities (4 files)
│   ├── product-kernel/     # Legacy PGlite data layer (110 files)
│   ├── repo/               # (empty — see repos/)
│   ├── repos/              # Repository management (5 files)
│   ├── router/             # Agent routing engine (13 files)
│   ├── search/             # FTS search + saved searches (21 files)
│   ├── secrets/            # Credential encryption (8 files)
│   ├── server/             # Backend tRPC router implementations (25 files)
│   ├── skills/             # Skill sync + validation (9 files)
│   ├── subscriptions/      # EventBus + polling fallback (9 files)
│   ├── test-utils/         # Shared test helpers (5 files)
│   ├── trpc/               # tRPC root router, middleware, schemas (41 files)
│   ├── tui/                # Terminal UI screens + renderer (79 files)
│   ├── types/              # Shared type definitions (1 file)
│   ├── utils/              # General utilities (4 files)
│   ├── web/                # SvelteKit web application (17,925 files)
│   └── webhooks/           # Webhook dispatch (1 file)
├── inference/              # Rust inference server workspace
│   ├── inference-core/     # Shared Rust types
│   ├── inference-embed/    # Embedding binary
│   ├── inference-generate/ # Generation binary
│   └── inference-server/   # HTTP server binary
├── vendor/                 # Vendored dependencies
│   └── openai-symphony/    # Symphony Elixir orchestrator (submodule)
├── src-tauri/              # Tauri desktop shell (Rust)
├── config/                 # Runtime config files
├── docs/                   # Project documentation
├── evals/                  # Skill evaluation scripts
├── eval-results/           # Evaluation output
├── hooks/                  # Git hooks
├── plugins/                # Plugin system
├── rules/                  # Agent rules files
├── scripts/                # Build + CI scripts
├── shims/                  # Runtime shims
├── skills/                 # Authored skills (mirrored to agents)
├── tests/                  # Integration/E2E tests
├── .claude/                # Claude Code agent config
├── .codex/                 # Codex agent config
├── .gemini/                # Gemini CLI agent config
├── .opencode/              # OpenCode agent config
├── .planning/              # Planning documents (this directory)
└── graphify-out/           # Code knowledge graph output
```

## Directory Purposes

**`src/db/` (190 files) — Canonical data layer:**
- Purpose: MikroORM v7 entities, repositories, migrations, DI wiring
- Contains: 83 entity files across 18 domain subdirs, 54 repository files, 38 migration files
- Key files:
  - `src/db/db.module.ts` — needle-di registration of all entities/repos
  - `src/db/mikro-orm.config.ts` — ORM configuration
  - `src/db/migrator-service.ts` — Migration runner
  - `src/db/seed.ts` — Database seeding
  - `src/db/context.ts` — DB context helpers
- Entity domains: `auth/`, `tasks/`, `docs/`, `memory/`, `orchestration/`, `notifications/`, `repos/`, `artifacts/`, `connectors/`, `flags/`, `inference/`, `jobs/`, `platform/`, `router/`, `sandbox/`, `search/`, `skills/`, `core/`

**`src/product-kernel/` (110 files) — Legacy data layer:**
- Purpose: Original PGlite-based data access with raw SQL
- Contains: Domain modules (tasks, docs, memory, search, sprints, etc.) + `db/` subdir with PGlite driver and SQL migrations
- Key files:
  - `src/product-kernel/db/pglite.ts` — PGlite connection
  - `src/product-kernel/db/postgres.ts` — Postgres connection
  - `src/product-kernel/db/types.ts` — `ProductDb` interface
  - `src/product-kernel/db/migrate.ts` — SQL migration runner
- Note: Being migrated to MikroORM. Both layers coexist in tRPC context.

**`src/trpc/` (41 files) — tRPC root layer:**
- Purpose: Root router composition, shared middleware, input/output schemas
- Key files:
  - `src/trpc/router.ts` — AppRouter (root, composes all domain routers)
  - `src/trpc/trpc.ts` — tRPC instance + base procedures
  - `src/trpc/middleware.ts` — Auth middleware (`protectedProcedure`)
  - `src/trpc/context.ts` — `TrpcContext` type + `createContext()`
  - `src/trpc/rest-api.ts` — REST API bridge
  - `src/trpc/routers/` — Some domain routers (orchestration, artifacts, notifications, etc.)
  - `src/trpc/schemas/` — Zod schemas for tRPC inputs/outputs

**`src/server/trpc/routers/` (25 files) — Backend domain routers:**
- Purpose: tRPC procedure implementations for core domains
- Contains: `auth.ts`, `tasks.ts`, `docs.ts`, `sprints.ts`, `memory.ts`, `flags.ts`, `audit.ts`, `backup.ts`, `custom-fields.ts`, `inference.ts`, `routing.ts`, `skills.ts`, `telemetry.ts`, `theme.ts`, `orgs.ts`, `error-logs.ts`, `json-import-export.ts`, `doc-templates.ts`
- Pattern: Each file exports a `createTRPCRouter()` domain router

**`src/cli/` (155 files) — CLI subcommands:**
- Purpose: All `fulcrum <cmd>` implementations
- Key files:
  - `src/cli/arg-parser.ts` — Argument parsing
  - `src/cli/local-caller.ts` — In-process tRPC caller
  - `src/cli/install.ts` — `fulcrum install` (agent config wiring)
  - `src/cli/init.ts` — `fulcrum init` (project bootstrap)
  - `src/cli/doctor.ts` — `fulcrum doctor` health checks
  - `src/cli/inference.ts` — `fulcrum inference` commands
  - `src/cli/product.ts` — `fulcrum product` commands
  - `src/cli/component.ts` — Component system commands
  - `src/cli/mcp-registry.ts` — MCP server management

**`src/web/` (17,925 files) — SvelteKit web app:**
- Purpose: Full web UI — dashboard, task management, docs, settings, etc.
- Key files:
  - `src/web/src/hooks.server.ts` — Server hooks (auth + tRPC mount)
  - `src/web/svelte.config.js` — SvelteKit config
  - `src/web/vite.config.ts` — Vite bundler config
  - `src/web/package.json` — Web-specific dependencies (separate from root)
- Route structure: `src/web/src/routes/` — `tasks/`, `docs/`, `agents/`, `runs/`, `boards/`, `search/`, `settings/`, `auth/`, `projects/`, `memory/`, `artifacts/`, `repos/`, `orchestration/`, `inference/`, `doctor/`, `audit/`, `inbox/`, `context/`, `offline/`
- Components: `src/web/src/lib/components/` — `ui/`, `tasks/`, `docs/`, `editor/`, `dashboard/`, `board/`, `runs/`, `search/`, `command-palette/`, `saved-views/`, `planning/`, `repos/`, `artifacts/`, `markdown/`, `feedback/`, `projects/`, `app/`, `task-detail/`
- State: `src/web/src/lib/state/` — Svelte stores for active project, etc.

**`src/tui/` (79 files) — Terminal UI:**
- Purpose: Keyboard-first ANSI terminal interface
- Key files:
  - `src/tui/index.ts` — Entry point
  - `src/tui/renderer.ts` — ANSI rendering engine
  - `src/tui/screens/` — Screen implementations (auth, flags, activity, docs, notifications, etc.)
  - `src/tui/testing/fake-tty.ts` — Test harness for headless testing

**`src/orchestration/` (26 files) — Symphony orchestrator:**
- Purpose: Agent run state machine, dispatch, telemetry
- Key files:
  - `src/orchestration/symphony/orchestrator.ts` — Core state machine (Unclaimed → Claimed)
  - `src/orchestration/symphony/worker.ts` — Agent worker process
  - `src/orchestration/symphony/dispatch.ts` — Agent dispatch logic
  - `src/orchestration/symphony/hooks.ts` — Lifecycle hook system
  - `src/orchestration/symphony/stall.ts` — Stall detection scanner
  - `src/orchestration/symphony/telemetry.ts` — Token/cost tracking
  - `src/orchestration/symphony/schemas.ts` — Workflow config schemas
  - `src/orchestration/sandbox-runner.ts` — Sandcastle sandbox runner
  - `src/orchestration/session-resume.ts` — Session resume logic
  - `src/orchestration/token-tracking.ts` — Token usage tracking
  - `src/orchestration/artifact-harvest-hook.ts` — Post-run artifact collection

**`src/agents/` (13 files) — Agent registry:**
- Purpose: Multi-agent profile definitions and persistence
- Key files:
  - `src/agents/registry.ts` — `getProfile()`, `listProfiles()`
  - `src/agents/types.ts` — `AgentProfileSchema`
  - `src/agents/profiles/claude-code.ts` — Claude Code profile
  - `src/agents/profiles/codex.ts` — Codex profile
  - `src/agents/profiles/gemini-cli.ts` — Gemini CLI profile
  - `src/agents/profiles/opencode.ts` — OpenCode profile
  - `src/agents/profiles/pi.ts` — Pi profile
  - `src/agents/profiles/copilot.ts` — Copilot profile

**`src/connectors/` (16 files) — External PM connectors:**
- Purpose: Sync tasks/docs from external tools
- Contains: `linear.ts`, `jira.ts`, `github-issues.ts`, `gitlab.ts`, `notion.ts`, `confluence.ts`, `bitbucket.ts`, `plane.ts`, `csv.ts`
- Key files:
  - `src/connectors/interface.ts` — Connector interface definition
  - `src/connectors/framework.ts` — Connector execution framework
  - `src/connectors/registry.ts` — Connector registry

## Key File Locations

**Entry Points:**
- `src/index.ts`: CLI binary entry (`#!/usr/bin/env bun`)
- `src/web/src/hooks.server.ts`: Web server hooks
- `src/tui/index.ts`: TUI application root
- `src/api/hono.ts`: Hono REST API factory
- `inference/inference-server/`: Rust inference HTTP server

**Configuration:**
- `package.json`: Root dependencies + scripts
- `src/web/package.json`: Web-specific dependencies
- `tsconfig.json`: TypeScript configuration
- `bunfig.toml`: Bun runtime configuration
- `src/db/mikro-orm.config.ts`: MikroORM configuration
- `src/web/svelte.config.js`: SvelteKit configuration
- `src/web/vite.config.ts`: Vite bundler configuration
- `config/tool-output-policy.toml`: Tool output routing policy
- `inference/models.toml`: Inference model configuration
- `cliff.toml`: git-cliff changelog configuration
- `justfile`: Task runner recipes
- `src-tauri/tauri.conf.json`: Tauri desktop config

**Core Logic:**
- `src/trpc/router.ts`: AppRouter definition (all procedure namespaces)
- `src/db/db.module.ts`: DI container wiring
- `src/flags/registry.ts`: Feature flag resolution
- `src/orchestration/symphony/orchestrator.ts`: Run state machine
- `src/subscriptions/event-bus.ts`: Real-time event transport
- `src/hooks/`: Agent hook implementations (format, lint-gate, pm-policy, test-on-edit, audit-log, index-check, index-rebuild, tool-output-router)

**Testing:**
- `src/test-utils/`: Shared test helpers
- `src/web/tests/`: Web E2E tests (Playwright)
- `src/web/vitest.config.ts`: Web unit test config
- `tests/`: Integration tests
- `evals/`: Skill evaluation scripts

## Naming Conventions

**Files:**
- kebab-case for modules: `event-bus.ts`, `local-caller.ts`, `fake-tty.ts`
- PascalCase for entity classes: `AgentRun.ts`, `FeatureFlag.ts`, `DocVersion.ts`
- PascalCase + "Repository" suffix: `AgentRunRepository.ts`, `UserRepository.ts`
- `.test.ts` suffix co-located with source: `registry.test.ts` next to `registry.ts`

**Directories:**
- kebab-case: `product-kernel/`, `test-utils/`, `agent-profiles/`
- Singular for entity domains: `auth/`, `tasks/`, `docs/`, `memory/`
- Plural for collections: `routers/`, `schemas/`, `profiles/`, `migrations/`

## Where to Add New Code

**New Domain Entity:**
- Entity: `src/db/entities/<domain>/NewEntity.ts` (with `@Entity()` decorator)
- Repository: `src/db/repositories/<domain>/NewEntityRepository.ts`
- Register in: `src/db/db.module.ts` (add import + `container.bind()`)
- Migration: `src/db/migrations/Migration<timestamp>_<name>.ts`
- Index export: `src/db/entities/<domain>/index.ts`

**New tRPC Router:**
- Router implementation: `src/server/trpc/routers/<domain>.ts`
- Mount in: `src/trpc/router.ts` (import + add to `appRouter`)
- Schemas: `src/trpc/schemas/<domain>.ts`

**New REST API Route:**
- Route: `src/api/routes/<domain>.ts`
- Register in: `src/api/hono.ts` (add `register<Domain>Routes(api)`)

**New CLI Subcommand:**
- Handler: `src/cli/<command>.ts`
- Wire in: `src/index.ts` (add to HELP text + dispatch switch)

**New Web Route:**
- Page: `src/web/src/routes/<path>/+page.svelte`
- Server load: `src/web/src/routes/<path>/+page.server.ts`
- Components: `src/web/src/lib/components/<domain>/`

**New TUI Screen:**
- Screen: `src/tui/screens/<name>.ts`
- Register in: `src/tui/index.ts` (add to screen router)

**New Connector:**
- Implementation: `src/connectors/<name>.ts` (implement `ConnectorInterface`)
- Register in: `src/connectors/registry.ts`

**New Agent Hook:**
- Hook: `src/hooks/<name>.ts`
- Test: `src/hooks/<name>.test.ts`
- Wire in: `src/index.ts` HELP text

**New Feature Flag:**
- Add to `FEATURE_FLAGS` array in `src/flags/registry.ts`
- Gate code with `await flagRegistry.flag("flag-name", { orgId })`

**Shared Utilities:**
- General: `src/utils/`
- Test helpers: `src/test-utils/`
- Type definitions: `src/types/`

## Special Directories

**`graphify-out/`:**
- Purpose: Code knowledge graph (7829 nodes, 17125 edges, 89 communities)
- Generated: Yes (by `graphify build .`)
- Committed: Yes

**`vendor/openai-symphony/`:**
- Purpose: Vendored Symphony Elixir orchestrator (git submodule)
- Generated: No (external dependency)
- Committed: Yes (submodule reference)

**`inference/`:**
- Purpose: Rust workspace for local inference server
- Generated: No (hand-written Rust)
- Committed: Yes (source only; `inference/target/` gitignored)

**`src-tauri/`:**
- Purpose: Tauri desktop application shell
- Generated: No
- Committed: Yes

**`dist/`:**
- Purpose: Compiled CLI binaries
- Generated: Yes (by `bun build --compile`)
- Committed: No (gitignored)

**`.planning/`:**
- Purpose: Planning and analysis documents
- Generated: By GSD tooling
- Committed: Yes

---

*Structure analysis: 2026-05-04*
