---
Status: completed
ImplRuntime: claude
Triage: AFK
Pillar: notifications-activity-audit
Blocked-by: [05-trpc-notify-procedures.md, 09-bell-counter-poll.md]
PRD: .scratch/agent-os-vision/prds/12-notifications-activity-audit.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 12 section)
Decisions: [Q26, C4, Q38]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Notifications / activity feed row)
Docs: []
---

# Web /inbox + /projects/<id>/activity: tabs, TanStack Virtual scroll, filter toolbar, per-entity activity

## Parent
PRD: `.scratch/agent-os-vision/prds/12-notifications-activity-audit.md` (Issues T12-09, T12-10, T12-11, T12-12)

## What to build
Two Web routes:

`/inbox` — "For you" tab (`user_notifications`) + "My activity" tab (`events WHERE actor_id=$me`); TanStack Virtual infinite scroll (20/page); notification card (icon + title + verb + actor + time); click navigates to entity + marks read. Bell dropdown overlay: top-5 unread + badge + "See all" link.

`/projects/<id>/activity` — all project events; filter toolbar (kind/verb/actor/date); TanStack Virtual. Per-entity activity embedded in task/doc detail page: `events WHERE entity_id=$task_id` scoped feed.

## Acceptance criteria
- [ ] Schema migration: N/A.
- [ ] tRPC procedure / module: `notify.list` + `audit.query` consumed.
- [ ] Web surface: `/inbox` shows tabs; "For you" tab 20 notifications; click marks read + navigates; "My activity" tab shows own events; `/projects/<id>/activity` filter toolbar + scrollable list; per-task activity on task detail page; Playwright: assign task → notification on `/inbox`; click → marks read, navigates.
- [ ] CLI command: N/A (Web routes only in this slice).
- [ ] TUI screen: N/A (TUI in separate slice).
- [ ] Tests: SvelteKit load function unit tests; TanStack Virtual renders 20 items; next page appends; click sets `read_at`; filter toolbar `kind=task verb=status_changed` narrows events; per-entity events scoped to `entity_id`; Playwright e2e: inbox flow; RED→GREEN.

## Blocked by
- `05-trpc-notify-procedures.md` — `notify.list`, `audit.query`.
- `09-bell-counter-poll.md` — bell dropdown overlay.

## Notes / Tech-stack hints
- TanStack Table v8 + Virtual for inbox list (headless, no table structure — card layout).
- Per-entity activity: `audit.query({ entityId: taskId, limit: 20 })` — add `entity_id` filter to `audit.query` procedure.
- "For you" vs "My activity" tabs: same component, different data source; use Svelte 5 derived store.
- Notification card: shadcn-svelte `Card` variant; icon determined by `entity_kind`.
