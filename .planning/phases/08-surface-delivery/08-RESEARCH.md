# Phase 08: Surface Delivery - Research

**Researched:** 2026-05-06  
**Status:** Complete  
**Sources:** `08-RESEARCH-PLATFORMS.md`, `08-RESEARCH-DEPENDENCIES.md`, `08-RESEARCH-INTEGRATION.md`

## Executive Summary

Phase 08 should be planned as a parity and hardening phase, not a feature invention phase. Phases 5-7 already delivered most backend/domain capabilities. Remaining work is exposing them consistently across CLI, TUI, Web, and REST/API.

The deepest risks are:

- CLI dispatch only covers a subset of generated domains in `src/cli/index.ts`.
- REST API still has stub/in-memory routes in `src/api/routes/*` while kernel routes exist for some domains.
- TUI has two roots: `src/tui/index.ts` is the real ANSI app; `src/tui/app.ts` is a dead/stub repo demo and must be removed after replacement.
- OpenTUI is required by TUI-01, but upstream is still in development and uses a native Zig renderer. Gate this first.
- WEB-07 requires 14 Playwright journeys. Existing phase e2e specs are useful but not the full enumerated journey set.
- API-01 scope is broad: "every tRPC procedure has Zod-validated test." Use generated/router-group validation smoke tests plus targeted high-risk tests.

## Validation Architecture

Phase 08 validation should have four layers:

1. **Inventory tests:** compare `appRouter` domains to CLI dispatch, TUI screens, REST routes, and Web routes. Missing parity cells fail before implementation.
2. **Surface tests:** root `bun:test` for CLI/API/TUI, web Vitest for route/component rendering, Playwright for 14 user journeys.
3. **Contract tests:** JSON output shape matches tRPC schemas; REST OpenAPI includes real paths; rate-limit headers exist; no "not wired yet" strings remain in runtime command/API paths.
4. **Final gates:** `bun run ci`, `bun run build:all`, selected Playwright e2e with `FULCRUM_RUN_E2E=1` where possible, and graphify update after code edits.

## Exact Dependency Decisions

- Add `@opentui/core@0.2.2` and `@opentui/solid@0.2.2` only in the TUI renderer gate plan.
- Avoid `@opentui/react@0.2.2` unless Solid binding fails.
- Keep existing CLI architecture; do not add `oclif`, `commander`, `cac`, or `clipanion`.
- Keep `@hono/zod-openapi@1.3.0`; do not swap API framework.
- Implement Fulcrum-owned rate limiter first. Consider `hono-rate-limiter@0.5.3` only after source inspection.

## Required Plan Waves

1. Inventory and parity gates.
2. CLI JSON/completion parity.
3. REST/API validation and rate limiting.
4. OpenTUI renderer gate.
5. TUI domain parity and dead root removal.
6. Web UAT route/journey completion.
7. Final build/CI/parity hardening.

## Source Files To Prioritize

- `src/cli/index.ts`
- `src/cli/generated-domains.ts`
- `src/cli/commands/pillar14-generated.ts`
- `src/cli/local-caller.ts`
- `src/api/hono.ts`
- `src/api/routes/`
- `src/trpc/router.ts`
- `src/trpc/schemas/`
- `src/tui/index.ts`
- `src/tui/app.ts`
- `src/tui/screens/`
- `src/tui/testing/fake-tty.ts`
- `src/web/src/routes/`
- `src/web/tests/e2e/`
- `src/web/tests/a11y/`

## Research Files

- `.planning/phases/08-surface-delivery/08-RESEARCH-PLATFORMS.md`
- `.planning/phases/08-surface-delivery/08-RESEARCH-DEPENDENCIES.md`
- `.planning/phases/08-surface-delivery/08-RESEARCH-INTEGRATION.md`

## RESEARCH COMPLETE
