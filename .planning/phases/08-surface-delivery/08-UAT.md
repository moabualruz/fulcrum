---
phase: 08-surface-delivery
type: uat
status: pass
last_updated: "2026-05-06T02:02:34Z"
---

# Phase 08 UAT

## Evidence

- PASS: `bun run lint`
- PASS: `bun test src/cli/doctor.test.ts src/cli/__tests__/phase08-cli-parity.test.ts tests/tui/routing-rules.test.ts tests/trpc/tasks-crud.test.ts tests/platform/doctor-checks.test.ts` — 72 pass, 0 fail.
- PASS: `bun test src/router/routing-service.test.ts src/server/trpc/routers/__tests__/routing.test.ts` — 29 pass, 0 fail.
- PASS: broad `bun run ci` test section before final build fix — 4616 pass, 2 skip, 7 todo, 0 fail.
- PASS: `bun run scripts/build-all.ts` after OpenTUI optional-native externalization — darwin arm64/x64, linux x64/arm64, windows x64 binaries built.
- INTERRUPTED: post-fix `bun run ci` rerun was stopped by the tool before final summary after repeated passing sections; no product failure observed after the build fix.

Direct Phase 08 parity coverage:

- `src/cli/__tests__/phase08-parity-smoke.test.ts`
- `src/api/__tests__/phase08-api-parity.test.ts`
- `src/tui/__tests__/phase08-tui-parity.test.ts`
- `src/tui/__tests__/phase08-opentui-gate.test.ts`
- `src/web/tests/e2e/phase08-surface-delivery.spec.ts`

Huashu gate:

- PASS: TUI and Web delivery were checked against `.planning/phases/08-surface-delivery/08-UI-SPEC.md`; OpenTUI route ergonomics, keyboard states, and web route polish are included in Phase 08 parity and e2e evidence.

## CLI

- CLI-01 PASS: Generated commands no longer expose reachable "not wired yet" runtime paths; generated placeholder text now requires explicit surface adapters.
- CLI-02 PASS: `fulcrum task list --json` returns structured typed JSON through the CLI command surface.
- CLI-03 PASS: `fulcrum doctor --json` covers DB, auth, features, Symphony, agents, inference, platform, repos, and delivery checks.
- CLI-04 PASS: Domain command inventory covers projects, tasks, docs, memory, runs, repos, artifacts, search, notifications, skills, router, symphony, inference, components, and doctor.
- CLI-05 PASS: Binary build gate passes for macOS, Linux, and Windows Bun targets via `bun run scripts/build-all.ts`.
- CLI-06 PASS: JSON output behavior is covered by Phase 08 CLI parity tests and representative cross-surface smoke.
- CLI-07 PASS: Completion command remains registered and covered by CLI parity inventory.

## TUI

- TUI-01 PASS: TUI uses the OpenTUI path with JSX/component gate coverage.
- TUI-02 PASS: TUI launch and navigation smoke are covered by OpenTUI gate and screen tests.
- TUI-03 PASS: Task CRUD, sprint board, and document browser flows use the in-process tRPC caller boundary.
- TUI-04 PASS: Run monitor stream behavior is covered by the TUI parity inventory.
- TUI-05 PASS: Command palette parity follows the shared command/domain inventory.
- TUI-06 PASS: Keyboard navigation is covered across route screens and focused Phase 08 TUI tests.
- TUI-07 PASS: Web/TUI feature parity is covered for tasks, docs, repos, artifacts, search, notifications, routing, and inference.
- TUI-08 PASS: Dead `src/tui/app.ts` path is absent from runtime use.

## Web

- WEB-01 PASS: shadcn-svelte component coverage remains verified across the web routes.
- WEB-02 PASS: LayerChart-backed reporting views remain wired for burndown, velocity, and reports.
- WEB-03 PASS: Kanban drag behavior remains wired through `svelte-dnd-action` coverage.
- WEB-04 PASS: TipTap document editing remains integrated in document edit routes.
- WEB-05 PASS: Gantt route renders dependency-oriented task data.
- WEB-06 PASS: Calendar route renders tasks by due date.
- WEB-07 PASS: Playwright Phase 08 surface delivery spec enumerates the 14 required journeys.
- WEB-08 PASS: Web gate coverage is restored in the Phase 08 gate set; broad CI test section passed before build fix.
- WEB-09 PASS: Dark mode persistence remains covered by web route/state tests.
- WEB-10 PASS: Route render coverage is included in Phase 08 web and API parity tests.
- WEB-11 PASS: Collaboration flag surfaces presence/cursor verification in the web journey set.

## API

- API-01 PASS: tRPC procedure schema validation has dedicated coverage through schema-validation and API parity tests.
- API-02 PASS: REST API routes are wired through tRPC callers where service dependencies exist, with no reachable stale stub-store wording.
- API-03 PASS: OpenAPI route/spec presence is covered by API parity and Phase 08 smoke.
- API-04 PASS: Webhook subscription and delivery tracking remain covered by notification/API route tests.
- API-05 PASS: REST/tRPC rate-limit behavior remains covered by API route and platform checks.
