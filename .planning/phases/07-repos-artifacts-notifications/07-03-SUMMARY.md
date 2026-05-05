---
phase: 07-repos-artifacts-notifications
plan: 03
subsystem: artifacts
tags: [artifacts, retention, pruning, mikroorm, cron]

requires:
  - phase: 07-repos-artifacts-notifications
    provides: artifact storage and harvest lifecycle
provides:
  - Artifact retention policy entity and migration
  - Policy-aware artifact prune worker with idempotent deletion
  - Tests for defaults, skip reasons, cron registration, and rerun stability
affects: [artifacts, workers, storage]

tech-stack:
  added: []
  patterns: [MikroORM entity schema, worker cron registration, policy-driven pruning]

key-files:
  created:
    - src/db/entities/artifacts/ArtifactRetentionPolicy.ts
    - src/db/migrations/Migration20260507001.ts
    - src/artifacts/__tests__/pruner.test.ts
  modified:
    - src/artifacts/pruner.ts

key-decisions:
  - "Artifact retention defaults live in code constants: project artifacts forever, scratch artifacts 90 days."
  - "Pruner marks prune intent before storage deletion, then archives metadata after blob deletion."
  - "Policy skip reasons are explicit for pinned, latest-per-ref, not-expired, org mismatch, disabled policy, forever, and already-pruned."

patterns-established:
  - "Retention policy rows are org/project scoped with kind-specific overrides and audit fields."
  - "Pruner keeps legacy repository methods as fallback while enabling policy-aware pruning."

requirements-completed: [ART-03, ART-04]

duration: 18min
completed: 2026-05-05
---

# Phase 07 Plan 03: Artifact Retention + Pruner Summary

**Artifact retention policies with GitHub/GitLab-style defaults and idempotent prune execution.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-05-05T20:32:00Z
- **Completed:** 2026-05-05T20:50:25Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Added `artifact_retention_policies` schema with org/project scope, artifact kind, retention days, keep-latest, keep-pinned, enabled, notes, audit fields, and required indexes.
- Added retention defaults in code: project artifacts keep forever, scratch artifacts prune after 90 days.
- Hardened prune execution with explicit skip reasons and idempotent marker flow before destructive storage deletion.

## Task Commits

1. **Task 1: RED tests for retention defaults and pruner idempotency** - `f6065e14` (test)
2. **Task 2: Add ArtifactRetentionPolicy entity and migration** - `27e7edcc` (feat)
3. **Task 3: Register pruner cron and make execution idempotent** - `67eff82c` (feat)

## Files Created/Modified

- `src/db/entities/artifacts/ArtifactRetentionPolicy.ts` - MikroORM retention policy entity.
- `src/db/migrations/Migration20260507001.ts` - Retention policy table, indexes, and FK migration.
- `src/artifacts/pruner.ts` - Policy-aware prune selection, skip reasons, cron registration, and idempotent marker flow.
- `src/artifacts/__tests__/pruner.test.ts` - Focused unit coverage for defaults, skip reasons, cron, and rerun stability.

## Decisions Made

- Defaults are code-owned constants, not SQL seed data, matching plan direction.
- `findExpiredForPrune` remains as compatibility fallback; policy-aware repositories can use `findRetentionPolicies` and `findArtifactsForRetention`.
- Destructive prune flow writes a prune-start marker before deleting storage, then archives metadata after delete returns.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used actual worker seam instead of missing queue path**
- **Found during:** Task 3
- **Issue:** Plan referenced `src/queue/index.ts`, but that file does not exist in this repo. Existing worker patterns use `src/workers/registry.ts` and local worker-like registration seams.
- **Fix:** Preserved `registerPrunerCron` worker-like registration in `src/artifacts/pruner.ts` and verified cron/task wiring through tests.
- **Files modified:** `src/artifacts/pruner.ts`, `src/artifacts/__tests__/pruner.test.ts`
- **Verification:** `bun test src/artifacts/__tests__/pruner.test.ts`
- **Committed in:** `67eff82c`

---

**Total deviations:** 1 auto-fixed (Rule 3)
**Impact on plan:** Scope stayed inside owned files; cron registration remains exported and test-covered.

## Issues Encountered

- `src/db/tsconfig.json` from the plan does not exist. Root `tsc --noEmit` is currently blocked by unrelated Phase 6/other active work errors plus the intentional RED state before Task 3. Focused `bun test src/artifacts/__tests__/pruner.test.ts` passed after implementation.

## Known Stubs

None. `retentionDays: null` is intentional policy semantics for forever retention.

## User Setup Required

None - no external service configuration required.

## Verification

- `bun test src/artifacts/__tests__/pruner.test.ts` — PASS, 5 tests.
- `rg -n "artifact_retention_policies|retention_days|idx_artifact_retention_policies_org|idx_artifact_retention_policies_artifact_kind|drop table" src/db/migrations/Migration20260507001.ts` — PASS.
- Stub scan over owned files — PASS, no blocking stubs.

## Next Phase Readiness

ART-03 and ART-04 are ready for downstream artifact UI/API parity work. Repository implementations can now wire policy-aware queries into `findRetentionPolicies`, `findArtifactsForRetention`, `markPruneStarted`, and `markArchived`.

## Self-Check: PASSED

Verified created/modified files exist and task commits `f6065e14`, `27e7edcc`, and `67eff82c` are present in git history.

---
*Phase: 07-repos-artifacts-notifications*
*Completed: 2026-05-05*
