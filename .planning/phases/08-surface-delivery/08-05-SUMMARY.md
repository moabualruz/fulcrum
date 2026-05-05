---
phase: 08-surface-delivery
plan: 5
subsystem: tui
tags: [opentui, tui, parity, subscriptions, keyboard, huashu]

requires:
  - phase: 08-02
    provides: CLI/API parity caller expectations for Phase 08 domains
  - phase: 08-04
    provides: OpenTUI adapter package gate and `createFulcrumTuiRenderer`
provides:
  - OpenTUI-backed TUI launch path
  - all-domain TUI navigation contract
  - live run monitor subscription path
  - command palette action inventory
  - dead `src/tui/app.ts` removal
affects: [phase-08, phase-09, tui, doctor]

tech-stack:
  added: []
  patterns:
    - "Runtime TUI output flows through `createFulcrumTuiRenderer`; FakeTTY remains test path."
    - "TUI screens consume caller contracts and avoid direct DB/entity imports."
    - "Runs screen accepts EventBus-backed `runsSubscriptions` with FakeTTY synthetic event tests."

key-files:
  created:
    - src/tui/screens/docs-types.ts
    - src/tui/screens/index.ts
  modified:
    - .planning/phases/08-surface-delivery/08-UI-SPEC.md
    - src/tui/__tests__/phase08-tui-parity.test.ts
    - src/tui/index.ts
    - src/tui/screens/runs.ts
    - src/tui/screens/docs-tree.ts
    - src/tui/screens/docs-reader-editor.ts
    - src/tui/screens/new-doc.ts
    - src/doctor/checks/tui.ts
  deleted:
    - src/tui/app.ts

key-decisions:
  - "Keep FakeTTY as the screen test boundary while routing runtime launch through OpenTUI."
  - "Use dense domain nav + list/detail/log + status footer composition from Huashu gate."
  - "Replace TUI screen DB enum imports with local TUI doc constants to satisfy surface-boundary acceptance."

requirements-completed: [TUI-01, TUI-02, TUI-03, TUI-04, TUI-05, TUI-06, TUI-07, TUI-08]

duration: 7min
completed: 2026-05-05T23:55:19Z
---

# Phase 08 Plan 05: TUI Surface Completion Summary

**OpenTUI-backed TUI shell with all-domain navigation, command palette actions, live run subscription monitor, and legacy root removal**

## Performance

- **Duration:** 7 min
- **Started:** 2026-05-05T23:48:29Z
- **Completed:** 2026-05-05T23:55:19Z
- **Tasks:** 5
- **Files modified:** 11

## Accomplishments

- Persisted Huashu TUI composition rules into `08-UI-SPEC.md`: domain nav, list/detail/log pane, status footer, dense operator workflow.
- Added RED parity tests for all TUI-01..08 expectations, then drove them GREEN.
- Routed `launchTui()` through `createFulcrumTuiRenderer()` while keeping FakeTTY tests noninteractive.
- Added all Phase 08 domain nav labels, root command palette actions, and run monitor subscription update coverage.
- Deleted dead `src/tui/app.ts` and moved doctor entrypoint checks to `src/tui/index.ts`.

## Task Commits

1. **Task 0/1 RED gate:** `5624ac58` `test(08-05): add failing TUI parity gate`
2. **Task 2/3/4 GREEN implementation:** `c87746ee` `feat(08-05): complete OpenTUI TUI parity`
3. **Stub wording cleanup:** `cd1b7dec` `style(08-05): clarify TUI docs fallback comment`

## Files Created/Modified

- `.planning/phases/08-surface-delivery/08-UI-SPEC.md` - Huashu design gate findings and concrete TUI layout rules.
- `src/tui/__tests__/phase08-tui-parity.test.ts` - TUI parity, keyboard, OpenTUI runtime, run monitor, and dead-root assertions.
- `src/tui/index.ts` - OpenTUI runtime output bridge, all-domain nav, command palette, domain list/detail pane, run monitor route.
- `src/tui/screens/runs.ts` - EventBus subscription contract and transcript/log rendering.
- `src/tui/screens/docs-types.ts` - TUI-local doc type/scope constants.
- `src/tui/screens/index.ts` - TUI screen barrel export.
- `src/tui/screens/docs-tree.ts`, `src/tui/screens/docs-reader-editor.ts`, `src/tui/screens/new-doc.ts` - Removed direct DB enum imports.
- `src/doctor/checks/tui.ts` - Doctor entrypoint check now points at `src/tui/index.ts`.
- `src/tui/app.ts` - Deleted legacy stub root.

## Decisions Made

- Runtime launch uses the OpenTUI adapter from Phase 08-04; tests continue to use FakeTTY to avoid terminal hangs.
- Command palette scope matches Web Cmd+K categories required by the plan: create task, create doc, search, dispatch run, settings.
- Screen-layer enum imports were replaced with local TUI constants because the plan's literal grep treats any `../../db` screen import as a boundary failure.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Updated doctor TUI entrypoint reference**
- **Found during:** Task 4
- **Issue:** Deleting `src/tui/app.ts` left `src/doctor/checks/tui.ts` checking the removed root.
- **Fix:** Changed doctor check to `src/tui/index.ts` / `dist/tui/index.js`.
- **Files modified:** `src/doctor/checks/tui.ts`
- **Verification:** `rg` reference scan returned no `tui/app` references in `src` or `tests`.
- **Committed in:** `c87746ee`

**2. [Rule 2 - Missing Critical] Removed screen-layer DB enum imports**
- **Found during:** Task 2 acceptance grep
- **Issue:** Existing docs TUI screens imported doc enums from `../../db`, causing the plan's no-direct-screen-data-access grep to fail.
- **Fix:** Added `src/tui/screens/docs-types.ts` and switched docs screens to TUI-local constants/types.
- **Files modified:** `src/tui/screens/docs-types.ts`, `src/tui/screens/docs-tree.ts`, `src/tui/screens/docs-reader-editor.ts`, `src/tui/screens/new-doc.ts`
- **Verification:** DB-access grep returned no matches; `tests/tui/docs-screens.test.ts` passed.
- **Committed in:** `c87746ee`

**Total deviations:** 2 auto-fixed (2 missing critical)
**Impact on plan:** Both were required by 08-05 acceptance and did not add product scope.

## Known Stubs

None. Empty arrays/null fields found by scan are initialized component state or intentional empty/error rendering paths, not UI data stubs.

## Threat Flags

None. No new network endpoints, auth paths, schema changes, or file access trust boundaries were introduced.

## Verification

- `bun test src/tui/__tests__/phase08-tui-parity.test.ts src/tui/screens/repos.test.ts src/tui/screens/notifications-audit.test.ts` — 13 pass, 0 fail.
- `bun test tests/tui/docs-screens.test.ts` — 5 pass, 0 fail.
- `test ! -f src/tui/app.ts` — pass.
- `rg -n "tui/app|from ['\"]\\.\\.?/app['\"]|from ['\"]\\.\\.?/app\\.ts['\"]" src tests || true` — no matches.
- `rg -n "from \"../db|from \"../../db|from '../db|from '../../db|EntityManager|MikroORM" src/tui/screens || true` — no matches.
- `bun run --bun tsc --noEmit --pretty false | rg "src/(tui/(index|screens/(docs|new-doc|runs|index)|opentui)|doctor/checks/tui)" || true` — no changed-file typecheck matches.

## User Setup Required

None.

## Next Phase Readiness

08-06 can proceed with TUI parity gates in place. Residual broader CI failures remain owned by later/final hardening plans per Phase 07/08 state notes, not this plan.

## Self-Check: PASSED

- Summary file exists.
- Created files exist: `src/tui/screens/docs-types.ts`, `src/tui/screens/index.ts`.
- Key modified files exist: `src/tui/index.ts`, `src/tui/__tests__/phase08-tui-parity.test.ts`.
- Commits found: `5624ac58`, `c87746ee`, `cd1b7dec`.
- Deleted file confirmed absent: `src/tui/app.ts`.

---
*Phase: 08-surface-delivery*
*Completed: 2026-05-05*
