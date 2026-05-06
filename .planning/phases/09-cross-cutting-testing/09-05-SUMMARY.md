---
phase: 09-cross-cutting-testing
plan: 05
subsystem: secrets-audit
tags: [secrets, audit, encryption, redaction, cli, tui, web-settings]
requires:
  - phase: 09-00
    provides: Phase 09 parity matrix and RED gates
  - phase: 09-03
    provides: Telemetry/error observability mutations
  - phase: 09-04
    provides: Backup/data import-export mutations
provides:
  - executable secret encryption/keyring invariant coverage
  - Phase 09 audit event schema registry coverage
  - secret-like audit payload key rejection
  - secrets/audit CLI, TUI, and web filter parity
affects: [secrets, audit, cli, tui, web-audit, trpc]
tech-stack:
  added: []
  patterns: [strict audit payload schemas, metadata-only secret surfaces, masked TUI presenters]
key-files:
  created: []
  modified:
    - src/platform/audit-events.ts
    - tests/trpc/audit.test.ts
    - tests/secrets/vault.test.ts
    - tests/secrets/vault-adapter.test.ts
    - src/cli/commands/cross-cutting-platform.ts
    - src/cli/commands/pillar14-generated.ts
    - tests/cli/cross-cutting-platform.test.ts
    - tests/cli/runs-notify-audit-webhooks.test.ts
    - src/tui/screens/settings-screens.ts
    - src/tui/screens/settings-screens.test.ts
    - src/web/src/routes/audit/+page.server.ts
    - src/web/src/routes/audit/+page.svelte
    - src/web/src/routes/audit/page.server.test.ts
requirements-completed: [XCT-07, XCT-11]
duration: 24 min
completed: 2026-05-06
---

# Phase 09 Plan 05: Secrets and Audit Summary

**Secret storage invariants, strict audit event schemas, and metadata-only parity surfaces**

## Performance

- **Duration:** 24 min
- **Completed:** 2026-05-06
- **Tasks:** 3
- **Files modified:** 13

## Accomplishments

- Added explicit tests for `nacl-secretbox`, `pbkdf2-sha256`, `100_000` KDF iterations, fallback key mode `0600`, and Vault/AWS provider gating.
- Registered exact Phase 09 audit keys including `credential.rotated`, `backup.restored`, `migration.downgraded`, and `system.shutdown.completed`.
- Tightened audit payload schemas to reject secret-like keys: `value`, `secret`, `token`, `password`, `apiKey`, `api_key`, `encrypted_value`.
- Added CLI support for `secrets set --name --value`, `secrets rotate --name`, audit CSV export, and audit retention set.
- Updated TUI secret rendering to display `•••• redacted` and never render encrypted values.
- Added web audit filters for actor, subject kind, verb, date range, and project.

## Task Commits

1. **Task 1: Verify secret encryption and provider fallback** - `31af2649` (`test(09-05)`)
2. **Task 2: Add audit event coverage for cross-cutting mutations** - `4f36b766` (`fix(09-05)`)
3. **Task 3: Wire secrets and audit surfaces** - `75fc0555` (`feat(09-05)`)

## Files Created/Modified

- `src/platform/audit-events.ts` - Strict schemas and Phase 09 event registry.
- `tests/trpc/audit.test.ts` - Registry and secret-like key rejection tests.
- `tests/secrets/vault.test.ts` - Algorithm/KDF invariant tests.
- `tests/secrets/vault-adapter.test.ts` - Vault/AWS flag-off fallback test.
- `src/cli/commands/cross-cutting-platform.ts` - Secrets CLI option parity.
- `src/cli/commands/pillar14-generated.ts` - Audit CSV export and retention command.
- `src/tui/screens/settings-screens.ts` - Masked secret rendering.
- `src/web/src/routes/audit/+page.server.ts` - Verb/project audit filters.
- `src/web/src/routes/audit/+page.svelte` - Audit filter controls.

## Decisions Made

- Audit payload schemas fail on secret-like keys instead of silently stripping them.
- Secret CLI commands accept explicit `--name`/`--value` for parity while preserving stdin behavior for existing flows.
- Web audit project filtering uses the existing `project_id` event column rather than payload inspection.

## Deviations from Plan

- The referenced `tests/tui/notifications-audit.test.ts` path does not exist; verification used the existing `src/tui/screens/notifications-audit.test.ts`.

**Total deviations:** 1 auto-fixed.
**Impact on plan:** No coverage loss; existing TUI audit suite was used.

## Issues Encountered

None.

## Verification

- `bun test tests/secrets/vault.test.ts tests/secrets/keyring.test.ts tests/secrets/vault-adapter.test.ts tests/trpc/audit.test.ts tests/e2e/notifications-audit-pipeline.test.ts tests/trpc/credentials.test.ts tests/cli/runs-notify-audit-webhooks.test.ts src/tui/screens/notifications-audit.test.ts src/tui/screens/settings-screens.test.ts tests/cli/cross-cutting-platform.test.ts src/web/src/routes/audit/page.server.test.ts` - PASS, 126 tests.

## User Setup Required

None.

## Next Phase Readiness

Ready for 09-06 infrastructure safety gates.

## Self-Check: PASSED

---
*Phase: 09-cross-cutting-testing*
*Completed: 2026-05-06*
