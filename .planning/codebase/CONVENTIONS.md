# Coding Conventions

**Analysis Date:** 2026-05-06

## Naming Patterns

**Files:**
- Use kebab-case for most feature modules: `src/router/rules-engine.ts`, `src/router/no-match-prompt.ts`, `apps/server/src/api/feature-flags.ts`.
- Use PascalCase for class-centric services and entities: `src/services/TaskService.ts`, `src/services/WorkflowService.ts`, `src/db/entities/tasks/Task.ts`.
- Use SvelteKit route names exactly: `apps/web/src/routes/boards/+page.server.ts`, `apps/web/src/routes/runs/[id]/+page.svelte`.
- Use `.test.ts` for Bun and Vitest unit/contract tests: `src/services/TaskService.test.ts`, `tests/db/migrator-service.test.ts`, `apps/web/src/routes/boards/page.svelte.test.ts`.
- Use `.spec.ts` for Playwright browser tests: `apps/web/tests/e2e/phase08-surface-delivery.spec.ts`, `apps/web/tests/e2e/_smoke.spec.ts`.

**Functions:**
- Use `camelCase` verbs for functions and factories: `createPublicApi()` in `apps/server/src/api/hono.ts`, `runMigrations()` in `src/product-kernel/db/migrate.ts`, `openPglite()` in `src/product-kernel/db/pglite.ts`.
- Use `create*` for factory functions: `createPublicApiRouter()` in `apps/server/src/api/hono.ts`, `createLocalOrg()` in `src/product-kernel/store/repositories.ts`.
- Use `register*Routes` for Hono route registration modules: `registerDocRoutes()` in `apps/server/src/api/routes/docs.ts`, `registerRunsRoutes()` in `apps/server/src/api/routes/runs.ts`.
- Use `make*`, `build*`, or `seed*` for test helpers: `makeTask()` in `src/services/TaskService.test.ts`, `buildOrm()` in `tests/db/migrator-service.test.ts`, `seedTasks()` in `apps/web/src/routes/boards/page.server.test.ts`.

**Variables:**
- Use `camelCase` locals and fields in TypeScript code: `activeProjectId`, `fulcrumHome`, `webInstallCache` in `scripts/ci.ts`.
- Use `UPPER_SNAKE_CASE` for constants and canonical lists: `CUSTOM_FIELD_TYPES` in `src/db/entities/tasks/schemas.ts`, `CI_ENV` and `STEPS` in `scripts/ci.ts`.
- Use descriptive test fixture names that encode behavior: `taskAlphaPendingId`, `betaProjectId` in `apps/web/src/routes/boards/page.server.test.ts`.
- Use snake_case only when mirroring database columns or API payloads: `project_id`, `updated_at` in `apps/web/src/routes/boards/page.svelte.test.ts`.

**Types:**
- Use PascalCase interfaces and type aliases: `TaskOutput`, `BulkTaskPatch`, `TaskContext` in `src/services/TaskService.ts`; `PublicApiDeps` in `apps/server/src/api/hono.ts`.
- Co-locate narrow service types with their service implementation when not shared broadly: `TaskOutput` and `BulkTaskPatch` in `src/services/TaskService.ts`.
- Export service-facing contracts and keep private helper types unexported: `TaskContext` remains local in `src/services/TaskService.ts`.
- Prefer `type` imports for types under `verbatimModuleSyntax`: `import type { EntityManager }` in `src/services/TaskService.ts`.

## Code Style

**Formatting:**
- Root TypeScript uses two-space indentation, double quotes, semicolons, trailing commas in multiline calls, and explicit `.ts` relative imports: `apps/server/src/api/hono.ts`, `scripts/ci.ts`, `src/services/TaskService.ts`.
- Web package files mostly follow SvelteKit defaults; TypeScript files use double quotes while generated/default JS config may use tabs/single quotes: `apps/web/vitest.config.ts`, `apps/web/svelte.config.js`.
- No root Prettier, ESLint, or Biome config is detected. `evals/biome.json` is trigger-eval data, not a repo formatter config.
- Formatting authority is current code style plus TypeScript checks; avoid introducing a new formatter config without an explicit phase decision.

**Linting:**
- Root lint is TypeScript only: `package.json` script `lint` runs `bun run --bun tsc --noEmit`.
- Module boundaries have a dedicated gate: `package.json` script `lint:boundaries` runs `scripts/check-module-boundaries.ts`.
- Web lint/check gate is SvelteKit + svelte-check: `apps/web/package.json` script `check` runs `svelte-kit sync && svelte-check --no-tsconfig --threshold error --diagnostic-sources svelte,css`.
- CI is authoritative: `scripts/ci.ts` runs install, typecheck, targeted conformance tests, root tests, coverage, license audit, codegen, migrations, build, web checks, web tests, accessibility, and Playwright smoke.

## Import Organization

**Order:**
1. Node built-ins: `node:fs`, `node:path`, `node:os` in `apps/web/src/routes/boards/page.server.test.ts`.
2. Test/runtime/framework imports: `bun:test`, `@trpc/server`, `hono`, `@hono/zod-openapi`, `@sveltejs/kit`.
3. External package imports: `@mikro-orm/postgresql`, `@electric-sql/pglite`, `zod`.
4. Internal absolute/alias imports for web: `$lib/server/db`, `$lib/server/runs` in `apps/web/src/routes/runs/[id]/+page.server.ts`.
5. Internal relative imports for root code: `../db/entities/core/Event.ts`, `./WorkflowService.ts` in `src/services/TaskService.ts`.
6. Type imports are marked with `type` and often grouped with the related runtime import.

**Path Aliases:**
- Root TypeScript alias `@/*` maps to `src/*` in `tsconfig.json`, but many modules use explicit relative imports with `.ts` extensions.
- Web uses SvelteKit aliases, especially `$lib`, configured through SvelteKit and test aliases in `apps/web/vitest.config.ts`.
- Web tests mock SvelteKit virtual modules with `mock.module("$app/state", ...)` or Vitest aliases: `apps/web/src/routes/boards/page.svelte.test.ts`, `apps/web/vitest.config.ts`.

## Error Handling

**Patterns:**
- Use domain/framework errors for API-facing failures: `TRPCError` in `src/services/TaskService.ts` and `error(404, ...)` from SvelteKit in `apps/web/src/routes/runs/[id]/+page.server.ts`.
- Use plain `Error` for CLI, scripts, and invariant failures: `scripts/gen-conformance-trace.ts`, `src/services/tasks.ts`.
- Use fail-closed checks for config and gates: `scripts/ci-schemas.ts`, `scripts/check-module-boundaries.ts`, `scripts/ci/codegen.ts`.
- Use best-effort `try/catch` only for non-critical side effects and log or ignore intentionally: watcher auto-subscribe in `src/services/TaskService.ts`, hot-reload listener isolation in `src/router/event-bus.ts`.
- Preserve process environment around tests that mutate it: `runDbMigrate()` in `apps/cli/src/doctor.test.ts`, route tests under `apps/web/src/routes/*/page.server.test.ts`.

## Logging

**Framework:** console

**Patterns:**
- CLI and CI scripts write user-facing progress with `console.log`/`console.error`: `scripts/ci.ts`, `scripts/release.ts`, `scripts/build-all.ts`.
- Services avoid logging on happy paths; log only when fallback/observability matters: `src/router/rules-engine.ts`, `src/router/llm-fallback.ts`.
- JSON output modes must remain parseable; tests validate `fulcrum doctor --json` by parsing stdout in `apps/cli/src/doctor.test.ts`.
- Prefer structured JSON for machine-facing reports when available: `scripts/license-audit.ts`, `scripts/static-build-proof.ts`.

## Comments

**When to Comment:**
- Comment non-local reasoning, compatibility constraints, or phase decisions: `scripts/ci.ts` explains web pipeline separation; `apps/server/src/api/hono.ts` documents ARCH-09 consolidation and feature gate behavior.
- Use section banners sparingly for large service/test files: `src/services/TaskService.ts`, `tests/db/migrator-service.test.ts`.
- Avoid comments that restate one-line code; add comments where a future change could break a contract.

**JSDoc/TSDoc:**
- Use JSDoc for public factories and complex test setup: `createPublicApi()` in `apps/server/src/api/hono.ts`, `buildOrm()` in `tests/db/migrator-service.test.ts`.
- Use file-level block comments to capture TDD/phase acceptance context in large suites: `tests/db/migrator-service.test.ts`, `src/services/TaskService.test.ts`.
- Do not require JSDoc for every function; most helpers use descriptive names instead.

## Function Design

**Size:** Keep new functions small unless matching existing service/test patterns. Large services split behavior with private helpers and section comments: `src/services/TaskService.ts`.

**Parameters:** Prefer object parameters for multi-field service calls and route dependencies: `createPublicApi(deps?: PublicApiDeps)` in `apps/server/src/api/hono.ts`, `bulkUpdate(ctx, ids, patch)` in `src/services/TaskService.ts`.

**Return Values:** Use explicit `Promise<T>` on exported async functions and services: `TaskService.list()` in `src/services/TaskService.ts`, `createPublicApi()` in `apps/server/src/api/hono.ts`.

## Module Design

**Exports:** Export named functions/classes/types; avoid default exports except framework-required files such as Svelte components/configs: `apps/server/src/api/hono.ts`, `apps/web/vite.config.ts`, `apps/web/svelte.config.js`.

**Barrel Files:** Use local barrels for domain surfaces where established: `src/router/index.ts`, `src/services/index.ts`. Do not add broad barrels for new code unless matching an existing domain boundary.

---

*Convention analysis: 2026-05-06*
