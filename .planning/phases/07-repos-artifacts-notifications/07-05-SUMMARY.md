---
phase: 07-repos-artifacts-notifications
plan: 05
subsystem: repos
tags: [repos, cli, web, tui, trpc, dashboard, bun-test]

requires:
  - phase: 07-repos-artifacts-notifications
    provides: "07-04 shared repo tRPC list/sync/status schemas and queue-backed syncRepo procedure"
provides:
  - "Repo parity tests across CLI, Web, and TUI"
  - "CLI repos JSON contract with dashboard row keys and read-only detail verbs"
  - "Web repo list/detail pages loaded from dashboard service shapes"
  - "TUI repo list rows and sync action using the shared syncRepo contract"
affects: [REP-07, CLI-06, TUI-07, web-repos, cli-repos, tui-repos]

tech-stack:
  added: []
  patterns:
    - "CLI list --json maps repo caller output to stable dashboard fields"
    - "Web repo loaders use repo dashboard service data and sync actions delegate to trpcProxy.repos.syncRepo"
    - "TUI repo sync prefers repos.syncRepo and preserves legacy sync fallback"

key-files:
  created:
    - src/cli/commands/repos.test.ts
    - src/tui/screens/repos.test.ts
  modified:
    - src/cli/commands/repos.ts
    - src/web/src/routes/repos/+page.server.ts
    - src/web/src/routes/repos/+page.svelte
    - src/web/src/routes/repos/[id]/+page.server.ts
    - src/web/src/routes/repos/[id]/+page.svelte
    - src/web/src/routes/repos/page.svelte.test.ts
    - src/web/src/routes/repos/[id]/page.svelte.test.ts
    - src/tui/screens/repos.ts

key-decisions:
  - "Repo CLI list JSON returns only stable parity keys: id, slug, branch, dirty, lastSyncAt, openTaskCount."
  - "Manual repo sync on CLI/Web/TUI queues through repos.syncRepo instead of mutating repo state or calling workers directly."
  - "Web repo pages consume RepoDashboardService rows/detail slices instead of product-kernel SQL."

patterns-established:
  - "Repo parity tests assert shared field names across surfaces before UI formatting details."
  - "TUI repo list renders canonical dashboard fields and keeps sync queue state local to the selected row."

requirements-completed: [REP-07]

duration: 26min
completed: 2026-05-05
---

# Phase 07 Plan 05: Repo Surface Parity Summary

**Repo CLI, Web, and TUI surfaces now share dashboard-shaped repo status and queue sync through the same tRPC contract**

## Performance

- **Duration:** 26 min
- **Started:** 2026-05-05T20:39:00Z
- **Completed:** 2026-05-05T21:05:43Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments

- Added RED parity tests covering CLI JSON shape, Web repo list/detail rendering, and TUI sync behavior.
- Wired `fulcrum repos list --json` to emit stable dashboard keys and added `branches`, `commits`, and `files` read-only verbs.
- Changed CLI `sync` and Web/TUI sync actions to call queue-backed `repos.syncRepo`.
- Replaced Web repo SQL loaders with dashboard service data for repo rows and branch/commit/file/sync-log slices.
- Updated TUI repo rows to render branch, dirty state, last sync, open task count, health, and queued sync state.

## Task Commits

1. **Task 1: RED tests for repo parity contract and JSON output** - `4962b077` (test)
2. **Task 2: Wire CLI repo commands to tRPC-backed caller contract** - `1855f4bb` (feat)
3. **Task 3: Align web and TUI repo read surfaces with dashboard service data** - `f3ba024b` (feat)
4. **Task 2 follow-up: Tighten CLI mutation helper typing** - `664cc1df` (fix)

## Files Created/Modified

- `src/cli/commands/repos.test.ts` - CLI parity tests for list JSON, detail verbs, and queued sync.
- `src/tui/screens/repos.test.ts` - TUI parity test for canonical row rendering and `syncRepo` action.
- `src/cli/commands/repos.ts` - Stable JSON row output, read-only verbs, queued sync support.
- `src/web/src/routes/repos/+page.server.ts` - Repo list loader via `getRepoDashboard`; sync action via `trpcProxy.repos.syncRepo`.
- `src/web/src/routes/repos/+page.svelte` - Dashboard row table with branch, dirty, last sync, recent commit, tasks, and health.
- `src/web/src/routes/repos/[id]/+page.server.ts` - Repo detail loader via `getRepoDashboard` and `getRepoDetail`.
- `src/web/src/routes/repos/[id]/+page.svelte` - Branch, commit, file, and sync-log detail slices.
- `src/web/src/routes/repos/page.svelte.test.ts` - Web list assertions updated to dashboard shape.
- `src/web/src/routes/repos/[id]/page.svelte.test.ts` - Web detail assertions updated to required slices.
- `src/tui/screens/repos.ts` - TUI list row and sync action aligned with canonical fields.

## Decisions Made

- CLI JSON is intentionally narrower than full repo records for `list --json`; stable parity keys prevent each surface from inventing separate names.
- `syncRepo` is the canonical sync path because it queues worker tasks and returns queued job metadata.
- Web server routes use dashboard service helpers directly for read data because that service already encapsulates batch queries, health, and detail-slice limits from 07-02.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used local TypeScript executable instead of missing global `tsc`**
- **Found during:** Plan verification
- **Issue:** `tsc --noEmit --project src/tsconfig.json` could not run because global `tsc` was not on PATH and `src/tsconfig.json` does not exist.
- **Fix:** Ran project-equivalent `bun run lint` (`bun run --bun tsc --noEmit`) after target tests.
- **Files modified:** None
- **Verification:** Root lint executed and reported only out-of-scope existing errors.
- **Committed in:** N/A

---

**Total deviations:** 1 auto-fixed (Rule 3: 1).
**Impact on plan:** Verification command was adapted to project config; implementation scope unchanged.

## Issues Encountered

- `bun run lint` fails in out-of-scope files, including `src/artifacts/__tests__/pruner.test.ts`, docs/memory/search tests, and artifact tests. No owned repo file errors remained in the final lint output.
- Concurrent 07-06 commits landed during execution; artifact files were left untouched per ownership boundary.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

REP-07 repo surface parity is ready for downstream verification. CLI/Web/TUI now expose consistent status fields and route sync through the shared queued contract.

## Verification

- `bun test src/cli/commands/repos.test.ts src/web/src/routes/repos/page.svelte.test.ts src/web/src/routes/repos/[id]/page.svelte.test.ts src/tui/screens/repos.test.ts` - PASS, 10 tests.
- `rg -n "caller\\.repos\\.list|caller\\.repos\\.sync|caller\\.repos\\.get|branches|commits|files" src/cli/commands/repos.ts` - PASS.
- `rg -n "trpcProxy|caller\\.repos|repoDashboard|openTaskCount|sync|getRepoDashboard|getRepoDetail" src/web/src/routes/repos/+page.server.ts src/web/src/routes/repos/[id]/+page.server.ts src/tui/screens/repos.ts` - PASS.
- `bun run lint` - FAIL, out-of-scope TypeScript errors in artifact/docs/memory/search/trpc test files; no owned repo file errors reported.

## Known Stubs

None. Empty arrays in tests and TUI state are initialized mutable state, not UI stubs.

## Threat Flags

None.

## Self-Check: PASSED

- Files verified present: `src/cli/commands/repos.test.ts`, `src/tui/screens/repos.test.ts`, `src/cli/commands/repos.ts`, `src/web/src/routes/repos/+page.server.ts`, `src/web/src/routes/repos/+page.svelte`, `src/web/src/routes/repos/[id]/+page.server.ts`, `src/web/src/routes/repos/[id]/+page.svelte`, `.planning/phases/07-repos-artifacts-notifications/07-05-SUMMARY.md`.
- Commits verified present: `4962b077`, `1855f4bb`, `f3ba024b`, `664cc1df`.

---
*Phase: 07-repos-artifacts-notifications*
*Completed: 2026-05-05*
