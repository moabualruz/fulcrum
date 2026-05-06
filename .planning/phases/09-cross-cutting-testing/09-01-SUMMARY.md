---
phase: 09-cross-cutting-testing
plan: 01
subsystem: i18n-theme
tags: [i18n, theme, cli, tui, trpc, sveltekit]
requires:
  - phase: 09-00
    provides: cross-cutting parity matrix and RED gates
provides:
  - i18n locale catalog parity for en/fr/ar
  - CLI i18n/theme JSON commands
  - TUI i18n locale visibility coverage
  - Web theme tRPC compatibility procedures
affects: [web-settings, cli, tui, trpc, i18n]
tech-stack:
  added: []
  patterns: [adapter-preserving i18n, compatibility tRPC aliases, CLI JSON parity]
key-files:
  created:
    - src/cli/i18n.ts
    - src/cli/theme.ts
    - src/tui/screens/theme.ts
  modified:
    - src/i18n/locales/en.json
    - src/i18n/locales/fr.json
    - src/i18n/locales/ar.json
    - scripts/i18n-extract.ts
    - scripts/i18n-extract.test.ts
    - src/i18n/i18n.test.ts
    - src/cli/commands/cross-cutting-platform.ts
    - tests/cli/cross-cutting-platform.test.ts
    - tests/tui/i18n-screen.test.ts
    - src/server/trpc/routers/theme.ts
    - tests/trpc/theme.test.ts
key-decisions:
  - "Kept src/i18n/index.ts adapter exports stable; no Paraglide or new runtime dependency added."
  - "Added theme.get/theme.update compatibility procedures because the existing Web theme page already calls those tRPC paths."
patterns-established:
  - "Locale extraction now validates secondary locale catalogs against the English base catalog."
  - "Cross-cutting CLI commands return schema-shaped JSON with default values where applicable."
requirements-completed: [XCT-01, XCT-02]
duration: 13 min
completed: 2026-05-06
---

# Phase 09 Plan 01: i18n and Theme Parity Summary

**Locale catalog parity, i18n/theme CLI JSON commands, and Web-compatible theme tRPC aliases**

## Performance

- **Duration:** 13 min
- **Started:** 2026-05-06T03:03:17Z
- **Completed:** 2026-05-06T03:16:24Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments

- Added required settings title keys to `en`, `fr`, and `ar` catalogs and extended the extractor to fail when secondary locales miss base keys.
- Added `runI18n` and hardened `runTheme` so CLI JSON surfaces cover list/set flows and include `defaultValue`.
- Added compatibility exports for planned CLI file paths and a small TUI theme screen renderer.
- Preserved Web theme settings by adding tRPC `theme.get` and `theme.update` aliases alongside existing `listThemes/getTheme/setTheme`.

## Task Commits

1. **Task 1: Harden i18n adapter and extraction gate** - `641aa735` (`test(09-01)`)
2. **Task 2: Wire i18n and theme across Web/CLI/TUI** - `1a6f704d` (`feat(09-01)`)
3. **Integration fix: Web theme tRPC compatibility** - `ce7c5004` (`fix(09-01)`)

## Files Created/Modified

- `scripts/i18n-extract.ts` - Added locale catalog parity checks.
- `src/i18n/locales/en.json`, `fr.json`, `ar.json` - Added Phase 09 settings labels.
- `src/cli/commands/cross-cutting-platform.ts` - Added i18n list/set and theme set/default-value JSON output.
- `src/cli/i18n.ts`, `src/cli/theme.ts` - Compatibility exports for planned CLI surface files.
- `src/tui/screens/theme.ts` - Plain-text theme screen renderer.
- `src/server/trpc/routers/theme.ts` - Added legacy Web-compatible `get`/`update` procedures.

## Decisions Made

- Did not add `@inlang/paraglide-js`; existing adapter already supports the required locale behavior and avoids SSR churn.
- Kept Web theme page shape intact and adapted the router to it, reducing risk to existing settings UI tests.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Web theme tRPC procedure mismatch**
- **Found during:** Task 2 Web spot-check
- **Issue:** Existing Web theme page called `theme.get` and `theme.update`, but the router only exposed `getTheme` and `setTheme`.
- **Fix:** Added compatible `get`/`update` procedures with tests.
- **Files modified:** `src/server/trpc/routers/theme.ts`, `tests/trpc/theme.test.ts`
- **Verification:** `bun test tests/trpc/theme.test.ts`
- **Committed in:** `ce7c5004`

---

**Total deviations:** 1 auto-fixed (1 missing critical).
**Impact on plan:** Closed an actual Web/tRPC parity gap without replacing the existing page.

## Issues Encountered

- TUI i18n catalog already exposes additional locales beyond `en/fr/ar`; tests assert required locale presence rather than exact list.

## Verification

- `bun test src/i18n/i18n.test.ts scripts/i18n-extract.test.ts tests/cli/cross-cutting-platform.test.ts tests/tui/i18n-screen.test.ts tests/tui/theme.test.ts tests/trpc/theme.test.ts` - PASS, 48 tests.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for `09-02`: accessibility gates can build on current Web/TUI settings surfaces.

## Self-Check: PASSED

---
*Phase: 09-cross-cutting-testing*
*Completed: 2026-05-06*
