---
Status: ready-for-agent
Triage: AFK
Pillar: api-and-webhooks
Blocked-by: [13/issues/01-trpc-router-scaffold.md]
PRD: .scratch/agent-os-vision/prds/13-api-and-webhooks.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 13 section)
Decisions: [Q28, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md ("API / webhooks / integrations" row)
Docs: [https://bun.sh/docs/api/websockets]
---

## Parent

Pillar 13 — API Surface + Webhooks + Connector Framework

## What to build

Wire Bun native `WebSocketHandler` as the transport for tRPC `subscription` procedures. Subscriptions are backed by PGlite `LISTEN/NOTIFY` channels via `PGlite.listen()`. Topics: `agent_run.<id>` (live log lines + status changes), `project.<id>.tasks` (task mutation events), `org.<id>.notifications` (new notification events). Zero external broker. If PGlite `LISTEN/NOTIFY` proves unreliable under load, the fallback is a 5s polling loop on `events WHERE id > last_seen` with no behavioral change to consumers.

- **Web**: SvelteKit client subscribes via `createTRPCProxyClient` WebSocket link; live run monitor and notification bell update without page refresh.
- **CLI**: `fulcrum runs get <id> --watch` uses same subscription transport, streams JSON lines to stdout.
- **TUI**: in-process EventEmitter bridge wraps subscription types; screen components subscribe on mount.

## Acceptance criteria

- [ ] `subscription` procedures defined for `runs.onRunUpdate(runId)`, `notify.onNewNotification()`, `orchestration.onStateChange()`.
- [ ] Integration test: emit `NOTIFY 'agent_run.<id>'` from PGlite → subscriber receives update within 500ms.
- [ ] Disconnect path: `unsubscribe()` call removes LISTEN listener cleanly; no memory leak after 1000 subscribe/unsubscribe cycles.
- [ ] Fallback: polling path enabled via `FULCRUM_FEATURES=ws-polling-fallback`; subscribers see same events within 10s; unit test covers both paths.
- [ ] `bun run ci` WebSocket integration test passes on macOS arm64 + Linux x64.

## Blocked by

- 13/issues/01-trpc-router-scaffold.md

## Notes

P13.05 maps to this slice. The in-process EventEmitter bridge for TUI (no HTTP hop) is implemented here and re-used by Pillar 15.
