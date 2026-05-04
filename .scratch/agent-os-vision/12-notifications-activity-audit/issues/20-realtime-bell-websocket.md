---
Status: completed
ImplRuntime: claude
Triage: AFK
Pillar: notifications-activity-audit
Blocked-by: [09-bell-counter-poll.md]
PRD: .scratch/agent-os-vision/prds/12-notifications-activity-audit.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 12 section)
Decisions: [C1, D5]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Notifications / activity feed row)
Docs: []
---

# Gated: real-time-collab-server — Hocuspocus WebSocket bell badge updates <2s

## Parent
PRD: `.scratch/agent-os-vision/prds/12-notifications-activity-audit.md` (Always-on: Bell-icon counter WebSocket path; issues T12-38; gated table)

## What to build
When `FULCRUM_FEATURES=real-time-collab-server` ON: Hocuspocus WebSocket server broadcasts `user:{userId}:unreadCount` awareness update on each `user_notifications` insert (called from `notify-fan-out` task). SvelteKit layout connects to Hocuspocus; receives updates; updates bell badge reactively (<2s). 60s poll continues as fallback when flag OFF. Badge update does NOT require page reload.

## Acceptance criteria
- [ ] Schema migration: N/A.
- [ ] tRPC procedure / module: `notify-fan-out` calls `hocuspocusServer.broadcastAwareness(userId, {unreadCount})` when flag ON.
- [ ] Web surface: bell badge updates <2s after new notification when flag ON (Playwright: trigger event → badge increments without page reload); flag OFF → badge updates within 60s via poll.
- [ ] CLI command: N/A.
- [ ] TUI screen: N/A (WebSocket is browser-only).
- [ ] Tests: flag OFF → 60s poll only, no WebSocket connection; ON → mock Hocuspocus server → badge update <2s (measured in test harness); flag flip OFF while connected → graceful disconnect + fall back to poll; RED→GREEN.

## Blocked by
- `09-bell-counter-poll.md` — poll path must exist as fallback.
- Pillar 6/7 (Tasks/Docs) — `real-time-collab-server` flag (shared flag); Hocuspocus server setup in those pillars; this slice extends server with notification awareness.

## Notes / Tech-stack hints
- `real-time-collab-server` flag shared with Pillar 7 (Yjs collab) — same Hocuspocus server instance.
- Hocuspocus awareness: use per-user awareness state `{unreadCount: N}` broadcast via server extension.
- Client subscription: `provider.awareness.on('change', ...)` → extract `unreadCount` for current userId.
- Failure gate: if Hocuspocus awareness broadcasting causes performance issues → use SSE (Server-Sent Events) as alternative push mechanism.
