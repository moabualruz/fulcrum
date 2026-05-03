---
Status: implemented
Triage: AFK
Pillar: notifications-activity-audit
Blocked-by: [05-trpc-notify-procedures.md]
PRD: .scratch/agent-os-vision/prds/12-notifications-activity-audit.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 12 section)
Decisions: [Q26, C1]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Notifications / activity feed row)
Docs: []
---

# Bell-icon counter: 60s poll (always-on) + WebSocket update (real-time-collab-server gated) + badge clear

## Parent
PRD: `.scratch/agent-os-vision/prds/12-notifications-activity-audit.md` (Always-on: Bell-icon counter; issues T12-08)

## What to build
Bell icon in SvelteKit layout header showing unread count badge. Always-on path: Svelte 5 `setInterval(60000)` calling `notify.unreadCount` tRPC on page load and every 60s; badge clears on inbox visit. Gated path (`real-time-collab-server`): Hocuspocus WebSocket replaces poll; server pushes `unreadCount` update on each `user_notifications` insert; badge updates <2s. Clicking bell opens top-5 unread dropdown (pre-fetch); "See all" navigates to `/inbox`.

## Acceptance criteria
- [ ] Schema migration: N/A — reads `user_notifications`.
- [ ] tRPC procedure / module: `notify.unreadCount` procedure used; WebSocket path via Hocuspocus awareness update (gated).
- [ ] Web surface: bell icon in header shows badge count; badge updates within 60s of new notification; badge clears on `/inbox` visit; dropdown shows top-5 unread with kind icons; "See all" navigates; Playwright: create event → badge increments; visit inbox → badge clears.
- [ ] CLI command: N/A (bell is Web/TUI UI element).
- [ ] TUI screen: TUI status bar shows unread count; updates on `notify.unreadCount` poll (1-minute interval in TUI).
- [ ] Tests: count updates on new `user_notifications` insert; clears on `markAllRead`; WebSocket OFF → 60s poll; WebSocket ON → badge updates <2s (mock WebSocket); RED→GREEN.

## Blocked by
- `05-trpc-notify-procedures.md` — `notify.unreadCount`, `notify.list` (top-5 dropdown).

## Notes / Tech-stack hints
- 60s poll: Svelte `onMount` + `setInterval`; cleanup on `onDestroy`.
- `real-time-collab-server` gated path: Hocuspocus awareness broadcasts `{userId, unreadCount}` on fan-out completion; client subscribes on flag ON.
- Badge visual: shadcn-svelte `Badge` variant `destructive` for count >0; hidden when 0.
- Top-5 dropdown: lazy-loaded on bell click (single `notify.list` call with `--limit 5 --unread`).
