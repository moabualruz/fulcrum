# Test Gaps — Fixture, Integration & E2E

Audit: 2026-05-04. Updated after live dev-server debug session.
Covers all pillars (P1-P17).

## Infrastructure (CI-blocking — highest priority)

Gaps caused actual production-path failures found during manual testing:

- [ ] **Migration compatibility** — no test runs all `src/product-kernel/db/migrations/*.sql` through PGlite in alpha order, verifies zero errors. Bug: two migrations created same table w/ different columns; `CREATE TABLE IF NOT EXISTS` skipped second, then `CREATE INDEX` on missing column crashed. Catches: duplicate table defs, ALTER TABLE PGlite incompatibilities, column naming conflicts across migration files.
- [ ] **Dev server smoke** — no test starts `vite dev`, waits ready, hits `/` and `/doctor` w/ curl, asserts HTTP 200. Bugs: SSR SyntaxError from eager tRPC import, exported non-SvelteKit symbols → 500s, missing default org. Catches: SSR import failure, route load crash.
- [ ] **SvelteKit export validation** — no test scans `+page.server.ts` for exports not in SvelteKit allowed set (`load`, `actions`, `prerender`, `csr`, `ssr`, `trailingSlash`, `config`, `entries`, `_`-prefixed). Bug: 12 routes exported helper fns/constants → SvelteKit rejected → 500.
- [ ] **Auth bypass in dev mode** — no test verifies routes accessible w/o login when `FULCRUM_REQUIRE_AUTH` unset, redirect to `/auth/login` when set. Bug: all routes required login in dev mode.
- [ ] **Default org seeding** — no test verifies `openProductDb()` creates default org if none exists. Bug: fresh PGlite DB had no org → every page.server.ts load fn threw "default org not found".
- [ ] **Feature flag gating consistency** — no test verifies every `FULCRUM_FEATURES=X` flag correctly hides/shows gated route. Gate review found `/api/openapi.json` exposed w/o `public-api` flag check.

## TUI (integration tests with FakeTTY needed)

- [ ] **Screen render smoke** — no test renders every TUI screen w/ FakeTTY, asserts no crash. Many screens have unchecked acceptance criteria.
- [ ] **Keyboard navigation round-trip** — no test exercises Tab/arrow/Enter across all screens in sequence. Gate review found: sprint close overlay has no keyboard handler (F04), doc history 'h' key dead (F03), memory browser 'g' vs 'G' mismatch (F02).
- [ ] **Bulk operations** — no test for bulk status update → selection cleared → re-render. Gate review found selected set leaked after bulk update (F01).
- [ ] **Feature flag screens** — no test verifies gated TUI screens (i18n, embeddings, desktop, experiments) show "Feature disabled" banner when flag OFF.

## Inference Sidecar (integration tests needed)

- [ ] **Sidecar lifecycle** — no test starts/stops inference sidecar, verifies health endpoint responds.
- [ ] **Model pull progress** — no test verifies pullModel yields real-time progress events (gate review found it buffers all events, CF-02).
- [ ] **Backend switching** — no test switches between embedded/ollama/lm-studio/openai-compatible backends, verifies routing.
- [ ] **Feature flag bypass** — no test verifies OpenAI-compatible backend respects `external-llm-provider` flag (gate review found bypass, CF-01 — fixed).

## Web Routes (Playwright needed)

Existing e2e: smoke, user-journey, auth-login, search, artifacts, routing-settings, tiptap-baseline, perf-budgets.

- [ ] `/doctor` — no e2e verifying health dashboard renders all 17 subsystem rows w/o auth
- [ ] `/inbox` — no e2e for notification list, mark-all-read, activity feed pagination
- [ ] `/audit` — no e2e for audit log filtering (actor, kind, date range), pagination
- [ ] `/agents` — no e2e for agent profile list, test-profile, dispatch-run flow
- [ ] `/agents/[name]` — no unit test (page.server.test.ts missing), no e2e
- [ ] `/orchestration` — no e2e for run queue dashboard, cancel/retry actions
- [ ] `/inference` — no e2e for inference sidecar dashboard, start/stop, backend config
- [ ] `/memory` — no unit test, no e2e for memory list/detail views
- [ ] `/memory/[id]` — no unit test, no e2e
- [ ] `/docs/global` — no unit test, no e2e for global docs listing
- [ ] `/docs/[id]/edit` — no e2e for Tiptap editor save/cancel round-trip through real workflow + seeded DB
- [ ] `/docs/[id]/history` — no e2e for version history diff viewer
- [ ] `/docs/new` — no e2e for new-doc creation flow end-to-end
- [ ] `/projects/new` — no unit test, no e2e for project creation wizard
- [ ] `/projects/[id]/list` — no unit test, no e2e for list view
- [ ] `/projects/[id]/table` — no unit test, no e2e for table view
- [ ] `/projects/[id]/routing` — no unit test, no e2e for routing rules UI
- [ ] `/projects/[id]/runs` — no unit test, no e2e for project-scoped runs
- [ ] `/projects/[id]/runs/[runId]` — no unit test, no e2e for run detail within project
- [ ] `/projects/[id]/settings/memory` — no unit test, no e2e
- [ ] `/projects/[id]/settings/templates` — no unit test, no e2e
- [ ] `/settings/database/migrations` — no unit test, no e2e for migration status viewer
- [ ] `/settings/experiments` — no unit test, no e2e
- [ ] `/settings/flags` — no unit test (vitest test exists but no page.server.test.ts)
- [ ] `/settings/i18n` — no unit test, no e2e for locale switching
- [ ] `/settings/integrations/linear` — no unit test, no e2e for Linear connector config
- [ ] `/settings/orchestration/workflows/[id]` — no unit test, no e2e for workflow editor
- [ ] `/settings/templates` — no unit test, no e2e for task templates management
- [ ] `/boards` — no e2e for standalone boards view (unit tests exist)
- [ ] `/runs/[id]/artifacts` — no e2e for run-scoped artifact viewer
- [ ] `/settings/connectors` — no e2e for connector config + test-connection + sync flow
- [ ] `/settings/importers` — no e2e for import wizard (CSV upload, preflight, confirm)
- [ ] `/settings/webhooks` — no e2e for webhook subscription CRUD + delivery log
- [ ] `/settings/billing` — no e2e (feature-gated, no test for gated 404 behavior)
- [ ] `/settings/api` — no e2e (feature-gated, no test for gated 404 behavior)
- [ ] `/settings/secrets` — no e2e for secret management UI
- [ ] `/settings/skills` — no e2e for skill browser/install UI
- [ ] `/auth/invite/[token]` — no unit test, no e2e for invite acceptance flow

## API/tRPC (Fixture-backed integration by default; DB-backed only for persistence contracts)

Existing tRPC tests: audit, auth, backup, credentials, customFields, docs-*, errorLogs, flags, json-import-export, memory, notifications, orgs, reports-burndown, repos, router, routing, schemas, sprints-crud, stubs, tasks-crud, telemetry, theme, webhooks.

- [ ] `artifacts` router — no tRPC integration test (unit test at `apps/server/src/trpc/routers/artifacts.test.ts` exists; add fixture-backed router coverage first, DB-backed coverage only for persistence behavior)
- [ ] `documents` router — no tRPC integration test (`documents` router has own procedures beyond docs-crud coverage)
- [ ] `memories` router — no tRPC integration test for memory CRUD procedures
- [ ] `orchestration` router — no tRPC integration test for workflow/queue management procedures
- [ ] `runs` router — no tRPC integration test for run CRUD, status transitions, log streaming
- [ ] `search` router — no tRPC integration test for search-across-entities procedure
- [ ] REST API v1 (`/api/v1/*`) — unit test exists, no integration test against real server w/ auth headers
- [ ] Product-kernel PGlite queries — `openProductDb` + `runMigrations` not tested w/ real PGlite in web-context integration (only product-kernel component tests)
- [ ] `sprints.close` — no integration test for `next-sprint` disposition (gate review: was no-op, F2 — fixed)
- [ ] `sprints.close` event — no test verifies `metrics_snapshot.id` non-empty in persisted event (gate review: empty UUID, F1 — fixed)
- [ ] Hybrid search params — no integration test w/ `embedQuery` provided verifying FTS WHERE clause params match (gate review: params/SQL mismatch, F1 — fixed)
- [ ] `docs.tree` / `docs.move` — procedures missing entirely from docs router (gate review C, spec gap — not yet implemented)
- [ ] `docs.create` template application — no test verifies org-default template body applied on create (gate review C, spec gap)
- [ ] Webhook retry timing — no test verifies retries separated by actual backoff delays (gate review: all 5 attempts fire synchronously, F-003)

## CLI (Integration tests with real commands needed)

Existing CLI tests: artifacts, auth, build, codegen, completion, context, docs, entrypoint, flags, init, memory, repos, routing, runs-notify-audit-webhooks, search.

- [ ] `fulcrum agent` — agent lifecycle (register, list, remove) not integration-tested
- [ ] `fulcrum backup` / `fulcrum restore` — interactive backup+restore round-trip not tested
- [ ] `fulcrum compress` — no test
- [ ] `fulcrum component` — no test for component scaffold generation
- [ ] `fulcrum connectors` — no integration test w/ real connector endpoints
- [ ] `fulcrum doctor` — only unit tests; no integration test verifying all subsystems checked against live system
- [ ] `fulcrum export` / `fulcrum import` — no end-to-end round-trip test (export → import, verify data integrity)
- [ ] `fulcrum inference start/stop` — no integration test for sidecar lifecycle
- [ ] `fulcrum install` / `fulcrum uninstall` — no integration test for skill/plugin install round-trip
- [ ] `fulcrum marketplace` — no integration test
- [ ] `fulcrum mcp` / `fulcrum mcp-cmd` — no integration test for MCP server lifecycle
- [ ] `fulcrum product` — no integration test for product-kernel CLI surface
- [ ] `fulcrum skills` — no integration test
- [ ] `fulcrum sprints` — no integration test for sprint CRUD via CLI

## Cross-surface (E2E full-stack needed)

Only one cross-surface e2e exists: `tests/e2e/notifications-audit-pipeline.test.ts`.

- [ ] Task lifecycle: CLI create task → web board shows it → agent picks up → run completes → web shows result → notification in inbox
- [ ] Doc collaboration: CLI creates doc → web editor edits → version history shows both → search finds content
- [ ] Project setup: web creates project → CLI lists it → web configures statuses/fields → board renders w/ custom columns
- [ ] Agent dispatch: web dispatches agent run → orchestration queues → run status updates real-time on web → artifacts appear in run detail
- [ ] Backup/restore: CLI backup → delete data → CLI restore → web verifies all data intact
- [ ] Import flow: web uploads CSV via importer → tasks appear in project board → search indexes them
- [ ] Auth flow: signup (if saas-auth) → login → session persists across web routes → logout → routes redirect to login
- [ ] Connector sync: settings configures Linear/GitHub connector → sync triggered → tasks appear in project → audit log records sync event
- [ ] Memory pipeline: agent run produces memory → appears in /memory → context preview includes it → next run retrieves it
- [ ] Webhook delivery: settings creates webhook subscription → event triggers → webhook delivered → delivery log shows success/failure
- [ ] Feature flag gating: enable flag → route/feature accessible → disable flag → route returns 404/hidden
- [ ] Multi-project routing: configure routing rules → incoming task auto-assigned to correct project based on rules
- [ ] Sprint planning: create sprint → assign tasks → sprint board shows capacity → complete sprint → burndown report accurate
- [ ] Repo integration: register repo → commits sync → file browser works → commit detail shows diff → linked tasks cross-referenced

## Gate Review Findings (bugs found without test coverage)

Bugs found by gate reviewers w/ zero test coverage. Each should have regression test:

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
