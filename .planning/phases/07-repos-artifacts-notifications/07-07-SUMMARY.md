---
phase: 07-repos-artifacts-notifications
plan: 07
subsystem: notifications
tags: [notifications, fanout, rule-engine, repo-sync, artifacts, tdd, bun-test]
requires:
  - phase: 07-repos-artifacts-notifications
    provides: "07-01 repo.sync.local worker and queue definitions"
  - phase: 07-repos-artifacts-notifications
    provides: "07-04 repo sync/status routing and queue-backed repo sync tasks"
  - phase: 07-repos-artifacts-notifications
    provides: "07-06 artifact harvest edge/search/preview metadata"
provides:
  - "Canonical repo.sync.completed, repo.sync.failed, and artifact.created notification fanout envelopes"
  - "Notification fanout worker validation, optional internal queue token check, and channel delivery-plan upsert path"
  - "EventType-aware notification rule matching with mute and disabled-rule suppression covered by tests"
affects: [NTF-01, repo-sync, artifact-harvest, notification-delivery]
tech-stack:
  added: []
  patterns:
    - "Domain producers publish canonical event envelopes, then enqueue notify-fan-out by event id"
    - "Fanout worker uses event id and rule/user/channel idempotency keys for delivery plans"
key-files:
  created:
    - src/notifications/__tests__/fanout.test.ts
  modified:
    - src/notifications/fanout-worker.ts
    - src/notifications/rule-engine.ts
    - src/repos/workers/sync-local.ts
    - src/artifacts/harvest.ts
    - src/orchestration/artifact-harvest-hook.ts
key-decisions:
  - "Repo sync completion and failure use eventType/verb values repo.sync.completed and repo.sync.failed with one canonical repo subject envelope."
  - "Artifact harvest emits artifact.created only for newly persisted artifacts; duplicate harvest copies reuse the artifact and avoid duplicate fanout."
  - "Fanout delivery idempotency is keyed by event id, rule id, user id, and channel."
patterns-established:
  - "Notification events assert orgId, subjectKind, subjectId, and eventType before rule evaluation."
  - "NotificationDelivery upsert support is optional for legacy tests but used when available for per-channel idempotency."
requirements-completed: [NTF-01]
duration: 29min
completed: 2026-05-05
---

# Phase 07 Plan 07: Notification Fanout Coverage Summary

**Repo sync and artifact harvest now publish canonical notification events that flow through rule matching into idempotent notification and delivery plans.**

## Performance

- **Duration:** 29 min
- **Started:** 2026-05-05T20:44:00Z
- **Completed:** 2026-05-05T21:13:40Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Added TDD contract tests for repo sync completion, artifact creation after duplicate harvest, disabled-rule suppression, and mute suppression.
- Wired local repo sync to emit `repo.sync.completed` / `repo.sync.failed` envelopes and enqueue `notify-fan-out` by event id.
- Extended artifact harvest to emit `artifact.created` envelopes with artifact digest, MIME, size, run id, kind, and preview kind, then enqueue fanout.
- Updated fanout/rule-engine path to validate canonical event shape, support `eventType` matching, and persist per-channel delivery plans through an idempotent upsert hook.

## Task Commits

1. **Task 1: RED tests for end-to-end event fanout coverage** - `d7b4458a` (test)
2. **Task 2: Enqueue fanout for repo and artifact events through shared event types** - `c7cab2d2` (feat)
3. **Task 3: Make fanout worker and rule engine evaluate and persist delivery plans** - `3cd2b162` (feat)

## Files Created/Modified

- `src/notifications/__tests__/fanout.test.ts` - End-to-end fanout contract tests for repo, artifact, disabled-rule, and mute behavior.
- `src/repos/workers/sync-local.ts` - Canonical repo sync event envelopes and optional notification fanout queue enqueue.
- `src/artifacts/harvest.ts` - Canonical `artifact.created` envelope payload and notification fanout queue enqueue.
- `src/orchestration/artifact-harvest-hook.ts` - Exposes `artifact.created` hook metadata alongside run-artifact edge metadata.
- `src/notifications/fanout-worker.ts` - Canonical event validation, optional internal queue token check, and per-channel delivery-plan upsert.
- `src/notifications/rule-engine.ts` - EventType-aware rule matching via exported `matchEvent`.

## Decisions Made

- Kept the existing local notification entities and worker path; no Novu/Knock runtime dependency was added.
- Delivery plan idempotency uses deterministic keys instead of a new schema change, keeping this plan inside the owned file boundary.
- Artifact duplicate harvest avoids duplicate event/fanout creation because duplicate path copies reuse an existing artifact.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Existing `tests/repos/sync-local.test.ts` still expects successful local sync to emit no event. This is outdated relative to NTF-01 and 07-07 competitive requirements; the new owned fanout contract verifies the required event.
- Existing `tests/artifacts/harvest.test.ts` uses exact `toContainEqual` edge objects that omit 07-06 edge metadata fields already present on runtime edges. This was not modified because it is outside the requested ownership set.

## Verification

- `bun test src/notifications/__tests__/fanout.test.ts tests/notifications/fanout-worker.test.ts tests/notifications/rule-engine.test.ts` - PASS, 17 tests.
- `bun run --bun tsc --noEmit --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --strict --types bun src/notifications/fanout-worker.ts src/notifications/rule-engine.ts src/repos/workers/sync-local.ts src/artifacts/harvest.ts src/orchestration/artifact-harvest-hook.ts src/notifications/__tests__/fanout.test.ts` - PASS.
- `rg -n "eventType|subjectKind|subjectId|fanout|notifications\\.enqueue|enqueueNotifyFanout|notify-fan-out|artifact.created|repo.sync.completed|repo.sync.failed" src/repos/workers/sync-local.ts src/orchestration/artifact-harvest-hook.ts src/artifacts/harvest.ts src/notifications/fanout-worker.ts src/notifications/rule-engine.ts` - PASS.
- `rg -n "create\\(Notification|NotificationDelivery|Rule|matchEvent|isMuted|createNotification|channel|upsertFromMatch" src/notifications/fanout-worker.ts src/notifications/rule-engine.ts` - PASS.

## Known Stubs

None.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: internal-event-fanout | `src/notifications/fanout-worker.ts` | Fanout worker now consumes repo/artifact event payloads across the notification trust boundary; mitigated with orgId/subject/eventType assertions and optional internal queue token validation. |

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

NTF-01 is ready for downstream notification feed, bell counter, delivery worker, quiet-hours, and surface parity plans. Repo and artifact producers now publish through the same fanout worker/rule-engine path before delivery.

## Self-Check: PASSED

- Files verified present: `src/notifications/__tests__/fanout.test.ts`, `src/notifications/fanout-worker.ts`, `src/notifications/rule-engine.ts`, `src/repos/workers/sync-local.ts`, `src/artifacts/harvest.ts`, `src/orchestration/artifact-harvest-hook.ts`, `.planning/phases/07-repos-artifacts-notifications/07-07-SUMMARY.md`.
- Commits verified present: `d7b4458a`, `c7cab2d2`, `3cd2b162`.

---
*Phase: 07-repos-artifacts-notifications*
*Completed: 2026-05-05*
