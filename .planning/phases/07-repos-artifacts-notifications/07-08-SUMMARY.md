---
phase: 07-repos-artifacts-notifications
plan: 08
subsystem: notifications
tags: [notifications, delivery-worker, smtp, webhook, push, quiet-hours, retry, hmac]
requires:
  - phase: 07-repos-artifacts-notifications
    provides: "07-07 canonical notification fanout events and delivery-plan rows"
provides:
  - "Notification delivery contracts for SMTP, webhook HMAC, push missing-config degradation, and quiet-hours retry"
  - "Explicit SMTP, webhook, and push channel handlers with retry metadata and secret redaction"
  - "Queue-owned notification-delivery worker plus retry cron registration"
affects: [notification-delivery, notification-settings, webhooks, queue]
tech-stack:
  added: [nodemailer@8.0.7, web-push@3.6.7]
  patterns:
    - "Channel handlers return normalized delivery metadata patches for worker persistence"
    - "Webhook signatures use timestamped HMAC over timestamp.rawBody with Fulcrum headers"
    - "Quiet-hours holds persist held-quiet-hours with nextAttemptAt and queue-owned requeue"
key-files:
  created:
    - src/notifications/__tests__/delivery-worker.test.ts
    - src/notifications/delivery-handlers/smtp.ts
    - src/notifications/delivery-handlers/webhook.ts
    - src/notifications/delivery-handlers/push.ts
    - src/notifications/delivery-worker.ts
    - src/notifications/delivery-retry.ts
    - src/notifications/quiet-hours.ts
  modified:
    - package.json
    - bun.lock
    - src/queue/index.ts
    - src/webhooks/dispatcher.ts
key-decisions:
  - "Used nodemailer@8.0.7 for SMTP and web-push@3.6.7 for real VAPID-capable push while preserving missing_config degradation when secrets are absent."
  - "Kept legacy webhook dispatcher headers for compatibility while adding required X-Fulcrum-Event, X-Fulcrum-Delivery, X-Fulcrum-Timestamp, and X-Fulcrum-Signature headers."
  - "Persisted new delivery metadata through worker update patches and existing payload/error fields rather than changing notification entity schemas in this owned-file plan."
patterns-established:
  - "Delivery workers accept injectable fetch/transport/push implementations for deterministic Bun tests."
  - "Retry scheduler moves due held deliveries from held-quiet-hours to queued without changing attemptCount."
requirements-completed: [NTF-04, NTF-05, NTF-06]
duration: 8min
completed: 2026-05-05
---

# Phase 07 Plan 08: Notification Delivery Worker Summary

**SMTP, webhook HMAC, and push notification delivery now flow through explicit handlers with retry metadata and quiet-hours requeue.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-05-05T21:15:40Z
- **Completed:** 2026-05-05T21:23:28Z
- **Tasks:** 3
- **Files modified:** 12

## Accomplishments

- Added RED delivery-worker contracts for SMTP send, webhook HMAC headers, 5xx retry metadata, push missing-config degradation, quiet-hours hold/requeue, and worker persistence.
- Implemented SMTP, webhook, and push handlers with normalized provider/status/attempt/response/error metadata.
- Added timestamped Fulcrum webhook HMAC headers and kept legacy dispatcher header behavior passing.
- Added quiet-hours evaluator, held-delivery retry helper, notification delivery worker, queue task definitions, and bootstrap cron registration.

## Task Commits

1. **Task 1: RED tests for delivery handlers, webhook HMAC, and quiet-hours retry** - `f96e6c53` (test)
2. **Task 2: Implement webhook/email/push delivery handlers with secrets hygiene** - `b73205b5` (feat)
3. **Task 3: Add quiet-hours hold and worker registration** - `7200a654` (feat)

## Files Created/Modified

- `src/notifications/__tests__/delivery-worker.test.ts` - Delivery contracts and worker retry assertions.
- `src/notifications/delivery-handlers/smtp.ts` - Nodemailer-backed SMTP handler with missing-config and redacted-error paths.
- `src/notifications/delivery-handlers/webhook.ts` - Signed webhook POST handler with required HMAC headers and retry schedule.
- `src/notifications/delivery-handlers/push.ts` - Web Push handler with VAPID gate and missing_config degradation.
- `src/notifications/delivery-worker.ts` - Queue worker task, channel dispatch, and normalized persistence patching.
- `src/notifications/delivery-retry.ts` - Due held-delivery requeue helper and retry cron definition.
- `src/notifications/quiet-hours.ts` - Quiet-hours window evaluator and nextAttemptAt calculation.
- `src/queue/index.ts` - Notification worker bootstrap and cron registration hook.
- `src/webhooks/dispatcher.ts` - Required Fulcrum webhook header constants/signing alongside legacy header compatibility.
- `package.json`, `bun.lock` - Added `nodemailer@8.0.7` and `web-push@3.6.7`.

## Decisions Made

- Used dependency-backed SMTP/Web Push handlers instead of custom protocol code.
- Missing SMTP/VAPID config returns typed failed delivery metadata with `missing_config`; no secret requirement blocks local tests.
- Kept schema changes out of this plan; worker update patches expose provider, maxAttempts, nextAttemptAt, response metadata, duration, and idempotencyKey for repositories that support those fields.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Bun install frozen lockfile**
- **Found during:** Task 2
- **Issue:** Project `bunfig.toml` sets `frozenLockfile = true`, so `bun add nodemailer@8.0.7` could not update `bun.lock`.
- **Fix:** Used a temporary Bun config with `frozenLockfile = false`, installed exact dependencies, then removed the temporary config.
- **Files modified:** `package.json`, `bun.lock`
- **Verification:** `bun test src/notifications/__tests__/delivery-worker.test.ts` and focused `tsc` passed.
- **Committed in:** `b73205b5`

---

**Total deviations:** 1 auto-fixed (Rule 3)
**Impact on plan:** Dependency install was required by the plan; no runtime scope expansion beyond SMTP/Web Push handlers.

## Issues Encountered

- `gitleaks detect --staged` is unsupported by the installed Gitleaks version. Used `git diff --cached | gitleaks detect --pipe --redact --no-banner -f json -r -` instead; no leaks found.
- Existing dirty `.planning/STATE.md`, `AGENTS.md`, and concurrently created `07-09-SUMMARY.md` were left untouched.

## Verification

- `bun test src/notifications/__tests__/delivery-worker.test.ts` - PASS, 6 tests.
- `bun test src/notifications/__tests__/delivery-worker.test.ts tests/webhooks/dispatcher.test.ts` - PASS, 13 tests.
- `bun run --bun tsc --noEmit --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --strict --types bun src/notifications/delivery-worker.ts src/notifications/delivery-retry.ts src/notifications/quiet-hours.ts src/notifications/delivery-handlers/smtp.ts src/notifications/delivery-handlers/webhook.ts src/notifications/delivery-handlers/push.ts src/notifications/__tests__/delivery-worker.test.ts src/queue/index.ts src/webhooks/dispatcher.ts` - PASS.
- `rg -n "X-Fulcrum-Event|X-Fulcrum-Delivery|X-Fulcrum-Timestamp|X-Fulcrum-Signature|held-quiet-hours|notification-delivery|nodemailer|web-push|missing_config" src/notifications src/webhooks/dispatcher.ts src/queue/index.ts package.json` - PASS.
- `git diff --cached | gitleaks detect --pipe --redact --no-banner -f json -r -` - PASS, no leaks found before Task 2 commit.

## Known Stubs

None.

## User Setup Required

Optional for real external delivery:

- SMTP: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- Web Push: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `WEB_PUSH_SUBJECT`, `WEB_PUSH_TIMEOUT_MS`

Missing config is handled as typed failed delivery metadata, not a blocker.

## Next Phase Readiness

NTF-04/05/06 delivery primitives are ready for notification UX/API surfaces. Downstream settings and delivery-history screens can read handler metadata and queue-owned retry state.

## Self-Check: PASSED

- Files verified present: `src/notifications/__tests__/delivery-worker.test.ts`, `src/notifications/delivery-handlers/smtp.ts`, `src/notifications/delivery-handlers/webhook.ts`, `src/notifications/delivery-handlers/push.ts`, `src/notifications/delivery-worker.ts`, `src/notifications/delivery-retry.ts`, `src/notifications/quiet-hours.ts`, `src/queue/index.ts`, `src/webhooks/dispatcher.ts`, `package.json`, `bun.lock`, `.planning/phases/07-repos-artifacts-notifications/07-08-SUMMARY.md`.
- Commits verified present: `f96e6c53`, `b73205b5`, `7200a654`.

---
*Phase: 07-repos-artifacts-notifications*
*Completed: 2026-05-05*
