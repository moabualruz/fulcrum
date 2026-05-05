---
phase: 08-surface-delivery
plan: 01
subsystem: testing
tags: [surface-parity, cli, tui, api, web, bun-test]
requires:
  - phase: 08-surface-delivery
    provides: Phase 08 context, research, patterns, and validation contract
provides:
  - Canonical Phase 08 surface parity domain matrix
  - CLI dispatch inventory gate
  - REST API route registration and stub-detection gate
  - TUI navigation and screen inventory gate
  - Web route existence checks through parity helpers
affects: [08-02-cli, 08-03-api, 08-05-tui, 08-06-web]
tech-stack:
  added: []
  patterns:
    - Static source inventory tests using Bun test
    - Alias-aware parity helpers shared across surface tests
key-files:
  created:
    - src/surfaces/parity.ts
    - src/surfaces/parity.test.ts
    - src/cli/__tests__/phase08-cli-parity.test.ts
    - src/api/__tests__/phase08-api-parity.test.ts
    - src/tui/__tests__/phase08-tui-parity.test.ts
  modified: []
key-decisions:
  - "Parity gaps are enforced as failing tests before downstream implementation plans."
  - "Surface aliases remain explicit in src/surfaces/parity.ts instead of duplicated across test files."
patterns-established:
  - "Surface parity matrix defines domain aliases, expected routes, command names, TUI labels, and API applicability."
  - "Inventory gates inspect actual source files and fail on missing command dispatch, missing TUI labels, or in-memory REST stubs."
requirements-completed: [CLI-01, CLI-04, CLI-06, TUI-07, WEB-07, WEB-10, API-01, API-02]
duration: 24min
completed: 2026-05-05
---

# Phase 08 Plan 01: Surface Parity Inventory Summary

**Canonical surface parity matrix with failing CLI, TUI, API, and Web inventory gates for downstream Phase 08 implementation**

## Performance

- **Duration:** 24 min
- **Started:** 2026-05-05T23:01:00Z
- **Completed:** 2026-05-05T23:25:21Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added `REQUIRED_SURFACE_DOMAINS` for projects, tasks, sprints, docs, memory, runs, repos, artifacts, search, notifications, skills, routing, inference, components, doctor, and auth.
- Added alias-aware helpers for missing CLI command, TUI nav, API route, and Web route inventory.
- Added parity gate tests that currently fail on real gaps: CLI dispatch, TUI navigation, and REST stubs.
- Verified OpenAPI is served through both `/api/v1/openapi.json` and compatibility `/api/openapi.json`.

## Task Commits

1. **Task 1 RED: Define canonical parity matrix test** - `4be40a68` (test)
2. **Task 1 GREEN: Define canonical parity matrix** - `a21f6154` (feat)
3. **Task 2 RED: Add CLI/API/TUI/Web inventory tests** - `8b0ad1df` (test)

## Files Created/Modified

- `src/surfaces/parity.ts` - Canonical Phase 08 domain matrix and missing-surface helpers.
- `src/surfaces/parity.test.ts` - Matrix, router alias, generated CLI, API, TUI sample, and Web route checks.
- `src/cli/__tests__/phase08-cli-parity.test.ts` - Source inventory gate for top-level CLI domain dispatch.
- `src/api/__tests__/phase08-api-parity.test.ts` - OpenAPI route registration and in-memory stub detection gate.
- `src/tui/__tests__/phase08-tui-parity.test.ts` - TUI nav label and screen module inventory gate.

## Decisions Made

- Kept parity metadata in code (`src/surfaces/parity.ts`) so later plans can import one source of truth.
- Treated generated command inventory gaps as explicit findings instead of hiding them; `components` is currently absent from `GENERATED_DOMAIN_COMMANDS`.
- Kept failing gates in place because 08-01 objective is to define parity inventory before 08-02/08-03/08-05 implementation closes gaps.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Required verification command intentionally exits 1 because gates expose current Phase 08 implementation gaps:

- CLI missing domains: `projects`, `tasks`, `sprints`, `memory`, `artifacts`, `search`.
- `src/cli/index.ts` lacks direct/delegated `case "tasks"`.
- TUI nav missing labels: `projects`, `tasks`, `sprints`, `docs`, `memory`, `runs`, `repos`, `search`, `skills`, `components`, `doctor`.
- REST stubs remain in docs, runs, and artifacts route modules.

Command:

```bash
bun test src/surfaces/parity.test.ts src/cli/__tests__/phase08-cli-parity.test.ts src/api/__tests__/phase08-api-parity.test.ts src/tui/__tests__/phase08-tui-parity.test.ts
```

Result: `10 pass, 4 fail`. Failures are expected inventory gates for downstream plans.

## Known Stubs

None introduced. Test files contain stub-detection strings to find existing REST stubs; no new runtime stub behavior was added.

## Threat Flags

None - no new network endpoint, auth path, file access path, schema, or trust boundary was introduced.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

08-02 can consume CLI failures to wire missing command domains and universal JSON behavior. 08-03 can consume REST stub findings for docs/runs/artifacts. 08-05 can consume TUI navigation failures when building the OpenTUI parity path.

## Self-Check: PASSED

- Found all created files.
- Found task commits `4be40a68`, `a21f6154`, and `8b0ad1df`.

---
*Phase: 08-surface-delivery*
*Completed: 2026-05-05*
