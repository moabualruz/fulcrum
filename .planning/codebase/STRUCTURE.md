# Codebase Structure

**Analysis Date:** 2026-05-06

## Directory Layout

```
fulcrum/
├── AGENTS.md                    # Project agent rules and current product direction
├── package.json                 # Root Bun package, workspaces, scripts, dependencies
├── justfile                     # Project recipes; currently `sync-symphony`
├── tsconfig.json                # Root TypeScript configuration
├── apps/                        # Runnable local apps / surfaces
│   ├── cli/                     # Bun CLI app and `fulcrum` binary entrypoint
│   ├── server/                  # Local REST/tRPC/router/Yjs server adapters
│   ├── tui/                     # OpenTUI terminal client
│   └── web/                     # SvelteKit web client and local web UI
├── src/                         # Shared core TypeScript modules
│   ├── agents/                  # Agent profile registry and per-agent profiles
│   ├── artifacts/               # Artifact harvest, storage, preview, pruning
│   ├── auth/                    # Better-Auth integration
│   ├── backup/                  # Backup/restore runners and adapters
│   ├── collab/                  # Collaboration server/domain helpers
│   ├── components/              # Fulcrum installable component catalog/planner/ledger
│   ├── config/                  # Runtime config resolution
│   ├── connectors/              # External tool connector registry/sync
│   ├── context/                 # Agent context assembly
│   ├── data/                    # CSV/import/export/redaction utilities
│   ├── db/                      # Canonical MikroORM data layer
│   ├── docs/                    # Document search/version/collab helpers
│   ├── doctor/                  # Health check runner/check modules
│   ├── errors/                  # Error reporting/persistence helpers
│   ├── events/                  # Domain event handlers
│   ├── flags/                   # Feature flag registry/evaluation
│   ├── hooks/                   # Agent hook implementations
│   ├── i18n/                    # Shared i18n helpers/locales
│   ├── importers/               # Jira/Linear/Plane importer modules
│   ├── inference/               # Inference client, lifecycle, probes, backends
│   ├── keybindings/             # Shared keybinding schemas/defaults
│   ├── marketplace/             # Marketplace listing registry/procedures
│   ├── memory/                  # Memory digest/extraction/retrieval
│   ├── notifications/           # Notification fanout/delivery/rules
│   ├── orchestration/           # Symphony orchestration and sandbox dispatch
│   ├── permissions/             # Permission policy integration
│   ├── platform/                # Cross-cutting platform utilities
│   ├── product-kernel/          # Legacy ProductDb SQL-first compatibility layer
│   ├── queue/                   # Queue exports/helpers
│   ├── repo/                    # Repo context docs/ADR namespace
│   ├── repos/                   # Git/repository domain logic
│   ├── router/                  # Agent routing rules engine
│   ├── search/                  # Search query/index/cache/filter system
│   ├── secrets/                 # Credentials and secret storage
│   ├── services/                # Domain service classes
│   ├── skills/                  # Skill registry, sync, lock, marketplace client
│   ├── subscriptions/           # EventBus, tRPC subscriptions, polling bridges
│   ├── surfaces/                # Surface parity checks
│   ├── test-utils/              # Shared test helpers
│   ├── tests/                   # Root-level UAT/phase tests
│   ├── types/                   # Shared ambient/domain types
│   ├── utils/                   # General utilities
│   ├── webhooks/                # Webhook dispatcher
│   └── workers/                 # Worker registry/jobs
├── docs/                        # Human project docs
├── rules/                       # Fulcrum rules distributed to agents
├── skills/                      # Authored skill source mirrored by `fulcrum skills sync`
├── hooks/                       # Hook recipes/snippets
├── scripts/                     # CI, release, build, boundary checks, generators
├── config/                      # Tool/output policy runtime config
├── plugins/                     # Plugin packaging/support files
├── tests/                       # Cross-package integration/e2e tests
├── vendor/openai-symphony/      # Symphony submodule synced by `just sync-symphony`
├── .claude-plugin/              # Claude plugin marketplace metadata
├── .planning/                   # GSD planning/state/codebase maps
├── .scratch/                    # Local issue/research scratch area
└── graphify-out/                # Generated code knowledge graph output
```

## Directory Purposes

**`src/`:**
- Purpose: Shared core runtime TypeScript used by local apps.
- Contains: application/domain services, DB, orchestration, integrations, platform modules, tests.
- Key files: `src/application/`, `src/db/db.module.ts`, `src/orchestration/symphony/orchestrator.ts`, `src/agents/registry.ts`.

**`apps/`:**
- Purpose: First-class runnable local apps and server adapters.
- Contains: `apps/cli`, `apps/server`, `apps/tui`, `apps/web`.
- Key files: `apps/cli/src/main.ts`, `apps/cli/src/index.ts`, `apps/server/src/index.ts`, `apps/tui/src/index.ts`, `apps/web/src/hooks.server.ts`.
- Package contract: root `package.json` declares `workspaces: ["apps/*"]`; each app package exposes local `dev`/`test`/`typecheck` scripts where applicable.

**`src/agents/`:**
- Purpose: Canonical agent support registry and profile definitions.
- Contains: `types.ts`, `registry.ts`, `resolve-agent-run-config.ts`, `profiles/`.
- Key files: `src/agents/registry.ts`, `src/agents/profiles/codex.ts`, `src/agents/profiles/claude-code.ts`.

**`apps/server/src/api/`:**
- Purpose: Public REST/OpenAPI API surface.
- Contains: Hono factory, API auth, rate limit, feature flag gate, route adapters.
- Key files: `apps/server/src/api/hono.ts`, `apps/server/src/api/auth.ts`, `apps/server/src/api/feature-flags.ts`, `apps/server/src/api/routes/tasks.ts`, `apps/server/src/api/routes/kernel-tasks.ts`.

**`apps/cli/src/`:**
- Purpose: Implementation of `fulcrum <command>` subcommands.
- Contains: command modules, generated domain command data, interactive helpers, Symphony CLI helpers.
- Key files: `apps/cli/src/index.ts`, `apps/cli/src/install.ts`, `apps/cli/src/product.ts`, `apps/cli/src/component.ts`, `apps/cli/src/mcp-cmd.ts`, `apps/cli/src/compress.ts`.

**`src/db/`:**
- Purpose: Canonical MikroORM persistence layer.
- Contains: entities, repositories, migrations, custom PGlite driver, DB module, migrator service, seed logic.
- Key files: `src/db/db.module.ts`, `src/db/mikro-orm.config.ts`, `src/db/migrator-service.ts`, `src/db/seed.ts`.
- Subdirs: `src/db/entities/`, `src/db/repositories/`, `src/db/migrations/`, `src/db/types/`.

**`src/db/entities/`:**
- Purpose: Domain model classes.
- Contains: domain subdirectories for auth, tasks, docs, memory, orchestration, notifications, repos, search, skills, etc.
- Key files: `src/db/entities/tasks/Task.ts`, `src/db/entities/docs/Document.ts`, `src/db/entities/orchestration/AgentRun.ts`, `src/db/entities/core/Event.ts`.

**`src/db/repositories/`:**
- Purpose: Typed repository subclasses and query helpers.
- Contains: matching domain subdirectories to `src/db/entities/`.
- Key files: `src/db/repositories/tasks/TaskRepository.ts`, `src/db/repositories/docs/DocumentRepository.ts`, `src/db/repositories/orchestration/AgentRunRepository.ts`.

**`src/product-kernel/`:**
- Purpose: Legacy ProductDb SQL-first layer and compatibility modules.
- Contains: SQL migrations, PGlite/Postgres adapters, store modules, API shims, notification/symphony helpers.
- Key files: `src/product-kernel/db/types.ts`, `src/product-kernel/db/migrate.ts`, `src/product-kernel/db/pglite.ts`, `src/product-kernel/store/repositories.ts`.
- Use: compatibility only for new architecture unless explicitly maintaining existing product-kernel callers.

**`apps/server/src/trpc/`:**
- Purpose: Shared internal API boundary.
- Contains: root router, context, base procedures, middleware, permissions metadata, domain routers, schemas.
- Key files: `apps/server/src/trpc/router.ts`, `apps/server/src/trpc/context.ts`, `apps/server/src/trpc/trpc.ts`, `apps/server/src/trpc/middleware.ts`.

**`apps/server/src/runtime/trpc/routers/`:**
- Purpose: Server-side domain tRPC procedure implementations.
- Contains: auth, tasks, docs, sprints, flags, memory, audit, backup, custom fields, inference, routing, skills, telemetry, theme, orgs, comments, workflows, relationships, templates, recurrence, automations.
- Key files: `apps/server/src/runtime/trpc/routers/tasks.ts`, `apps/server/src/runtime/trpc/routers/docs.ts`, `apps/server/src/runtime/trpc/routers/auth.ts`.

**`src/services/`:**
- Purpose: Shared domain business services called by routers/surfaces.
- Contains: service classes for tasks, docs, sprints, comments, workflow, automation, reports, relationships, templates, recurrence.
- Key files: `src/services/TaskService.ts`, `src/services/DocService.ts`, `src/services/SprintService.ts`, `src/services/WorkflowService.ts`.

**`apps/web/`:**
- Purpose: SvelteKit web app package with separate `package.json`.
- Contains: SvelteKit config, Vite config, routes, components, lib modules, web tests.
- Key files: `apps/web/package.json`, `apps/web/src/hooks.server.ts`, `apps/web/src/routes/+layout.server.ts`, `apps/web/src/routes/api/trpc/[...path]/+server.ts`.

**`apps/web/src/routes/`:**
- Purpose: File-based web routing.
- Contains: page routes and API endpoints for dashboard, projects, tasks, docs, repos, runs, settings, auth, search, memory, artifacts, inference, audit, doctor.
- Key files: `apps/web/src/routes/projects/[id]/board/+page.server.ts`, `apps/web/src/routes/tasks/[id]/+page.server.ts`, `apps/web/src/routes/api/v1/+server.ts`.

**`apps/web/src/lib/`:**
- Purpose: Web-only components, state, server helpers, i18n, theme, editor, UI primitives.
- Contains: `components/`, `server/`, `state/`, `collab/`, `i18n/`, web-specific utilities.
- Key files: `apps/web/src/lib/server/db.ts`, `apps/web/src/lib/state/active-project.ts`.

**`apps/tui/src/`:**
- Purpose: Keyboard-first terminal UI.
- Contains: app root, router, screens, OpenTUI adapter, renderer, testing FakeTTY, theme/widgets.
- Key files: `apps/tui/src/index.ts`, `apps/tui/src/router.ts`, `apps/tui/src/screens/index.ts`, `apps/tui/src/testing/fake-tty.ts`.

**`src/orchestration/`:**
- Purpose: Agent run lifecycle, Symphony state machine, sandbox dispatch, artifact harvest, token tracking.
- Contains: `symphony/` state machine modules, workers, sandbox runner, session resume.
- Key files: `src/orchestration/symphony/orchestrator.ts`, `src/orchestration/symphony/hooks.ts`, `src/orchestration/symphony/stall.ts`.

**`src/router/`:**
- Purpose: Agent/task routing rules engine.
- Contains: rules engine, auto-assign, LLM fallback, conflict detector, learned drafts, telemetry.
- Key files: `src/router/service.ts`, `src/router/rules-engine.ts`, `src/router/auto-assign.ts`, `src/router/telemetry.ts`.

**`src/subscriptions/`:**
- Purpose: Realtime/event subscription primitives.
- Contains: EventBus, tRPC subscription procedures, PGlite bridge, polling fallback.
- Key files: `src/subscriptions/event-bus.ts`, `src/subscriptions/procedures.ts`, `src/subscriptions/pglite-bridge.ts`.

**`src/search/`:**
- Purpose: Search and indexing services.
- Contains: query services, indexers, cache, saved searches, filters, telemetry.
- Key files: `src/search/query-service.ts`, `src/search/indexers/task.ts`, `src/search/indexers/document.ts`, `src/search/backend.ts`.

**`src/notifications/`:**
- Purpose: Notification rules, fanout, delivery, bell counters.
- Contains: fanout worker, delivery worker/retry, quiet hours, delivery handlers.
- Key files: `src/notifications/fanout-worker.ts`, `src/notifications/delivery-worker.ts`, `src/notifications/rule-engine.ts`.

**`src/inference/`:**
- Purpose: Model backend lifecycle and client/probe layer.
- Contains: backend clients for embedded/Ollama/LM Studio/OpenAI-compatible paths, health probes, routing config, token helpers.
- Key files: `src/inference/service.ts`, `src/inference/lifecycle.ts`, `src/inference/backend-probes.ts`, `src/inference/backends/index.ts`.

**`src/hooks/`:**
- Purpose: Agent hook subcommand implementations.
- Contains: format, lint gate, package manager policy, test-on-edit, audit log, index checks, tool-output router.
- Key files: `src/hooks/format.ts`, `src/hooks/lint-gate.ts`, `src/hooks/tool-output-router.ts`.

**`scripts/`:**
- Purpose: Project automation outside shipped runtime.
- Contains: CI runner, release runner, build-all, boundary checks, generated trace tooling.
- Key files: `scripts/ci.ts`, `scripts/build-all.ts`, `scripts/check-module-boundaries.ts`, `scripts/release.ts`.

**`skills/`:**
- Purpose: Source skills mirrored to supported agents.
- Contains: one directory per authored skill plus source registry.
- Key files: `skills/SOURCES.md`, `skills/*/SKILL.md`.

**`rules/`:**
- Purpose: Rules body spliced into agent runtime config files.
- Contains: cross-agent AGENTS rules.
- Key files: `rules/AGENTS.md`.

**`.planning/`:**
- Purpose: GSD project state, phases, research, and codebase maps.
- Contains: `STATE.md`, `ROADMAP.md`, `phases/`, `codebase/`, graph archives.
- Key files: `.planning/STATE.md`, `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md`.

**`graphify-out/`:**
- Purpose: Generated code knowledge graph.
- Contains: report, wiki, graph data.
- Key files: `graphify-out/GRAPH_REPORT.md`, `graphify-out/wiki/index.md`.

## Key File Locations

**Entry Points:**
- `apps/cli/src/main.ts`: Bun executable entry point and top-level command dispatcher.
- `apps/cli/src/index.ts`: broad CLI command hub, DB bootstrap, web/TUI launch.
- `apps/web/src/hooks.server.ts`: SvelteKit request hook, auth/tRPC/DB locals.
- `apps/tui/src/index.ts`: terminal UI app root.
- `apps/server/src/api/hono.ts`: canonical public REST/OpenAPI API factory.
- `apps/server/src/runtime/yjs-server.ts`: Yjs collaboration WebSocket server.

**Configuration:**
- `package.json`: root Bun scripts and dependency set.
- `apps/web/package.json`: SvelteKit package scripts and web dependencies.
- `justfile`: project recipe for syncing Symphony submodule and conformance trace.
- `tsconfig.json`: root TypeScript config.
- `apps/web/svelte.config.js`: SvelteKit config.
- `apps/web/vite.config.ts`: Vite config.
- `config/tool-output-policy.toml`: tool-output router policy.
- `.symphony-spec.lock`: generated Symphony spec lock.

**Core Logic:**
- `apps/server/src/trpc/router.ts`: root internal API router.
- `apps/server/src/trpc/context.ts`: request/session/data context.
- `src/db/db.module.ts`: DI repository/service binding.
- `src/db/migrator-service.ts`: migration safety wrapper.
- `src/services/TaskService.ts`: task domain service.
- `src/services/DocService.ts`: document domain service.
- `src/orchestration/symphony/orchestrator.ts`: run claiming/state machine.
- `src/agents/registry.ts`: canonical agent registry.
- `src/flags/registry.ts`: feature flag registry.
- `src/subscriptions/event-bus.ts`: in-process realtime event bus.

**Testing:**
- `src/**/*.test.ts`: colocated Bun tests across core modules.
- `apps/web/src/routes/**/*.test.ts`: route loader/server tests.
- `apps/web/tests/e2e/`: Playwright e2e tests.
- `apps/web/tests/a11y/`: Playwright accessibility tests.
- `apps/web/tests/vitest/`: Vitest web tests.
- `src/test-utils/`: shared root test helpers.
- `apps/web/tests/mocks/`: web mocks.

**Planning/Knowledge:**
- `.planning/STATE.md`: current milestone state and decisions.
- `.planning/phases/`: phase context/plans/UAT.
- `.planning/codebase/`: generated codebase reference maps.
- `graphify-out/GRAPH_REPORT.md`: generated structural graph report.
- `AGENTS.md`: project rules and current product context.

## Naming Conventions

**Files:**
- PascalCase service classes: `src/services/TaskService.ts`, `src/services/DocService.ts`.
- PascalCase ORM entities: `src/db/entities/tasks/Task.ts`, `src/db/entities/docs/Document.ts`.
- PascalCase repositories with `Repository` suffix: `src/db/repositories/tasks/TaskRepository.ts`.
- kebab-case utility/domain modules: `src/router/rules-engine.ts`, `src/product-kernel/db/migrate.ts`, `apps/server/src/api/rate-limit.ts`.
- SvelteKit route files follow framework names: `+page.svelte`, `+page.server.ts`, `+server.ts`, `+layout.server.ts`.
- Test files are colocated with `.test.ts` suffix: `src/services/TaskService.test.ts`, `src/router/rules-engine.test.ts`.
- Migration files use timestamp/class pattern under ORM: `src/db/migrations/Migration20260502090000_tasks_schema_extension.ts`.
- Product-kernel SQL migrations use numbered `.sql`: `src/product-kernel/db/migrations/0001_product_kernel.sql`.

**Directories:**
- Domain directories are lowercase/kebab-case where multiword: `src/product-kernel/`, `src/test-utils/`.
- DB entity/repository domains mirror product domains: `auth/`, `tasks/`, `docs/`, `memory/`, `orchestration/`, `notifications/`, `repos/`, `search/`, `skills/`.
- Web route directories follow URL path segments: `apps/web/src/routes/projects/[id]/settings/workflow/`.
- Dynamic SvelteKit params use bracket syntax: `[id]`, `[runId]`, `[...path]`.

## Where to Add New Code

**New Product Feature:**
- Primary service: `src/services/<Feature>Service.ts` when behavior spans routers/surfaces.
- tRPC API: `apps/server/src/runtime/trpc/routers/<feature>.ts` for server routers or `apps/server/src/trpc/routers/<feature>.ts` for already-rooted internal routers.
- Router mount: add to `apps/server/src/trpc/router.ts`.
- Web UI: `apps/web/src/routes/<feature>/` plus components under `apps/web/src/lib/components/<feature>/`.
- CLI: `apps/cli/src/<feature>.ts` or `apps/cli/src/commands/<feature>.ts`, dispatched from `apps/cli/src/index.ts` or `apps/cli/src/main.ts`.
- TUI: screen under `apps/tui/src/screens/<feature>.ts`, route in `apps/tui/src/index.ts`/`apps/tui/src/screens/index.ts`.
- Tests: colocated `.test.ts`; web route/component tests under matching `apps/web/src/routes/` or `apps/web/tests/`.

**New Database Entity:**
- Entity: `src/db/entities/<domain>/<Entity>.ts`.
- Repository: `src/db/repositories/<domain>/<Entity>Repository.ts`.
- Exports: matching `src/db/entities/<domain>/index.ts` and `src/db/repositories/<domain>/index.ts` if domain uses index files.
- DI binding: `src/db/db.module.ts`.
- Migration: `src/db/migrations/MigrationYYYYMMDDHHMMSS_description.ts`.
- Avoid: new ProductDb SQL migrations unless maintaining legacy compatibility in `src/product-kernel/`.

**New Public REST Endpoint:**
- Route adapter: `apps/server/src/api/routes/<resource>.ts`.
- Registration: `apps/server/src/api/hono.ts`.
- Auth/gating: use `apps/server/src/api/auth.ts`, `apps/server/src/api/rate-limit.ts`, `apps/server/src/api/feature-flags.ts`.
- Web route compatibility: only add `apps/web/src/routes/api/v1/**` if SvelteKit mount needs explicit handling.
- Tests: `apps/server/src/api/__tests__/` and route-specific tests near web API route if applicable.

**New Web Page:**
- Page route: `apps/web/src/routes/<path>/+page.svelte`.
- Server loader: `apps/web/src/routes/<path>/+page.server.ts`.
- Shared components: `apps/web/src/lib/components/<domain>/`.
- Web-only server helpers: `apps/web/src/lib/server/`.
- State: `apps/web/src/lib/state/` when state is shared across routes.

**New CLI Command:**
- Command implementation: `apps/cli/src/<command>.ts` for broad command or `apps/cli/src/commands/<command>.ts` for focused subcommand.
- Dispatch: `apps/cli/src/main.ts` for top-level commands, `apps/cli/src/index.ts` for grouped commands.
- Shared behavior: call `src/services/` or tRPC local caller; keep output formatting in CLI module.

**New TUI Screen:**
- Screen: `apps/tui/src/screens/<screen>.ts`.
- Routing: `apps/tui/src/router.ts` route data usage and app route list in `apps/tui/src/index.ts`.
- Widgets/theme helpers: `apps/tui/src/widgets/`, `apps/tui/src/theme/`, `apps/tui/src/utils/`.
- Tests: `apps/tui/src/__tests__/` or colocated screen tests using `apps/tui/src/testing/fake-tty.ts`.

**New Agent Profile:**
- Profile: `src/agents/profiles/<agent>.ts`.
- Registry: `src/agents/registry.ts`.
- Types/capabilities: `src/agents/types.ts`.
- Install/sync integration: relevant modules in `apps/cli/src/` and `src/components/` if surface needs distribution.

**New Hook:**
- Runtime hook: `src/hooks/<name>.ts`.
- Top-level hook dispatch: `apps/cli/src/main.ts`.
- Hook recipe/snippet: `hooks/recipes/<name>.snippet.md` if distributed.
- Docs/update references: `docs/hooks.md` if hook behavior changes.

**New Integration/Connector:**
- Connector logic: `src/connectors/` for sync/runtime connectors.
- Importer mapping: `src/importers/` or `src/data/importers/` for data import paths.
- Credentials: `src/secrets/` and DB entities/repositories if persisted.
- Settings UI: `apps/web/src/routes/settings/integrations/<id>/` or project settings connector route.

**New Search Indexer:**
- Indexer: `src/search/indexers/<domain>.ts`.
- Registration: `src/search/indexers/index.ts`.
- Query support: `src/search/query-service.ts` or `src/search/backend.ts`.
- Trigger: domain service write path such as `src/services/DocService.ts`.

**New Notification Behavior:**
- Rule/fanout logic: `src/notifications/rule-engine.ts`, `src/notifications/fanout-worker.ts`.
- Delivery channel: `src/notifications/delivery-handlers/<channel>.ts`.
- Subscription exposure: `src/subscriptions/procedures.ts`.
- DB persistence: entities/repositories under `src/db/entities/notifications/` and `src/db/repositories/notifications/`.

**Utilities:**
- Shared runtime utilities: `src/utils/` only when not domain-specific.
- Platform/cross-cutting: `src/platform/`.
- Test helpers: `src/test-utils/`.
- Web-only utilities: `apps/web/src/lib/`.
- Avoid adding parallel helpers when an existing domain service/module already owns behavior.

## Special Directories

**`apps/web/.svelte-kit/`:**
- Purpose: SvelteKit generated build/dev output.
- Generated: Yes.
- Committed: No.

**`dist/`:**
- Purpose: compiled `fulcrum` binaries from `bun run build` / `bun run build:all`.
- Generated: Yes.
- Committed: build artifacts only if release process requires; do not edit manually.

**`vendor/openai-symphony/`:**
- Purpose: Symphony upstream submodule used for spec/conformance.
- Generated: No, vendored submodule.
- Committed: submodule pointer.

**`.planning/`:**
- Purpose: GSD planning, state, phase, codebase map artifacts.
- Generated: Partly.
- Committed: Yes for planning artifacts.

**`.scratch/`:**
- Purpose: local issue/research scratch work.
- Generated: Mixed.
- Committed: only intentional planning/research artifacts when workflow requires.

**`graphify-out/`:**
- Purpose: generated knowledge graph/wiki.
- Generated: Yes.
- Committed: project-dependent; archived graph artifacts may also live under `.planning/graphs/`.

**`skills/`:**
- Purpose: source skill definitions.
- Generated: No for authored source; mirrored copies elsewhere are generated by `fulcrum skills sync`.
- Committed: Yes.

**`rules/`:**
- Purpose: cross-agent rules source.
- Generated: No.
- Committed: Yes.

**`hooks/recipes/`:**
- Purpose: hook recipe snippets vendored to agent/user config by install flows.
- Generated: No.
- Committed: Yes.

**`.claude-plugin/`:**
- Purpose: Claude plugin marketplace/package metadata for Fulcrum skills.
- Generated: Mostly source metadata.
- Committed: Yes.

**`apps/cli/src/generated/`:**
- Purpose: generated CLI helper data.
- Generated: Yes.
- Committed: Yes if used by runtime/tests; regenerate through scripts rather than manual edits.

**`apps/web/static/`:**
- Purpose: static web assets served by SvelteKit.
- Generated: No for source assets.
- Committed: Yes.

**`src/product-kernel/db/migrations/`:**
- Purpose: legacy SQL migration history.
- Generated: No.
- Committed: Yes.
- Guidance: do not add for new canonical ORM features unless maintaining compatibility.

---

*Structure analysis: 2026-05-06*
