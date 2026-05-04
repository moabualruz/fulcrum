# Phase 2: Bug Fixes + Foundation - Context

**Gathered:** 2026-05-04
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase resolves the confirmed Phase 2 bug list and installs foundation infrastructure required by later phases. It does not reopen Phase 1 architecture decisions: data access remains ORM/service-centered, events/API boundaries remain as converged in Phase 1, and Phase 2 work should focus on reproducible bugs, CI/runtime reliability, DB backend configurability, permissions, migration/index foundations, feature flags, worker registry, tenant settings, and auth/init parity.

</domain>

<decisions>
## Implementation Decisions

### Bug Triage Order
- **D-01:** Plan Phase 2 dependency-first, not severity-first. Fix bugs that unblock CI, binary launch, web checks, downstream phases, or shipped-surface usage before isolated bugs.
- **D-02:** Treat blocker scope broadly: build/test blockers, downstream phase blockers, and user-visible shipped-surface blockers all count.
- **D-03:** Group work into dependency clusters, not one bug per plan. Example clusters: CI + web typecheck, compiled binary + data path/config, permissions + lint.
- **D-04:** Defer BUG-17 local main sync/repo hygiene outside Phase 2 product/runtime execution.

### TDD Evidence
- **D-05:** Require strict RED to GREEN evidence per bug. Each bug gets a failing test or credible failing repro before the fix.
- **D-06:** Commit RED tests separately before fixes to preserve TST-10 audit evidence.
- **D-07:** Shared foundation infrastructure needs both unit and integration tests where meaningful: permissions, migrations, worker registry, and flags.
- **D-08:** For compiled-binary or toolchain bugs that normal test runners cannot express, use strongest feasible evidence: automated failing test first, otherwise repro script plus captured failing output. Manual repro steps are supporting evidence only.

### Foundation Scope Shape
- **D-09:** Split foundation work by infra lane, then order lanes by downstream dependency.
- **D-10:** Foundation lane order after bug blockers: migrations/indexes, feature flags, permissions, worker registry.
- **D-11:** Implement tenant settings as a standalone small plan: entity, repository, tests, and minimal surface.
- **D-12:** Complete full FND-05 in Phase 2: Web login/auto-session, CLI `fulcrum auth whoami`, and TUI auth screen.

### CI/Web Gate Policy
- **D-13:** `bun run ci` should run all required stable gates. Each target should also keep focused recipes for local iteration.
- **D-14:** General CI should include the full stable web suite except full opt-in e2e. Focused target recipes may run smaller gate sets based on need.
- **D-15:** Default CI should include smoke e2e. Full browser suite should have a separate named recipe.
- **D-16:** Move compression and skills lint out of default product-code CI and into the release gate.

### Compiled Binary Strategy
- **D-17:** Compiled binary must work fully in dev and shipped mode with both PGlite and external PostgreSQL.
- **D-18:** Shipped default backend is PGlite, with DB backend config override support.
- **D-19:** DB config surface should include CLI setting, persisted config, and env override, e.g. `fulcrum config set db.backend ...`.
- **D-20:** Migrations are explicit for all backends via `fulcrum db migrate`. No compiled-mode auto-migration default.

### Permission Enforcement
- **D-21:** Permission enforcement mechanism is planner discretion. Planner should match existing tRPC middleware shape.
- **D-22:** Permission lint is a hard fail in default CI; no missing protected-procedure permission check should reach main.
- **D-23:** Use a hybrid permission model: explicit resource/action constants in code, backed by existing Casbin policies where enabled. Coarse resource/action names are the baseline vocabulary.
- **D-24:** Local-dev bypass is allowed only behind feature flag/env and must be logged.

### the agent's Discretion
- Planner chooses exact tRPC permission mechanism: direct `assertPermission()` calls, protected-procedure wrapper, or equivalent existing middleware pattern.
- Planner researches Bun compile + PGlite asset behavior and selects the robust shipped-asset strategy.
- Planner may choose focused recipe names and exact web gate commands based on current `scripts/ci.ts` and `src/web/package.json`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning Sources
- `.planning/ROADMAP.md` — Phase 2 goal, requirements, TDD expectation, and success criteria.
- `.planning/REQUIREMENTS.md` — BUG-01 through BUG-18 and FND-01 through FND-07 definitions.
- `.planning/PROJECT.md` — product direction, local-first constraints, stack, and no-deferrals milestone rule.
- `.planning/STATE.md` — current Phase 1 completion state and locked architecture decisions.
- `.planning/phases/01-architecture-convergence-security/01-CONTEXT.md` — Phase 1 decisions that Phase 2 must not reopen.

### Codebase Maps
- `.planning/codebase/CONCERNS.md` — known bug details, security concerns, fragile areas, and dependency risks.
- `.planning/codebase/ARCHITECTURE.md` — current layer model, request paths, EventBus/DB/auth patterns.
- `.planning/codebase/TESTING.md` — test runners, commands, utilities, CI shape, and coverage gaps.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/ci.ts` and root `package.json` scripts define the current local CI runner and should be updated rather than bypassed.
- `src/test-utils/` provides `createTestOrm`, `createTestContainer`, `createTestCaller`, and auth helpers for integration tests.
- `src/web/tests/` already contains Vitest, Playwright, and a11y test structure that can back the new CI/web gates.
- `src/trpc/middleware.ts` and existing Casbin wiring are the starting points for FND-02.
- `src/flags/registry.ts` is the canonical feature-flag registry path for FND-07.

### Established Patterns
- Root test runner is `bun:test`; web has Vitest and Playwright. Use existing runner split and make root CI orchestrate it.
- Local-first default is PGlite, with PostgreSQL path needed for SaaS. Phase 2 must make this explicit through config and migration behavior.
- Phase 1 established tRPC to service to repository to entity as the business-logic path. Phase 2 should add foundation through that path.

### Integration Points
- CI policy connects through root `bun run ci`, focused package scripts, and web package scripts.
- DB backend selection connects through config/env/CLI config surfaces and migration command behavior.
- Permission enforcement connects through tRPC procedures, middleware, resource/action constants, and Casbin policy integration.
- Worker registry connects to future metrics, artifacts, notifications, and SaaS job coordination.

</code_context>

<specifics>
## Specific Ideas

- Plan clusters should make dependencies obvious: CI/web gates, binary/DB config/migrations, foundation lanes, permissions/lint, worker registry.
- Separate RED commits are required for bug fixes wherever practical.
- Smoke e2e belongs in default CI; full e2e remains a named explicit command.
- BUG-17 is intentionally deferred from Phase 2 execution.

</specifics>

<deferred>
## Deferred Ideas

- BUG-17 local main sync/repo hygiene belongs outside Phase 2 product/runtime execution.

</deferred>

---

*Phase: 2-Bug Fixes + Foundation*
*Context gathered: 2026-05-04*
