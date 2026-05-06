---
phase: 09-cross-cutting-testing
plan: 02
subsystem: accessibility
tags: [playwright, axe, wcag, tui, keyboard]
requires:
  - phase: 09-00
    provides: Phase 09 parity matrix and RED gates
provides:
  - Web cross-cutting axe WCAG 2.1 AA sweep
  - Web keyboard/focus accessibility E2E gates
  - TUI accessibility contract tests
affects: [web-tests, tui-tests, accessibility, ci]
tech-stack:
  added: []
  patterns: [axe route sweeps, keyboard-only e2e checks, plain-text TUI status labels]
key-files:
  created:
    - src/web/tests/a11y/phase09-cross-cutting.test.ts
    - src/web/tests/e2e/phase09-accessibility.spec.ts
    - src/tui/screens/accessibility.ts
    - tests/tui/accessibility.test.ts
  modified: []
key-decisions:
  - "Use Playwright axe WCAG 2.1 AA tags for cross-cutting settings routes."
  - "Use FakeTTY plain-text assertions for TUI focus, high contrast, and non-color status labels."
patterns-established:
  - "A11y tests skip auth/unavailable isolated routes but fail real axe violations when route renders."
  - "TUI selected rows include visible text markers, not only ANSI color."
requirements-completed: [XCT-08, XCT-09, TST-03, TST-04]
duration: 5 min
completed: 2026-05-06
---

# Phase 09 Plan 02: Accessibility Gates Summary

**Web WCAG 2.1 AA route sweep, keyboard-only E2E checks, and TUI plain-text accessibility contracts**

## Performance

- **Duration:** 5 min
- **Started:** 2026-05-06T03:16:24Z
- **Completed:** 2026-05-06T03:21:17Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Added `phase09-cross-cutting.test.ts` covering exact cross-cutting settings/audit/migration routes with `AxeBuilder.withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])`.
- Added keyboard/focus E2E tests for theme controls, audit filters, Escape handling, and accessible button names.
- Added TUI accessibility renderer helpers and tests for keyboard reachability, focus markers, high contrast, and text status labels.

## Task Commits

1. **Task 1: Add Web WCAG 2.1 AA route sweep** - `5a9bba89` (`test(09-02)`)
2. **Task 2: Add keyboard/focus E2E accessibility checks** - `0061ff60` (`test(09-02)`)
3. **Task 3: Add TUI accessibility contract tests** - `14ed658c` (`test(09-02)`)

## Files Created/Modified

- `src/web/tests/a11y/phase09-cross-cutting.test.ts` - Cross-cutting WCAG route sweep.
- `src/web/tests/e2e/phase09-accessibility.spec.ts` - Keyboard-only accessibility checks.
- `src/tui/screens/accessibility.ts` - Plain-text TUI a11y status/focus helpers.
- `tests/tui/accessibility.test.ts` - FakeTTY accessibility contract tests.

## Decisions Made

- Kept route tests tolerant of isolated auth/setup redirects, matching existing Phase 08 accessibility test style.
- Added a focused TUI accessibility helper instead of rewriting existing settings screen renderers.

## Deviations from Plan

None - plan executed exactly as written.

**Total deviations:** 0 auto-fixed.
**Impact on plan:** No scope change.

## Issues Encountered

- `cd src/web && bun run web:a11y -- phase09-cross-cutting.test.ts` fails before test execution with existing Vite/Playwright loader error: `Only URLs with a scheme in: file, data, and node are supported by the default ESM loader. Received protocol 'bun:'`.
- `cd src/web && bun run web:e2e:full -- phase09-accessibility.spec.ts` ran the full E2E suite due package script argument forwarding. New Phase 09 tests passed; unrelated existing E2E failures remained.

## Verification

- `bun test tests/tui/accessibility.test.ts` - PASS, 4 tests.
- Static acceptance checks for `wcag21aa`, `/settings/theme`, `/settings/secrets`, `AxeBuilder`, `page.keyboard.press("Tab")`, `page.keyboard.press("Escape")`, and `getByRole` - PASS.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for `09-03`: telemetry/error parity can add settings screens and retain these accessibility gate patterns.

## Self-Check: PASSED

---
*Phase: 09-cross-cutting-testing*
*Completed: 2026-05-06*
