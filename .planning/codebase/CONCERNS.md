# Codebase Concerns

**Analysis Date:** 2026-05-06

## Tech Debt

**Root tRPC surface still contains generated placeholder routers:**
- Issue: Placeholder CRUD procedures return `[]`, `null`, or `{ ok: true }` for mounted API domains.
- Files: `src/trpc/routers/stub-helpers.ts`, `src/trpc/router.ts`, `src/trpc/routers/connectors.ts`, `src/trpc/routers/agent-runs.ts`, `src/trpc/routers/repo-commits.ts`, `src/trpc/routers/saved-views.ts`, `src/trpc/routers/context.ts`
- Impact: Consumers can call procedures that appear successful without persistence or domain behavior. This hides missing work and creates false parity between real routers and placeholders.
- Fix approach: Replace each placeholder router with service-backed procedures or make unsupported procedures fail loudly with typed `TRPCError` codes. Do not add new routers through `crudRouter()` unless the domain is intentionally read-only and documented.

**Two database models coexist for product state:**
- Issue: Web/server code mixes raw `ProductDb` access, MikroORM `EntityManager`, and service wrappers.
- Files: `src/trpc/context.ts`, `src/web/src/lib/server/db.ts`, `src/web/src/lib/server/em.ts`, `src/web/src/lib/product-queries.ts`, `src/services/tasks.ts`, `src/services/artifacts.ts`, `src/services/runs.ts`
- Impact: Schema ownership is split between `src/product-kernel/db/migrations/*.sql` and `src/db/migrations/*.ts`, so route code can depend on columns or behaviors not present in one path.
- Fix approach: Use `EntityManager` as the write/read boundary for web and tRPC. Keep `ProductDb` only behind strict compatibility shims until each remaining raw query has an owning repository/service.

**Feature-flag parsing is duplicated across surfaces:**
- Issue: Several modules parse `FULCRUM_FEATURES` directly instead of using one registry/helper.
- Files: `src/api/feature-flags.ts`, `src/api/routes/tasks.ts`, `src/server/trpc/routers/routing.ts`, `src/web/src/lib/collab/feature-flags.ts`, `src/web/src/routes/settings/connectors/+page.server.ts`, `src/web/src/routes/settings/importers/+page.server.ts`
- Impact: Server, API, web, and client-gated behavior can drift on whitespace, environment source, and flag names.
- Fix approach: Route server-side flags through `src/api/feature-flags.ts` or the canonical registry; expose client-safe derived flags via SvelteKit load data or `VITE_FULCRUM_FEATURES`.

**Large multipurpose modules concentrate unrelated responsibilities:**
- Issue: Several files exceed 700-1,400 lines and combine parsing, I/O, rendering, orchestration, and command behavior.
- Files: `src/tui/index.ts`, `src/product-kernel/store/repositories.ts`, `src/cli/doctor.ts`, `src/cli/vendor-packages.ts`, `src/cli/install.ts`, `src/auth/adapter.ts`, `src/web/src/lib/components/tasks/TaskDetailPanel.svelte`, `src/web/src/lib/components/tasks/TaskComments.svelte`
- Impact: Small changes have high review cost and high regression surface. Tests tend to target whole modules instead of smaller behavioral units.
- Fix approach: Extract narrow domain modules only when touching related behavior. Preserve public exports and add characterization tests before splitting shared command or UI modules.

**Product-kernel migrations use a simple SQL ledger without checksums:**
- Issue: SQL migrations record only file names in `schema_migrations`; they do not store checksums or lossiness metadata.
- Files: `src/product-kernel/db/migrate.ts`, `src/product-kernel/db/migrations/*.sql`, `src/db/migrator-service.ts`, `src/db/entities/SchemaMigration.ts`
- Impact: Edited product-kernel SQL migration files are not detected after apply, unlike MikroORM migrations managed by `MigratorService`.
- Fix approach: Add checksum columns or route product-kernel migration execution through the same migration ledger guarantees used by `src/db/migrator-service.ts`.

## Known Bugs

**Database migrations settings page is hard-unimplemented:**
- Symptoms: Settings database migration route throws HTTP 501 for both page load and form action.
- Files: `src/web/src/routes/settings/database/migrations/+page.server.ts`
- Trigger: Navigate to settings database migrations page or submit its migrate action.
- Workaround: Use CLI/local migration commands instead of the web page.

**Settings connector configuration is process-local and stores plaintext tokens:**
- Symptoms: Saved connector config disappears on process restart and token values are stored in module-level memory.
- Files: `src/web/src/routes/settings/connectors/+page.server.ts`
- Trigger: Enable `connector-confluence`, `connector-notion`, or `connector-github-issues`, save connector config, restart server.
- Workaround: Use production connector service/credential storage where available; do not rely on this settings route for durable secrets.

**Settings importers simulate external import success:**
- Symptoms: Linear/Jira/Plane preflight returns fixed row data, confirm import records a success entry without external API calls or durable writes.
- Files: `src/web/src/routes/settings/importers/+page.server.ts`
- Trigger: Enable `import-linear`, `import-jira`, or `import-plane`, submit API key preflight/import flow.
- Workaround: Treat this route as UI shell only until importer actions delegate to `src/importers/*` and task services.

**Yjs server accepts any non-empty bearer token by default:**
- Symptoms: Default auth returns an authenticated user for any non-empty `Authorization: Bearer <token>` value.
- Files: `src/server/yjs-server.ts`
- Trigger: Start the Yjs WebSocket server without injecting a custom `validateSession` implementation.
- Workaround: Always pass a session validator that checks the database/session provider before enabling collaborative editing outside tests.

**Search failover is explicitly missing:**
- Symptoms: Search throws when PGlite crashes; test comment states Orama failover should return an empty result later.
- Files: `src/product-kernel/search.ts`, `src/product-kernel/search.test.ts`
- Trigger: `searchProductDocuments()` receives a failing `ProductDb` query implementation.
- Workaround: Catch search errors at route/UI boundary and surface degraded search state.

## Security Considerations

**Raw HTML rendering has multiple trust boundaries:**
- Risk: Svelte `{@html ...}` is used for rendered docs, diffs, markdown previews, Mermaid output, comments, and highlighted search snippets.
- Files: `src/web/src/routes/docs/[id]/history/+page.svelte`, `src/web/src/routes/repos/[id]/commits/[sha]/+page.svelte`, `src/web/src/lib/components/docs/ReadOnlyRenderer.svelte`, `src/web/src/lib/components/docs/DocVersionTimeline.svelte`, `src/web/src/lib/components/docs/MermaidNode.svelte`, `src/web/src/lib/components/markdown/MarkdownPreview.svelte`, `src/web/src/lib/components/tasks/TaskComments.svelte`, `src/web/src/lib/components/search/SearchPage.svelte`, `src/docs/sanitize.ts`
- Current mitigation: Some paths sanitize through `DOMPurify` or `src/docs/sanitize.ts`; `ReadOnlyRenderer.svelte` explicitly uses `DOMPurify.sanitize()`.
- Recommendations: Require every `{@html}` source to pass through a named sanitizer adjacent to the renderer. Add a static test that blocks new `{@html}` usage without an allowlist entry.

**Settings connector tokens bypass credential storage:**
- Risk: Connector tokens are stored as plaintext in a module-level `Map`.
- Files: `src/web/src/routes/settings/connectors/+page.server.ts`, `src/db/entities/platform/Credential.ts`, `src/secrets/credentials-router.ts`
- Current mitigation: Route requires a session and feature flag.
- Recommendations: Store connector secrets only through `Credential`/credentials router, redact token fields from load data, and delete the in-memory `_configs` store.

**Subprocess helpers include shell invocation path:**
- Risk: `Bun.spawn(["sh", "-c", ...])` is used for command detection; unsafe expansion can become command injection if caller passes untrusted command names.
- Files: `src/utils/proc.ts`
- Current mitigation: Usage appears oriented around known local commands.
- Recommendations: Keep `commandExists()` inputs restricted to static tool names or replace shell detection with direct executable lookup.

**Session-bearing API routes depend on default-org fallbacks:**
- Risk: Several static OpenAPI/demo route modules use a fixed org ID, while real routes use authenticated org context.
- Files: `src/api/routes/tasks.ts`, `src/api/routes/docs.ts`, `src/api/routes/audit.ts`, `src/api/routes/notifications.ts`, `src/api/routes/sprints.ts`, `src/api/routes/saved-views.ts`
- Current mitigation: Comments mark these as static/spec or feature-gated route seeds.
- Recommendations: Keep fixed-org modules out of authenticated runtime mounts. Add tests that runtime `src/api/hono.ts` routes always derive org from auth/context.

## Performance Bottlenecks

**Search is PostgreSQL FTS-only on the critical query path:**
- Problem: Search always queries `search_documents` with `plainto_tsquery` and ranks via `ts_rank`.
- Files: `src/product-kernel/search.ts`, `src/product-kernel/db/migrations/0002_search.sql`, `src/product-kernel/db/migrations/0006_search_extended.sql`, `src/product-kernel/hybrid-scoring.test.ts`
- Cause: Hybrid scoring and embedding paths have todo tests; no runtime fallback is wired for degraded DB search.
- Improvement path: Finish hybrid search behind feature flags, keep deterministic FTS default, and add route-level degraded behavior for DB failures.

**Web DB singleton forks one long-lived EntityManager:**
- Problem: `initProductDb()` creates a singleton DB handle around `orm.em.fork()` and returns no-op close proxies to legacy callers.
- Files: `src/web/src/lib/server/db.ts`, `src/web/src/hooks.server.ts`
- Cause: Backward-compatible migration from per-request `openProductDb()` to singleton avoids repeated DB startup but keeps mutable EM state alive.
- Improvement path: Use singleton ORM/connection with request-scoped forked `EntityManager` for work units; keep `openProductDb()` as a temporary compatibility API only.

**Large UI components perform many client-side responsibilities in one component:**
- Problem: Task detail/comments components combine fetch, editor setup, nested rendering, optimistic state, and form actions.
- Files: `src/web/src/lib/components/tasks/TaskDetailPanel.svelte`, `src/web/src/lib/components/tasks/TaskComments.svelte`
- Cause: Feature growth is concentrated in single Svelte files.
- Improvement path: Extract data adapters and editor subcomponents under `src/web/src/lib/components/tasks/` with tests around helpers before moving markup.

## Fragile Areas

**Schema compatibility across ProductDb and MikroORM:**
- Files: `src/product-kernel/db/migrations/*.sql`, `src/db/migrations/*.ts`, `src/db/entities/orchestration/AgentRun.ts`, `src/web/src/routes/runs/+page.server.ts`, `src/web/src/routes/runs/[id]/+page.server.ts`
- Why fragile: Web routes query columns such as `sandbox_mode` and `iteration_count` while compatibility migrations and ORM migrations define overlapping schemas.
- Safe modification: Before changing agent run columns, update both migration systems or remove the compatibility path entirely. Run route tests for `/runs` and product-kernel migration tests.
- Test coverage: Route-level tests exist, but drift risk remains because two schema systems are accepted.

**Direct SQL string construction is widespread in services:**
- Files: `src/services/AutomationService.ts`, `src/services/SprintService.ts`, `src/services/TaskService.ts`, `src/server/trpc/routers/backup.ts`, `src/server/trpc/routers/json-import-export.ts`, `src/web/src/lib/product-queries.ts`, `src/web/src/lib/server/orm-helpers.ts`
- Why fragile: SQL shape, column names, and tenant predicates are manually maintained outside typed entity/repository APIs.
- Safe modification: Add or update repository methods first, then replace route/service SQL calls. Keep raw SQL only for batch/report/query shapes with explicit tests.
- Test coverage: Many route and service tests exist; no global boundary gate prevents new raw ProductDb queries.

**OpenAPI/spec placeholder routes sit near real runtime routes:**
- Files: `src/api/routes/tasks.ts`, `src/api/routes/sprints.ts`, `src/api/routes/saved-views.ts`, `src/api/hono.ts`
- Why fragile: Static specification routes can be mistaken for runtime service-backed routes because they live under the same `src/api/routes/` namespace.
- Safe modification: Keep comments and tests asserting `src/api/hono.ts` mounts real routes when deps exist. Prefer separate `src/api/spec-routes/` namespace for future static-only surfaces.
- Test coverage: `src/api/__tests__/phase08-api-parity.test.ts` checks for stub patterns, but fixed-org/static paths still require review discipline.

**Feature-gated pages can imply production readiness while using local stubs:**
- Files: `src/web/src/routes/settings/connectors/+page.server.ts`, `src/web/src/routes/settings/importers/+page.server.ts`, `src/web/src/routes/workspace/portfolio/+page.svelte`, `src/web/src/lib/components/tasks/FieldDependencyConfig.svelte`
- Why fragile: Flags turn on UI and actions even when persistence/integration is incomplete.
- Safe modification: Gate incomplete pages with explicit disabled states or route actions that fail with typed “not implemented” errors until service-backed.
- Test coverage: Page tests verify flag visibility; they do not prove durable external integration.

## Scaling Limits

**Local-first PGlite/Postgres duality sets practical single-node limits:**
- Current capacity: Local-first default uses PGlite under `FULCRUM_HOME`; PostgreSQL path is optional via `DATABASE_URL`.
- Limit: Concurrent multi-user write workloads, large search indexes, and collaboration updates need PostgreSQL/service boundaries rather than PGlite assumptions.
- Scaling path: Keep local PGlite for single-user/dev. Use PostgreSQL-backed `EntityManager`, request-scoped EM forks, and service/repository APIs for multi-user deployments.

**Context assembly uses approximate token counting:**
- Current capacity: Token budgets are estimated by whitespace/character heuristics.
- Limit: Large context bundles can exceed real model token budgets or underuse budget depending on tokenizer.
- Scaling path: Use deterministic tokenizer support per configured model while keeping current heuristic fallback.

**In-memory settings stores do not scale beyond one process:**
- Current capacity: Connector/importer settings/history are module-level arrays/maps.
- Limit: Restart loses data; multiple server processes diverge.
- Scaling path: Persist settings in credentials/config/sync-log tables and use service-backed load/actions.

## Dependencies at Risk

**Bun-specific APIs constrain web/server boundaries:**
- Risk: Files using Bun APIs cannot be imported safely by SvelteKit/Vite Node loaders.
- Impact: Web route code avoids direct `src/db/` imports and one migrations page remains unimplemented.
- Migration plan: Keep Bun-only code behind server adapters or CLI boundaries. Expose web functionality through tRPC/REST/service modules that Vite can load.

**MikroORM and product-kernel SQL migrations can diverge:**
- Risk: Runtime can pass against one migration path while failing against another.
- Impact: Route loads and API handlers can query missing columns in one database setup.
- Migration plan: Collapse to one authoritative schema path or add generated compatibility checks that compare entity metadata, SQL migrations, and route query columns.

**OpenTUI and compiled binary dependencies are platform-sensitive:**
- Risk: TUI/build code depends on platform-specific packages and binary compilation.
- Impact: Cross-platform build/test failures can block release even when core TypeScript passes.
- Migration plan: Keep TUI/platform checks in CI stages and isolate optional runtime imports behind capability checks.

## Missing Critical Features

**Durable connector settings and sync history:**
- Problem: Connector settings UI has no durable persistence or real sync execution.
- Blocks: Production use of Confluence, Notion, and GitHub Issues settings pages.

**Database migration web control plane:**
- Problem: Web migration page intentionally throws 501.
- Blocks: Admin UI parity for migration status/history/apply controls.

**Search resilience and hybrid scoring:**
- Problem: Search failover and hybrid scoring have todo tests or comments rather than runtime implementation.
- Blocks: Reliable search UX during DB/index failures and relevance improvements when embeddings are enabled.

**Authenticated collaboration server default:**
- Problem: Default Yjs server auth accepts any non-empty bearer token.
- Blocks: Safe realtime collaboration deployment without custom validator injection.

## Test Coverage Gaps

**Todo tests for context and search scoring:**
- What's not tested: Context bundle budgeting behavior and hybrid search scoring.
- Files: `src/product-kernel/context-bundle.test.ts`, `src/product-kernel/hybrid-scoring.test.ts`
- Risk: Context assembly and search relevance can regress without failing CI.
- Priority: High

**Skipped isolated E2E routes hide SSR/integration failures:**
- What's not tested: Several route tests skip on 500/auth/service setup failures.
- Files: `src/web/tests/e2e/phase07-repos-artifacts-notifications.spec.ts`, `src/web/tests/e2e/phase08-surface-delivery.spec.ts`, `src/web/tests/e2e/phase09-accessibility.spec.ts`, `src/web/tests/a11y/phase08-routes.test.ts`, `src/web/tests/a11y/phase09-cross-cutting.test.ts`
- Risk: Broken SSR routes can pass CI when skipped under isolated setup.
- Priority: High

**Editor/rendering placeholder tests remain todo:**
- What's not tested: Editor content JSON losslessness, KaTeX rendering, Mermaid rendering, docs tree reordering, search facets, command palette behavior.
- Files: `src/docs/editor.test.ts`, `src/web/src/lib/editor/katex.test.ts`, `src/web/src/lib/editor/mermaid.test.ts`, `src/web/src/lib/docs/tree.test.ts`, `src/web/src/lib/components/search/search.test.ts`, `src/web/src/lib/components/command-palette/palette.test.ts`
- Risk: Rich document and navigation features can regress without executable assertions.
- Priority: Medium

**No global gate for new placeholder routers or in-memory production stores:**
- What's not tested: New `crudRouter()` mounts, `query(() => [])`, `query(() => null)`, and module-level `_configs`/`_history` stores in runtime code.
- Files: `src/trpc/routers/stub-helpers.ts`, `src/web/src/routes/settings/connectors/+page.server.ts`, `src/web/src/routes/settings/importers/+page.server.ts`
- Risk: Future phases can add apparently successful no-op routes.
- Priority: High

---

*Concerns audit: 2026-05-06*
