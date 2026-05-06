---
phase: 09-cross-cutting-testing
plan: 03
subsystem: observability
tags: [telemetry, error-reporting, cli, tui, trpc, hmac]
requires:
  - phase: 09-00
    provides: Phase 09 parity matrix and RED gates
provides:
  - persisted telemetry opt-in state
  - telemetry opt-in/out/purge audit events
  - signed error reporting payload headers
  - CLI telemetry and error-log JSON actions
affects: [telemetry, errors, cli, tui, web-settings, trpc]
tech-stack:
  added: []
  patterns: [local-first telemetry, signed remote delivery, persisted opt-in settings]
key-files:
  created:
    - src/cli/telemetry.ts
  modified:
    - src/server/trpc/routers/telemetry.ts
    - tests/trpc/telemetry.test.ts
    - src/errors/reporter.ts
    - src/errors/reporter.test.ts
    - src/cli/commands/cross-cutting-platform.ts
    - tests/cli/cross-cutting-platform.test.ts
key-decisions:
  - "Telemetry opt-in is persisted via tenant_settings key telemetry.opted_in instead of a request-local Map."
  - "Remote error jobs carry X-Fulcrum-Signature in the queued job contract."
patterns-established:
  - "Telemetry router mutations record audit verbs opted_in, opted_out, and purged."
  - "CLI cross-cutting commands expose status/action JSON for observability surfaces."
requirements-completed: [XCT-03, XCT-04, TST-06]
duration: 9 min
completed: 2026-05-06
---

# Phase 09 Plan 03: Telemetry and Error Reporting Summary

**Persisted local telemetry opt-in, audited observability mutations, signed error reports, and CLI JSON parity**

## Performance

- **Duration:** 9 min
- **Started:** 2026-05-06T03:16:24Z
- **Completed:** 2026-05-06T03:25:43Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Replaced `MikroTelemetryStore` request-local opt-in `Map` with persisted `TenantSetting` storage.
- Added telemetry audit hooks for opt-in, opt-out, and purge verbs with tests.
- Hardened error report jobs with `X-Fulcrum-Signature` headers and additional PII/file-content omission tests.
- Added CLI JSON actions for telemetry `opt-in`, `opt-out`, `purge` and error-log `get`, `purge`.

## Task Commits

1. **Task 1: Persist and audit telemetry opt-in state** - `d76b38b9` (`fix(09-03)`)
2. **Task 2: Harden error reporting and remote worker contract** - `300c5bd8` (`fix(09-03)`)
3. **Task 3: Wire telemetry/error surfaces** - `91e86189` (`feat(09-03)`)

## Files Created/Modified

- `src/server/trpc/routers/telemetry.ts` - Persisted opt-in setting and audit event recording.
- `tests/trpc/telemetry.test.ts` - Persistence, scrubbing, and audit coverage.
- `src/errors/reporter.ts` - Error report job signature header contract.
- `src/errors/reporter.test.ts` - PII/file content omission and signature header tests.
- `src/cli/commands/cross-cutting-platform.ts` - Telemetry/error CLI JSON action parity.
- `src/cli/telemetry.ts` - Planned telemetry CLI compatibility export.

## Decisions Made

- Used existing `TenantSetting` entity path for opt-in persistence; no new telemetry settings table.
- Kept remote reporting optional and queue-oriented; no direct network call introduced in router or CLI paths.

## Deviations from Plan

None - plan executed exactly as written.

**Total deviations:** 0 auto-fixed.
**Impact on plan:** No scope change.

## Issues Encountered

None.

## Verification

- `bun test tests/trpc/telemetry.test.ts src/platform/remote-telemetry.test.ts src/errors/reporter.test.ts tests/trpc/errorLogs.test.ts tests/orchestration/otel-telemetry.test.ts` - PASS, 47 tests.
- `bun test tests/cli/cross-cutting-platform.test.ts tests/tui/settings-screens.test.ts` - PASS, 22 tests.
- `cd src/web && bun run web:test -- settings-telemetry-route.test.ts settings-errors-route.test.ts` - PASS, 5 tests.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Wave 1 complete. Ready for Wave 2 backup/restore, secrets/audit, migration downgrade, and shutdown gates.

## Self-Check: PASSED

---
*Phase: 09-cross-cutting-testing*
*Completed: 2026-05-06*
