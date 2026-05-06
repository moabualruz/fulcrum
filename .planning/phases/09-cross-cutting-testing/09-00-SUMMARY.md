---
phase: 09-cross-cutting-testing
plan: 00
subsystem: testing
tags: [parity, coverage, tdd, gates]
requires:
  - phase: 08-surface-delivery
    provides: surface parity conventions and route/command inventories
provides:
  - Phase 09 cross-cutting parity matrix
  - RED gates for coverage, a11y, migration downgrade, and graceful shutdown
affects: [phase-09, ci, testing, parity]
tech-stack:
  added: []
  patterns: [test-first parity inventory, source-inspection red gates]
key-files:
  created:
    - src/platform/cross-cutting-parity.ts
    - tests/platform/cross-cutting-parity.test.ts
    - tests/platform/phase09-red-gates.test.ts
  modified: []
key-decisions:
  - "Keep Phase 09 parity as a typed local inventory with explicit capability IDs and required surfaces."
  - "Use source-inspection RED gates so later plans must wire CI, coverage, a11y, migration downgrade, and graceful shutdown."
patterns-established:
  - "Cross-cutting requirements map to capability IDs before interface-specific implementation starts."
  - "Phase RED gates fail against source files until implementation plans close the gap."
requirements-completed: [XCT-01, XCT-02, XCT-03, XCT-04, XCT-05, XCT-06, XCT-07, XCT-08, XCT-09, XCT-10, XCT-11, XCT-12, TST-01, TST-02, TST-03, TST-04, TST-05, TST-06, TST-07, TST-08, TST-09, TST-10]
duration: 8 min
completed: 2026-05-06
---

# Phase 09 Plan 00: RED Gates and Parity Inventory Summary

**Typed Phase 09 parity matrix plus RED source gates for coverage, a11y, migration downgrade, and graceful shutdown**

## Performance

- **Duration:** 8 min
- **Started:** 2026-05-06T03:03:17Z
- **Completed:** 2026-05-06T03:11:04Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added `CROSS_CUTTING_CAPABILITIES` with exact Phase 09 capability IDs and Web/CLI/TUI/tRPC/REST surface requirements.
- Added helpers for missing surface detection and requirement-to-capability coverage checks.
- Added RED gates that currently fail until later Phase 09 plans wire coverage, web a11y, migration downgrade, and graceful shutdown into CI/config.

## Task Commits

1. **Task 1: Define cross-cutting parity matrix** - `5147c12f` (`test(09-00)`)
2. **Task 2: Add RED gates for missing parity and coverage** - `76d706de` (`test(09-00)`)

## Files Created/Modified

- `src/platform/cross-cutting-parity.ts` - Typed parity capability inventory and requirement/surface helpers.
- `tests/platform/cross-cutting-parity.test.ts` - GREEN tests proving all XCT-01..12 and TST-01..10 IDs map to capabilities.
- `tests/platform/phase09-red-gates.test.ts` - RED gates against CI and web coverage configuration.

## Decisions Made

- Model `rest` as a required surface only for file/download/export-style capabilities where REST endpoints apply.
- Keep RED gates as source inspection tests so they fail quickly before expensive CI stages run.

## Deviations from Plan

None - plan executed exactly as written.

**Total deviations:** 0 auto-fixed.
**Impact on plan:** No scope change.

## Issues Encountered

- `bun test tests/platform/phase09-red-gates.test.ts` fails as intended: missing `coverage`, `web:a11y`, `migration downgrade`, `graceful shutdown`, and web `coverage.thresholds.lines` wiring.

## Verification

- `bun test tests/platform/cross-cutting-parity.test.ts` - PASS.
- `bun test tests/platform/phase09-red-gates.test.ts` - RED as planned; 5 expected failures.
- `bun test tests/platform/cross-cutting-parity.test.ts tests/platform/phase09-red-gates.test.ts` - RED as planned until later Phase 09 implementation plans close gates.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for `09-01`: i18n/theme parity can use the shared matrix and keep RED gate failures scoped to later coverage/CI work.

## Self-Check: PASSED

---
*Phase: 09-cross-cutting-testing*
*Completed: 2026-05-06*
