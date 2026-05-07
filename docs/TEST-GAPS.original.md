# Test Gaps — Integration & E2E

Audit date: 2026-05-04. Updated after live dev-server debugging session.
Covers all pillars (P1-P17).

## Infrastructure (CI-blocking — highest priority)

These gaps caused actual production-path failures found during manual testing:

- [ ] **Migration compatibility** — no test runs all `src/product-kernel/db/migrations/*.sql` files through PGlite in alphabetical order and verifies zero errors. Today's bug: two migrations created the same table with different columns; `CREATE TABLE IF NOT EXISTS` skipped the second, then `CREATE INDEX` on missing column crashed. Would catch: duplicate table definitions, ALTER TABLE PGlite incompatibilities, column naming conflicts across migration files.
- [ ] **Dev server smoke** — no test starts `vite dev`, waits for ready, hits `/` and `/doctor` with curl, asserts HTTP 200. Today's bugs: SSR SyntaxError from eager tRPC import, exported non-SvelteKit symbols causing 500s, missing default org. Would catch: any SSR import failure, any route load crash.
- [ ] **SvelteKit export validation** — no test scans `+page.server.ts` files for exports not in the SvelteKit allowed set (`load`, `actions`, `prerender`, `csr`, `ssr`, `trailingSlash`, `config`, `entries`, `_`-prefixed). Today's bug: 12 routes exported helper functions/constants → SvelteKit rejected them as invalid → 500.
- [ ] **Auth bypass in dev mode** — no test verifies that routes are accessible without login when `FULCRUM_REQUIRE_AUTH` is unset, and that they redirect to `/auth/login` when it IS set. Today's bug: all routes required login in dev mode.
- [ ] **Default org seeding** — no test verifies that `openProductDb()` creates a default org if none exists. Today's bug: fresh PGlite DB had no org → every page.server.ts load function threw "default org not found".
- [ ] **Feature flag gating consistency** — no test verifies that every `FULCRUM_FEATURES=X` flag correctly hides/shows its gated route. Gate review found `/api/openapi.json` was exposed without the `public-api` flag check.

## TUI (integration tests with FakeTTY needed)

- [ ] **Screen render smoke** — no test renders every TUI screen with FakeTTY and asserts no crash. Many screens have unchecked acceptance criteria.
- [ ] **Keyboard navigation round-trip** — no test exercises Tab/arrow/Enter across all screens in sequence. Gate review found: sprint close overlay has no keyboard handler (F04), doc history 'h' key is dead (F03), memory browser 'g' vs 'G' mismatch (F02).
- [ ] **Bulk operations** — no test for bulk status update → selection cleared → re-render. Gate review found selected set leaked after bulk update (F01).
- [ ] **Feature flag screens** — no test verifies gated TUI screens (i18n, embeddings, desktop, experiments) show "Feature disabled" banner when flag OFF.

## Inference Sidecar (integration tests needed)

- [ ] **Sidecar lifecycle** — no test starts/stops the inference sidecar and verifies health endpoint responds.
- [ ] **Model pull progress** — no test verifies pullModel yields real-time progress events (gate review found it buffers all events, CF-02).
- [ ] **Backend switching** — no test switches between embedded/ollama/lm-studio/openai-compatible backends and verifies routing.
- [ ] **Feature flag bypass** — no test verifies OpenAI-compatible backend respects `external-llm-provider` flag (gate review found it was bypassed, CF-01 — fixed).

## Web Routes (Playwright needed)

Existing e2e: smoke, user-journey, auth-login, search, artifacts, routing-settings, tiptap-baseline, perf-budgets.

- [ ] `/doctor` — no e2e verifying the health dashboard renders all 17 subsystem rows without auth
- [ ] `/inbox` — no e2e for notification list, mark-all-read action, activity feed pagination
- [ ] `/audit` — no e2e for audit log filtering (actor, kind, date range), pagination
- [ ] `/agents` — no e2e for agent profile list, test-profile action, dispatch-run flow
- [ ] `/agents/[name]` — no unit test (page.server.test.ts missing) and no e2e
- [ ] `/orchestration` — no e2e for run queue dashboard, cancel/retry actions
- [ ] `/inference` — no e2e for inference sidecar dashboard, start/stop actions, backend config
- [ ] `/memory` — no unit test and no e2e for memory list/detail views
- [ ] `/memory/[id]` — no unit test and no e2e
- [ ] `/docs/global` — no unit test and no e2e for global docs listing
- [ ] `/docs/[id]/edit` — no e2e for Tiptap editor save/cancel round-trip with real DB
- [ ] `/docs/[id]/history` — no e2e for version history diff viewer
- [ ] `/docs/new` — no e2e for new-doc creation flow end-to-end
- [ ] `/projects/new` — no unit test and no e2e for project creation wizard
- [ ] `/projects/[id]/list` — no unit test and no e2e for list view
- [ ] `/projects/[id]/table` — no unit test and no e2e for table view
- [ ] `/projects/[id]/routing` — no unit test and no e2e for routing rules UI
- [ ] `/projects/[id]/runs` — no unit test and no e2e for project-scoped runs
- [ ] `/projects/[id]/runs/[runId]` — no unit test and no e2e for run detail within project
- [ ] `/projects/[id]/settings/memory` — no unit test and no e2e
- [ ] `/projects/[id]/settings/templates` — no unit test and no e2e
- [ ] `/settings/database/migrations` — no unit test and no e2e for migration status viewer
- [ ] `/settings/experiments` — no unit test and no e2e
- [ ] `/settings/flags` — no unit test (vitest test exists but no page.server.test.ts)
- [ ] `/settings/i18n` — no unit test and no e2e for locale switching
- [ ] `/settings/integrations/linear` — no unit test and no e2e for Linear connector config
- [ ] `/settings/orchestration/workflows/[id]` — no unit test and no e2e for workflow editor
- [ ] `/settings/templates` — no unit test and no e2e for task templates management
- [ ] `/boards` — no e2e for standalone boards view (unit tests exist)
- [ ] `/runs/[id]/artifacts` — no e2e for run-scoped artifact viewer
- [ ] `/settings/connectors` — no e2e for connector config + test-connection + sync flow
- [ ] `/settings/importers` — no e2e for import wizard (CSV upload, preflight, confirm)
- [ ] `/settings/webhooks` — no e2e for webhook subscription CRUD + delivery log
- [ ] `/settings/billing` — no e2e (feature-gated, but no test for gated 404 behavior)
- [ ] `/settings/api` — no e2e (feature-gated, but no test for gated 404 behavior)
- [ ] `/settings/secrets` — no e2e for secret management UI
- [ ] `/settings/skills` — no e2e for skill browser/install UI
- [ ] `/auth/invite/[token]` — no unit test and no e2e for invite acceptance flow

## API/tRPC (Integration tests with real DB needed)

Existing tRPC tests: audit, auth, backup, credentials, customFields, docs-*, errorLogs, flags, json-import-export, memory, notifications, orgs, reports-burndown, repos, router, routing, schemas, sprints-crud, stubs, tasks-crud, telemetry, theme, webhooks.

- [ ] `artifacts` router — no tRPC integration test (unit test at `apps/server/src/trpc/routers/artifacts.test.ts` exists, but no `tests/trpc/artifacts.test.ts` with real DB)
- [ ] `documents` router — no tRPC integration test (tRPC docs-crud covers some, but `documents` router has its own procedures)
- [ ] `memories` router — no tRPC integration test for memory CRUD procedures
- [ ] `orchestration` router — no tRPC integration test for workflow/queue management procedures
- [ ] `runs` router — no tRPC integration test for run CRUD, status transitions, log streaming
- [ ] `search` router — no tRPC integration test for search-across-entities procedure
- [ ] REST API v1 (`/api/v1/*`) — unit test exists but no integration test against real server with auth headers
- [ ] Product-kernel PGlite queries — `openProductDb` + `runMigrations` not tested with real PGlite in web context (only product-kernel unit tests)
- [ ] `sprints.close` — no integration test for `next-sprint` disposition (gate review found it was a no-op, F2 — fixed)
- [ ] `sprints.close` event — no test verifies `metrics_snapshot.id` is non-empty in the persisted event (gate review found empty UUID, F1 — fixed)
- [ ] Hybrid search params — no integration test with `embedQuery` provided to verify FTS WHERE clause params match (gate review found params/SQL mismatch, F1 — fixed)
- [ ] `docs.tree` / `docs.move` — procedures missing entirely from docs router (gate review C, spec gap — not yet implemented)
- [ ] `docs.create` template application — no test verifies org-default template body is applied on create (gate review C, spec gap)
- [ ] Webhook retry timing — no test verifies retries are separated by actual backoff delays (gate review found all 5 attempts fire synchronously, F-003)

## CLI (Integration tests with real commands needed)

Existing CLI tests: artifacts, auth, build, codegen, completion, context, docs, entrypoint, flags, init, memory, repos, routing, runs-notify-audit-webhooks, search.

- [ ] `fulcrum agent` — agent lifecycle (register, list, remove) not integration-tested
- [ ] `fulcrum backup` / `fulcrum restore` — interactive backup+restore round-trip not tested
- [ ] `fulcrum compress` — no test
- [ ] `fulcrum component` — no test for component scaffold generation
- [ ] `fulcrum connectors` — no integration test with real connector endpoints
- [ ] `fulcrum doctor` — only unit tests; no integration test verifying all subsystems checked against live system
- [ ] `fulcrum export` / `fulcrum import` — no end-to-end round-trip test (export then import, verify data integrity)
- [ ] `fulcrum inference start/stop` — no integration test for sidecar lifecycle
- [ ] `fulcrum install` / `fulcrum uninstall` — no integration test for skill/plugin install round-trip
- [ ] `fulcrum marketplace` — no integration test
- [ ] `fulcrum mcp` / `fulcrum mcp-cmd` — no integration test for MCP server lifecycle
- [ ] `fulcrum product` — no integration test for product-kernel CLI surface
- [ ] `fulcrum skills` — no integration test
- [ ] `fulcrum sprints` — no integration test for sprint CRUD via CLI

## Cross-surface (E2E full-stack needed)

Only one cross-surface e2e exists: `tests/e2e/notifications-audit-pipeline.test.ts`.

- [ ] Task lifecycle: CLI create task -> web board shows it -> agent picks it up -> run completes -> web shows run result -> notification appears in inbox
- [ ] Doc collaboration: CLI creates doc -> web editor edits -> version history shows both edits -> search finds doc content
- [ ] Project setup: web creates project -> CLI lists it -> web configures statuses/fields -> board renders with custom columns
- [ ] Agent dispatch: web dispatches agent run -> orchestration queues it -> run status updates in real-time on web -> artifacts appear in run detail
- [ ] Backup/restore: CLI backup -> delete data -> CLI restore -> web verifies all data intact
- [ ] Import flow: web uploads CSV via importer -> tasks appear in project board -> search indexes them
- [ ] Auth flow: signup (if saas-auth) -> login -> session persists across web routes -> logout -> routes redirect to login
- [ ] Connector sync: settings configures Linear/GitHub connector -> sync triggered -> tasks appear in project -> audit log records sync event
- [ ] Memory pipeline: agent run produces memory -> memory appears in /memory -> context preview includes it -> next agent run retrieves it
- [ ] Webhook delivery: settings creates webhook subscription -> event triggers -> webhook delivered -> delivery log shows success/failure
- [ ] Feature flag gating: enable flag -> route/feature accessible -> disable flag -> route returns 404/hidden
- [ ] Multi-project routing: configure routing rules -> incoming task auto-assigned to correct project based on rules
- [ ] Sprint planning: create sprint -> assign tasks -> sprint board shows capacity -> complete sprint -> burndown report accurate
- [ ] Repo integration: register repo -> commits sync -> file browser works -> commit detail shows diff -> linked tasks cross-referenced

## Gate Review Findings (bugs found without test coverage)

Bugs found by gate reviewers that had zero test coverage. Each should have a regression test:

| ID | File | Bug | Fixed? |
|----|------|-----|--------|
| CF-01 | `src/inference/backends/client.ts:97` | OpenAI backend flag bypass — `flagEnabled` always `true` | ✅ |
| CF-02 | `src/inference/client.ts:222` | pullModel buffers all progress before yielding | architectural |
| CF-03 | `src/orchestration/symphony/dispatch.ts:95` | Double state transition after claimRun | open |
| CF-04 | `src/orchestration/sandbox-runner.ts:310` | Token cap vs COMPLETE ordering ambiguity | open |
| F1-B | `apps/server/src/runtime/trpc/routers/sprints.ts:294` | Sprint metrics ID empty before flush | ✅ |
| F2-B | `apps/server/src/runtime/trpc/routers/sprints.ts:268` | next-sprint disposition no-op | ✅ |
| F1-D | `src/search/query.ts:360` | Hybrid search params/SQL mismatch | ✅ |
| F-001 | `src/product-kernel/db/migrations/0004_notifications.sql` | PGlite ALTER TABLE incompatibility | ✅ |
| F-002 | `apps/server/src/api/hono.ts:94` | /api/openapi.json unguarded by flag | ✅ |
| F01 | `apps/tui/src/screens/task-list.ts:142` | Bulk selection not cleared | ✅ |
| F03 | `apps/tui/src/screens/docs-reader-editor.ts:66` | Doc history 'h' key dead | ✅ |
| F04 | `apps/tui/src/screens/sprints.ts:201` | Sprint close overlay no keyboard handler | ✅ |
| F06 | `apps/web/src/routes/settings/secrets/+page.server.ts:46` | Misleading sha256 prefix on base64 | ✅ |
