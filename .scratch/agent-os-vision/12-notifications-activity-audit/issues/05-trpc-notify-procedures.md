---
Status: ready-for-agent
Triage: AFK
Pillar: notifications-activity-audit
Blocked-by: [04-fanout-worker.md]
PRD: .scratch/agent-os-vision/prds/12-notifications-activity-audit.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 12 section)
Decisions: [Q26, A6, Q28]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Notifications / activity feed row)
Docs: []
---

# tRPC notify.* procedures: list, unreadCount, markRead, markAllRead, mute, unmute, rules CRUD, channels, quietHours

## Parent
PRD: `.scratch/agent-os-vision/prds/12-notifications-activity-audit.md` (Issues T12-05)

## What to build
All `notify.*` tRPC procedures in `src/trpc/routers/notify.ts`. `list` (filters: unread, limit, offset); `unreadCount`; `markRead(id)`; `markAllRead`; `mute(subjectKind, subjectId, mutedUntil?)`; `unmute(subjectKind, subjectId)`; `rules.list/create/update/delete/get`; `channels.list/config/test`; `quietHours.get/set`. All Zod-validated; `assertPermission(ctx, 'notify:read'|'notify:write')` on each; mutations emit `events` rows where applicable (e.g. `notification_rule.created`).

## Acceptance criteria
- [ ] Schema migration: reads/writes all notification entities through repositories.
- [ ] tRPC procedure / module: all listed procedures in `notify.*` router; each has passing Zod unit test; `assertPermission` on each; unread count decrements on `markRead`.
- [ ] Web surface: `/inbox` loads from `notify.list`; bell counter from `notify.unreadCount`; `/settings/notifications` loads from `notify.rules.list` + `notify.channels.list` + `notify.quietHours.get`.
- [ ] CLI command: `fulcrum notify list --unread --json` returns `UserNotification[]`; `fulcrum notify mark-read <id>`; `fulcrum notify rules list --json`; `fulcrum notify mute task <task-id> --until 2026-12-31`.
- [ ] TUI screen: Inbox reads from `notify.list`; `R` calls `notify.markRead`; `M` calls `notify.mute`.
- [ ] Tests: each procedure Zod-validated (invalid input → error); permission checks (wrong org → forbidden); `markAllRead` clears all unread for user; `mute` creates row; `unmute` deletes row; rule CRUD round-trips; RED→GREEN.

## Blocked by
- `04-fanout-worker.md` — `user_notifications` rows needed for `list`/`unreadCount` tests.
- `01-schema-migration.md` — all notification entities.

## Notes / Tech-stack hints
- `notify.channels.test`: enqueues a test delivery for the specified channel; returns immediately (delivery is async via graphile-worker).
- `notify.unreadCount`: `notificationRepo.count({ user, readAt: null })`; cache-busted on `markRead`/`markAllRead`.
- `notify.rules.create`: validates `channels` array against registered channel list; unknown channel → 400.
