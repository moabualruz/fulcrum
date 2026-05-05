# Phase 8: Surface Delivery - Context

**Gathered:** 2026-05-06  
**Status:** Ready for planning  
**Research basis:** Deep platform, dependency, and codebase integration research persisted in `08-RESEARCH-PLATFORMS.md`, `08-RESEARCH-DEPENDENCIES.md`, and `08-RESEARCH-INTEGRATION.md`.

<domain>
## Phase Boundary

Phase 08 turns Fulcrum's existing product pillars into complete, parity-tested delivery surfaces. Scope is not new domain capability; scope is making existing Phase 5-7 backend features usable through CLI, TUI, Web, and REST/API with maximum practical parity. Deliver: every CLI command wired to tRPC with JSON output and shell completion; TUI rewritten/gated on OpenTUI with functional screens for all parity domains; Web route/render/UAT completion for Phase 5-7 journeys; single REST API validated through OpenAPI, Zod tests, and rate limiting; dead stubs removed or replaced by real service/tRPC paths.

</domain>

<decisions>
## Implementation Decisions

### Surface Parity Contract
- **D-01:** Maximum parity means every domain has a matrix row across Web, CLI, TUI, and REST/API where applicable. Required domains: projects, tasks, sprints, docs, memory, runs, repos, artifacts, search, notifications, skills/routing, inference, components, doctor, auth/settings.
- **D-02:** Parity is capability-equivalent, not pixel-identical. Web remains full interactive UX; CLI is scriptable CRUD/actions; TUI is keyboard/live operational UX; REST is external integration/API-key UX.
- **D-03:** Planning must start with a generated or manually audited parity matrix from `appRouter`, `src/cli/generated-domains.ts`, `src/tui/screens/`, `src/web/src/routes/`, and `src/api/routes/`. Missing cells become tests before implementation.
- **D-04:** No surface may own business logic. Web/CLI/TUI/REST call tRPC/service/repository paths. Direct DB/entity imports from surfaces are bugs unless already existing test utilities.

### CLI Wiring + JSON
- **D-05:** Keep the existing Bun CLI architecture. Do not migrate to `oclif`, `commander`, `cac`, or `clipanion` in this phase.
- **D-06:** CLI command shape is domain-first, verb-second: `fulcrum tasks list`, `fulcrum docs get`, `fulcrum repos sync`, `fulcrum notify rules list`. Existing singular aliases can remain as compatibility wrappers, but canonical docs/tests should use plural domain names where current generated domains are plural.
- **D-07:** `--json` on every command returns the direct tRPC output schema shape with dates serialized to ISO strings. Human text output is secondary and not used as test oracle.
- **D-08:** Add `fulcrum completion --shell bash|zsh|fish|powershell`, matching GitHub CLI's shell-specific completion pattern.
- **D-09:** Generated "not wired yet" and in-memory command paths must be replaced with local tRPC caller paths. Top-level `src/cli/index.ts` must dispatch all 15 required domains, not only the current subset.

### TUI OpenTUI Rewrite
- **D-10:** Use `@opentui/core@0.2.2` plus `@opentui/solid@0.2.2` as the first OpenTUI JSX path. Avoid `@opentui/react` unless the Solid binding fails, to avoid adding React solely for TUI.
- **D-11:** First TUI plan must be a renderer gate: install packages, prove launch/render/input on macOS, prove Bun compile behavior, and document Linux verification path. If this gate fails, stop for fallback decision rather than doing a partial rewrite.
- **D-12:** Preserve `FakeTTY`-style headless tests. New OpenTUI adapter must keep screen logic testable without an interactive terminal.
- **D-13:** TUI navigation must expose all parity domains: Projects, Tasks, Docs, Memory, Runs, Repos, Artifacts, Search, Notifications, Routing/Skills, Doctor/Settings.
- **D-14:** TUI live run monitor uses existing subscription/EventBus path: `runsSubscriptions`, `notifySubscriptions`, and `orchestrationSubscriptions` from `src/trpc/router.ts`. No polling-only monitor unless subscription unavailable in tests.
- **D-15:** Remove dead `src/tui/app.ts` only after `src/tui/index.ts` OpenTUI path covers repo/task/run/memory navigation and tests prove current TUI entry still launches.

### Web Completion + UAT
- **D-16:** Web work is completion and verification, not redesign. Use existing shadcn-svelte/Bits UI components and existing Phase 5-7 route structure.
- **D-17:** WEB-07 Playwright coverage must enumerate and test 14 journeys: first-time setup, project CRUD, task CRUD, kanban move, sprint management, doc CRUD, doc editing, search+facets, memory browse, repo management, artifact download, notification rules, agent dispatch, theme customization.
- **D-18:** Web route gate must prove all routes render without server errors, including Phase 5-7 routes under `projects/[id]`, `docs`, `memory`, `search`, `repos`, `artifacts`, `inbox`, `runs`, `settings/api`.
- **D-19:** Dark mode persistence and collab-flag UI are verification tasks; do not invent new theming/collab product scope here.

### REST/API Surface
- **D-20:** Keep `@hono/zod-openapi@1.3.0` and current `src/api/hono.ts` as the OpenAPI path. Replace stub routes with real tRPC/service-backed handlers; do not introduce a second API framework.
- **D-21:** Align served OpenAPI paths with roadmap expectation: `/api/v1/openapi.json` must be tested through the web-mounted route; existing `/api/openapi.json` can remain as compatibility if already used.
- **D-22:** API-01 means every tRPC procedure gets schema-validation coverage. Prefer generated/router-group smoke tests that assert input/output Zod schemas reject bad payloads, then add focused tests for high-risk procedures.
- **D-23:** Rate limiting is per caller identity/org/API key, with response headers showing limit, remaining, reset, and concurrent state where available. Copy Sentry/Jira operational semantics; do not allow bypass by rotating bearer tokens for same identity.
- **D-24:** Implement small Fulcrum-owned Hono middleware first for rate limiting. Only adopt `hono-rate-limiter@0.5.3` if source inspection proves local-first store and Bun compatibility.

### Deep Research + Planning Requirements
- **D-25:** Planner/researcher must read the three Phase 08 research files and keep outputs disk-backed, following Phase 5 style.
- **D-26:** Planning must name exact packages and exact platform UX patterns per task. Generic "wire CLI" or "improve TUI" plan items are insufficient.
- **D-27:** Each plan must include parity tests for the surfaces it touches. Final phase gate is `bun run ci`, plus targeted web/TUI/CLI/API smoke tests where CI omits Playwright E2E by default.

### the agent's Discretion
- Exact parity matrix representation can be Markdown, JSON, or generated test fixture as long as downstream plans can consume it.
- Exact CLI human output formatting is flexible; JSON schema is locked.
- Exact OpenTUI layout details are flexible after renderer gate, provided domain navigation and keyboard behavior are complete.
- Exact rate limit defaults are planner discretion, but must be conservative and testable.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 08 Research
- `.planning/phases/08-surface-delivery/08-RESEARCH-PLATFORMS.md` — competitive platform UX patterns for CLI/TUI/Web/API.
- `.planning/phases/08-surface-delivery/08-RESEARCH-DEPENDENCIES.md` — exact package decisions and dependency adoption/avoidance.
- `.planning/phases/08-surface-delivery/08-RESEARCH-INTEGRATION.md` — codebase integration map, event producer/consumer map, files that must not break.

### Requirements
- `.planning/ROADMAP.md` §Phase 8 — scope, success criteria, dependencies.
- `.planning/REQUIREMENTS.md` §API Surface (API-01..05) — public API requirements.
- `.planning/REQUIREMENTS.md` §CLI — Pillar 14 (CLI-01..07) — CLI requirements.
- `.planning/REQUIREMENTS.md` §TUI — Pillar 15 (TUI-01..08) — TUI requirements.
- `.planning/REQUIREMENTS.md` §Web App — Pillar 16 (WEB-01..11) — Web requirements.

### Prior Phase Decisions
- `.planning/phases/05-task-management-metrics/05-CONTEXT.md` — task/report/command palette parity decisions and Phase 5 deep-research standard.
- `.planning/phases/06-documents-memory-search/06-CONTEXT.md` — docs/memory/search/Cmd+K parity decisions.
- `.planning/phases/07-repos-artifacts-notifications/07-CONTEXT.md` — repos/artifacts/notifications parity and API/event decisions.

### Codebase Starting Points
- `src/cli/index.ts` — CLI dispatch surface.
- `src/cli/generated-domains.ts` — generated domain inventory.
- `src/cli/commands/pillar14-generated.ts` — partial generated command implementations.
- `src/cli/local-caller.ts` — in-process tRPC path for CLI.
- `src/tui/index.ts` — current TUI application root and caller contract.
- `src/tui/app.ts` — dead/stub TUI file to remove after replacement.
- `src/tui/screens/` — existing screen inventory.
- `src/tui/testing/fake-tty.ts` — TUI headless test harness.
- `src/web/src/routes/` — Web route inventory for WEB-07/WEB-10.
- `src/web/tests/e2e/` — existing Playwright journey specs to expand.
- `src/web/tests/a11y/` — existing accessibility route sweeps.
- `src/api/hono.ts` — public REST API factory and OpenAPI generation.
- `src/api/routes/` — REST route inventory with stubs to replace.
- `src/trpc/router.ts` — canonical AppRouter and subscription routers.
- `src/trpc/schemas/` — Zod schemas for API-01 validation coverage.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/cli/local-caller.ts`: shared in-process tRPC bridge for CLI commands.
- `src/tui/index.ts`: typed `TuiCaller` contract and existing screen/state model.
- `src/tui/testing/fake-tty.ts`: keeps TUI tests non-interactive.
- `src/web/tests/e2e/phase05-*`, `phase06-*`, `phase07-*`: prior journey coverage to fold into WEB-07.
- `src/api/hono.ts`: already uses `OpenAPIHono` and `@hono/zod-openapi`; extend rather than replace.
- `src/trpc/router.ts`: single procedure inventory and subscription routers for live TUI/CLI watch behavior.

### Established Patterns
- Web/CLI/TUI converge on tRPC/service/repository paths.
- MikroORM is canonical data path; no new raw SQL/product-kernel expansion.
- Zod schemas live in `src/trpc/schemas/`; OpenAPI schemas use `@hono/zod-openapi`.
- Tests use `bun:test` for root, Vitest/Playwright for web, FakeTTY for TUI.
- Local-first PGlite defaults must still support PostgreSQL/SaaS path later.

### Integration Points
- CLI argv -> domain command -> local tRPC caller -> `appRouter` -> service/repository.
- TUI keypress -> screen action -> `TuiCaller` -> tRPC; live screens subscribe through EventBus-backed subscription procedures.
- Web route load/action -> SvelteKit/tRPC -> same AppRouter.
- REST request -> Hono route -> tRPC/service path -> Zod/OpenAPI response.
- Domain event -> EventBus/subscriptions -> TUI live monitor, CLI watch, Web badges.

</code_context>

<specifics>
## Specific Ideas

- Copy GitHub CLI's `--json`/completion ergonomics, but keep Fulcrum's simpler `--json` flag instead of requiring field lists in v1.
- Copy Sentry/Jira API rate-limit operational expectations: identity-keyed limits, headers, and webhook preference over polling.
- Copy opencode/OpenTUI terminal app feel: keyboard-first, live panes, status footer, scrollback/log views.
- Use Phase 5's research rigor: platform matrix + dependency matrix + codebase integration map before plans.

</specifics>

<deferred>
## Deferred Ideas

- Full CLI framework migration to oclif/Clipanion/Commander — out of scope; current CLI must be completed first.
- CLI `--jq` and `--template` formatting — useful future enhancement after universal `--json`.
- New Web design system or page redesign — Phase 08 verifies/completes existing product UX.
- Hosted API gateway/tier billing — Phase 10/SaaS hardening, not Phase 08.

</deferred>

---

*Phase: 8-Surface Delivery*  
*Context gathered: 2026-05-06*
