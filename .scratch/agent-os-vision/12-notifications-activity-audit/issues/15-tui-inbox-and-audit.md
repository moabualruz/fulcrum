---
Status: implemented
Triage: AFK
Pillar: notifications-activity-audit
Blocked-by: [05-trpc-notify-procedures.md, 06-trpc-audit-procedures.md]
PRD: .scratch/agent-os-vision/prds/12-notifications-activity-audit.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 12 section)
Decisions: [Q-tui-lib, C4, Q26, A4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Notifications / activity feed row; Audit log row)
Docs: []
---

# TUI: Inbox screen (R/M/Enter) + Activity feed (filter chips) + Audit panel (scroll/E export) + Rules editor

## Parent
PRD: `.scratch/agent-os-vision/prds/12-notifications-activity-audit.md` (Issues T12-25, T12-26, T12-27, T12-28)

## What to build
Four TUI screens using OpenTUI consuming tRPC in-process:

1. **Inbox** (`I` keybind): unread notifications highlighted; `R` marks read; `M` mutes subject; `Enter` navigates to entity detail pane.
2. **Activity feed** (`A` keybind): project events scrollable list; filter chips (kind/verb/actor via tab-navigable filter row).
3. **Rules editor** (Settings → Notifications): CRUD list of rules; `N` new; `E` edit; `D` delete; quiet-hours section at bottom.
4. **Audit panel** (Settings → Audit): scrollable events table; `E` exports JSON to `./audit-<date>.json`; date filter input.

## Acceptance criteria
- [ ] Schema migration: N/A.
- [ ] tRPC procedure / module: all procedures consumed in-process.
- [ ] Web surface: N/A.
- [ ] CLI command: N/A.
- [ ] TUI screen: Inbox renders unread highlighted; `R` marks read (row loses highlight); `M` opens mute prompt; `Enter` navigates; Activity feed shows events with filter chip row; rules editor CRUD works; quiet-hours section saves; Audit panel scrolls; `E` writes JSON file; date filter input narrows events.
- [ ] Tests: OpenTUI smoke tests: inbox renders, `R`/`M`/`Enter` dispatch; activity feed filter chips update list; rules `N`/`D` dispatch; audit `E` writes file; RED→GREEN.

## Blocked by
- `05-trpc-notify-procedures.md` — all `notify.*` procedures.
- `06-trpc-audit-procedures.md` — `audit.query` + `audit.export`.
- Pillar 15 (TUI) — OpenTUI framework; if too immature → ratatui pane in Rust sidecar per Q-tui-lib gate.

## Notes / Tech-stack hints
- OpenTUI in-process tRPC: import router directly; no HTTP round-trip.
- Failure gate: if OpenTUI too immature for multi-panel screens → implement inbox + audit as ratatui Rust pane sharing the Unix socket RPC.
- Mute prompt in TUI: `M` opens input for "Mute until (ISO date or enter for permanent)".
- `E` audit export: `audit.export({ format: 'json', ...filters })` → stream to `./audit-<timestamp>.json` in CWD.
