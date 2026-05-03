---
Status: in-progress
Triage: AFK
Pillar: notifications-activity-audit
Blocked-by: [02-rule-engine.md, 03-default-rules-seeding.md]
PRD: .scratch/agent-os-vision/prds/12-notifications-activity-audit.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 12 section)
Decisions: [Q26, A4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Notifications / activity feed row)
Docs: []
---

# graphile-worker notify-fan-out: event → evaluate rules → write user_notifications + dedup

## Parent
PRD: `.scratch/agent-os-vision/prds/12-notifications-activity-audit.md` (Issues T12-04)

## What to build
Register graphile-worker task `notify-fan-out` (payload: `{ eventId: uuid }`). On execution: load `Event` via `eventRepo.findOneOrFail(eventId)`, call `evaluateRules(event, repositories)`, write `Notification` entities for in-app channel matches with `notificationRepo.upsertFromMatch(match)` deduped on `(user, event, rule)`, enqueue channel-specific delivery jobs (`notify-deliver-email`, `notify-deliver-webhook`, etc.) for non-in-app channels. Quiet-hours check: before enqueuing delivery jobs, check `NotificationQuietHoursRepository` for user; if in window → enqueue `notify-retry-after-quiet` job instead. Trigger: Event creation should auto-enqueue via `graphile-worker`'s `addJob` in the event write path.

## Acceptance criteria
- [ ] Schema migration: writes `Notification`; reads `Event`, `NotificationRule`, `NotificationMute`, `NotificationQuietHours`.
- [ ] tRPC procedure / module: `notify-fan-out` task registered in worker bootstrap; `addJob('notify-fan-out', {eventId})` called in `events` write path.
- [ ] Web surface: assign task → bell increment on `/inbox` within one job-queue cycle; visit `/inbox` → `user_notifications` rows visible.
- [ ] CLI command: `fulcrum notify list --unread --json` returns in-app notifications after fan-out.
- [ ] TUI screen: TUI inbox shows new notification after fan-out.
- [ ] Tests: dedup — same `(user_id, event_id, rule_id)` → one entity; muted subject → no entity; disabled rule → no entity; in-window quiet-hours → `notify-retry-after-quiet` enqueued, no delivery job; all 4 default rules fire for their triggers; RED→GREEN.

## Blocked by
- `02-rule-engine.md` — `evaluateRules()`.
- `03-default-rules-seeding.md` — rules must exist before fan-out can match.
- Pillar 1 (Foundation) — `events` write path + graphile-worker bootstrap.

## Notes / Tech-stack hints
- Wire `addJob('notify-fan-out', {eventId})` inside the Event repository create helper (Pillar 1 owns event writes; this pillar adds the `addJob` call via hook/wrapper).
- Dedup: `notificationRepo.upsertFromMatch()` enforces unique `(user, event, rule)`.
- Performance gate: 1000 rules × 100 users per event <50ms (per PRD acceptance criteria); rule-engine bulk load all rules once per job, not per user.
