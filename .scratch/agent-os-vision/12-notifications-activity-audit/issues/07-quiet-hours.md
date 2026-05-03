---
Status: implemented
Triage: AFK
Pillar: notifications-activity-audit
Blocked-by: [01-schema-migration.md, 04-fanout-worker.md]
PRD: .scratch/agent-os-vision/prds/12-notifications-activity-audit.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 12 section)
Decisions: [Q26]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Notifications / activity feed row)
Docs: []
---

# Quiet hours: src/notifications/quiet-hours.ts — window check, retry-after-quiet job, tz support

## Parent
PRD: `.scratch/agent-os-vision/prds/12-notifications-activity-audit.md` (Issues T12-07)

## What to build
`src/notifications/quiet-hours.ts` — `isInQuietHours(userId, db): Promise<boolean>` function: reads `notification_quiet_hours` for user, resolves current time in user's `tz`, checks `start_hour`/`end_hour`/`days_of_week`. Integrated into `notify-fan-out` worker: if in quiet window → gated delivery jobs suppressed; `notification_deliveries.status='held-quiet-hours'`; graphile-worker `notify-retry-after-quiet` cron job reschedules held deliveries once window ends. In-app notifications always delivered regardless of quiet hours.

## Acceptance criteria
- [ ] Schema migration: reads `notification_quiet_hours`; updates `notification_deliveries.status`.
- [ ] tRPC procedure / module: `isInQuietHours()` called in fan-out; `notify-retry-after-quiet` graphile-worker cron registered.
- [ ] Web surface: `/settings/notifications` quiet-hours panel shows current setting and "Active now" indicator.
- [ ] CLI command: N/A (quiet hours configured via `fulcrum notify rules` or settings UI).
- [ ] TUI screen: Settings → Notifications shows quiet-hours config; `Q` key shows "Currently in quiet hours: yes/no".
- [ ] Tests: in window → delivery job not enqueued, `held-quiet-hours` status set; retry-after-quiet cron → delivery re-enqueued after window ends; outside window → proceeds normally; UTC tz test; local tz (Europe/London) test accounting for DST; in-app notification unaffected by quiet hours; RED→GREEN.

## Blocked by
- `01-schema-migration.md` — `notification_quiet_hours`, `notification_deliveries` tables.
- `04-fanout-worker.md` — fan-out calls `isInQuietHours`.

## Notes / Tech-stack hints
- Use `Intl.DateTimeFormat` for tz-aware hour extraction; no external tz library needed.
- `retry-after-quiet`: cron every 30 minutes; selects `notification_deliveries WHERE status='held-quiet-hours'`; for each, checks if quiet window ended; if yes → re-enqueue delivery job.
- `days_of_week: int[]` — 0=Sunday, 6=Saturday (JavaScript `Date.getDay()` convention).
