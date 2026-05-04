# Test Gaps — Integration & E2E

Audit date: 2026-05-04. Covers all pillars (P1-P17).

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

- [ ] `artifacts` router — no tRPC integration test (unit test at `src/trpc/routers/artifacts.test.ts` exists, but no `tests/trpc/artifacts.test.ts` with real DB)
- [ ] `documents` router — no tRPC integration test (tRPC docs-crud covers some, but `documents` router has its own procedures)
- [ ] `memories` router — no tRPC integration test for memory CRUD procedures
- [ ] `orchestration` router — no tRPC integration test for workflow/queue management procedures
- [ ] `runs` router — no tRPC integration test for run CRUD, status transitions, log streaming
- [ ] `search` router — no tRPC integration test for search-across-entities procedure
- [ ] REST API v1 (`/api/v1/*`) — unit test exists but no integration test against real server with auth headers
- [ ] Product-kernel PGlite queries — `openProductDb` + `runMigrations` not tested with real PGlite in web context (only product-kernel unit tests)

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
