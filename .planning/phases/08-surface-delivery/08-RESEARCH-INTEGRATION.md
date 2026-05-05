# Phase 08 Research: Codebase Integration Map

**Researched:** 2026-05-06  
**Goal:** Map Phase 08 decisions to exact Fulcrum files and event/data flows.

## Phase Boundary From Roadmap

Phase 08 delivers CLI fully wired, TUI rewritten on OpenTUI, Web complete, and API surface validated. Requirements: CLI-01..07, TUI-01..08, WEB-01..11, API-01..05. Depends on Phases 5-7.

## Reusable Assets

### CLI

- `src/cli/index.ts` — top-level command dispatch. Current dispatch covers `init`, `agents`, `auth`, `flags`, `routing`, `repos`, `docs`, `db`, `symphony`, `runs`, `notify`, `audit`, `webhooks`, `connectors`, `web`, `tui`, `inference`, `help`.
- `src/cli/generated-domains.ts` — generated domain inventory includes many domains not wired at top level: `agent_runs`, `artifacts`, `backup`, `context`, `credentials`, `customFieldDefs`, `custom_fields`, `doc_comments`, `doc_links`, `doc_versions`, `doctor`, `errorLogs`, `fulcrum_skills`, `health`, `invitations`, `memories`, `memory`, `notifications`, `orchestration`, `orgs`, `projects`, `repo_branches`, `repo_commits`, `reports`, `saved_views`, `search`, `sprints`, `taskCustomFields`, `tasks`, `telemetry`, `theme`.
- `src/cli/commands/pillar14-generated.ts` — real-ish implementations for only `runs`, `notify`, `audit`, `webhooks`, `connectors`, `flags`.
- `src/cli/local-caller.ts` and `src/trpc/router.ts` — in-process tRPC path to reuse for all CLI wiring.
- `src/cli/completion.ts` — existing completion helper; should become user-facing `fulcrum completion --shell ...`.
- Existing domain commands: `src/cli/commands/docs.ts`, `src/cli/commands/memory.ts`, `src/cli/commands/search.ts`, `src/cli/commands/repos.ts`, `src/cli/commands/report.ts`, `src/cli/sprints.ts`, `src/cli/notify.ts`, `src/cli/artifacts.ts`.

### TUI

- `src/tui/index.ts` — real current TUI app. Header explicitly says OpenTUI target not installed yet; uses ANSI renderer with headless `FakeTTY`.
- `src/tui/app.ts` — older repo-demo app with stubs and `(diff loading not wired yet)`. Requirement TUI-08 says remove dead `app.ts`.
- `src/tui/router.ts`, `src/tui/renderer.ts`, `src/tui/testing/fake-tty.ts` — current testable TUI foundation.
- `src/tui/screens/` contains screens for tasks, docs, memory, search, repos, artifacts, notifications, runs, routing, skills, settings, doctor, reports.
- `src/tui/components/AsciiChart.ts` and `asciichart@1.5.25` support report parity.

### Web

- `src/web/src/routes/` already contains broad route coverage: projects/tasks/board/list/calendar/gantt/reports, docs editor/history, memory, search, repos/detail/branches/commits/files, artifacts/detail/download, inbox, runs, routing, settings/API.
- `src/web/tests/e2e/` already has Phase 5, 6, 7 e2e specs plus `user-journey.spec.ts`, `search-e2e.spec.ts`, `artifacts-e2e.spec.ts`, `auth-login.spec.ts`.
- `src/web/tests/a11y/` has route/a11y coverage but not the full 14 journey WEB-07 list.
- `src/web/src/routes/api/v1/openapi.json/+server.ts` and `src/web/src/routes/api/v1/+server.ts` expose public API through web.

### API/tRPC

- `src/api/hono.ts` is the single public API factory. It currently documents `/openapi.json` inside the mounted API and `/api/openapi.json` on parent router, while roadmap wants `/api/v1/openapi.json`.
- `src/api/hono.ts` still imports stub routes for docs/search/runs/notifications/artifacts/memory/saved-views and real kernel routes for tasks/sprints/reports/notifications/audit when `deps` exists.
- `src/api/routes/tasks.ts`, `docs.ts`, `sprints.ts`, `saved-views.ts`, `notifications.ts`, `artifacts.ts` retain in-memory/stub comments.
- `src/trpc/router.ts` has root router and explicit comment "No inline stub helpers or duplicate aliases", but still mounts "extracted stub routers" for several domains.
- `src/trpc/schemas/*` hold Zod schemas; API-01 means every procedure should have validation tests using these schemas.

## Event Producer/Consumer Map

| Producer | Event/data | Consumers in Phase 08 |
|---|---|---|
| CLI command | tRPC input from argv | `appRouter` procedures through `createLocalCaller`; tests assert JSON output. |
| TUI keypress/screen action | Semantic action + tRPC input | Same `TuiCaller` shape in `src/tui/index.ts`; screen refresh; live run monitor subscribes to EventBus. |
| Web route action/load | tRPC calls or SvelteKit API routes | Existing route server loads; e2e journey tests prove render path. |
| REST API request | Hono route + Zod validation | Service/tRPC/repository path; OpenAPI doc generation; rate limiter. |
| Domain mutation from any surface | MikroORM repository writes + EventBus/domain events | Web refresh, TUI live screens, CLI watch/JSONL, notification feed. |
| `runsSubscriptions`/`notifySubscriptions`/`orchestrationSubscriptions` | EventBus subscription stream | TUI live monitor; CLI watch/follow; Web live badges. |

## Files That Must Not Break

- `src/cli/index.ts` — binary entry and dispatch for existing foundation commands.
- `src/index.ts` — package binary entry imports CLI run path.
- `src/trpc/router.ts` and `src/trpc/context.ts` — shared surface contract.
- `src/api/hono.ts` — single API surface and OpenAPI route.
- `src/web/src/hooks.server.ts` — auth + tRPC mount.
- `src/tui/index.ts`, `src/tui/testing/fake-tty.ts`, `src/tui/renderer.ts` — existing TUI tests depend on headless renderer semantics.
- `scripts/ci.ts` and `package.json` scripts — final verification path.
- Phase 5-7 e2e specs in `src/web/tests/e2e/phase05-*`, `phase06-*`, `phase07-*` — parity cannot regress previous pillars.

## Cross-Phase Dependencies

- Phase 5: tasks, reports, sprints, custom fields, saved views, command palette, chart libraries.
- Phase 6: docs, memory, search, Orama/Cmd+K, document editor.
- Phase 7: repos, artifacts, notifications, webhook debug, delivery settings.
- Phase 2/1: tRPC permission gate, single API direction, no raw SQL expansion.

## Recommended Plan Shape

1. **Surface inventory/gates:** generate parity matrix from `appRouter`, CLI domains, TUI screens, REST routes, Web routes. Tests fail for missing domain/verb/JSON/OpenAPI parity.
2. **CLI parity:** wire every domain command through tRPC/local caller; add `--json` everywhere; add completion command; remove generated "not wired" paths.
3. **API parity:** replace REST stub routes with tRPC/service-backed routes; align OpenAPI served path; add Zod validation tests; add rate limiter.
4. **TUI renderer gate:** install OpenTUI packages, prove launch/render/input tests; then adapter rewrite. If gate fails, stop with documented fallback decision instead of silently continuing ANSI.
5. **TUI domain parity:** connect screens through in-process tRPC caller; live run monitor through EventBus/subscription procedures; remove `src/tui/app.ts`.
6. **Web completion/UAT:** prove shadcn-svelte and all Phase 5-7 routes render; add 14 Playwright journeys; verify dark mode and collab flag.
7. **Final hardening:** binary macOS/Linux build, `bun run ci`, graphify update after code changes.

## Open Risks

- OpenTUI native Zig library may add build/runtime fragility for compiled Bun binary. The renderer gate must happen before large rewrite.
- REST API currently has duplicate/stub route layers. API plan must consolidate rather than adding another bridge.
- CLI command names use both singular/plural and generated snake_case. Phase 08 must choose stable aliases while keeping backward-compatible wrappers where existing docs/tests expect them.
- Full API-01 "every tRPC procedure" test coverage is broad. Planning must split by router groups or generate schema-validation smoke tests.
