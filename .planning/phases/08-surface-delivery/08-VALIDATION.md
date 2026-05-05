# Phase 08: Surface Delivery - Validation Strategy

**Created:** 2026-05-06

## Validation Architecture

Phase 08 passes only when parity is proven through inventory, contract, surface, and final CI gates.

## Dimensions

1. **CLI parity:** every required domain dispatches from `src/cli/index.ts`, supports help, and supports `--json` where it performs work.
2. **TUI parity:** OpenTUI gate passes, all required domains are navigable, and TUI screens use tRPC caller paths.
3. **Web parity:** 14 Playwright journeys exist and route render smoke covers Phase 5-7 routes.
4. **API parity:** OpenAPI spec contains real routes, no in-memory public stubs remain for Phase 5-7 domains, and rate limits emit headers.
5. **Schema validation:** tRPC procedure input/output schemas reject bad payloads in tests.
6. **No regressions:** Phase 5-7 e2e and parity smoke tests stay green.

## Required Commands

- `bun test src/surfaces/parity.test.ts`
- `bun test src/cli/__tests__/phase08-cli-parity.test.ts`
- `bun test src/api/__tests__/phase08-api-parity.test.ts`
- `bun test src/tui/__tests__/phase08-opentui-gate.test.ts`
- `cd src/web && bun run web:e2e`
- `bun run ci`

## Acceptance

- No runtime string `not wired yet` remains in CLI/TUI/API command paths.
- `src/tui/app.ts` is removed after replacement.
- `/api/v1/openapi.json` is served and validated.
- `fulcrum completion --shell bash|zsh|fish|powershell` emits non-empty scripts.
