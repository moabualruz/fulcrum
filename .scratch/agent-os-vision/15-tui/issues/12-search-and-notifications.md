---
Status: completed
Triage: AFK
Pillar: tui
Blocked-by: [15/issues/02-global-widgets.md]
PRD: .scratch/agent-os-vision/prds/15-tui.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 15 section)
Decisions: [C4, Q27, Q26, Q28]
Vision: .scratch/agent-os-vision/VISION-GAPS.md ("Search facets / saved searches" row)
Docs: []
---

## Parent

Pillar 15 — TUI (OpenTUI, Full Feature Parity)

## What to build

Full-screen search pane (`/search`; facet checkboxes left rail via FilterChips; results grouped by kind in VirtualList; `Tab` cycles between kinds; `Enter` navigates to entity), Notifications inbox (`/inbox`; "For you" + "All" tabs; `R` mark read → `notify.markRead`; `M` mute → `notify.mute`; bell badge updates live from subscription; `Enter` navigates to source entity), Audit log panel (`/audit`; FilterChips for kind/since/until; scroll; `E` exports JSON to prompted file path via `audit.export`).

- **Web**: `/search`, `/inbox`, `/audit` web routes.
- **CLI**: `fulcrum search --json`, `fulcrum notify list --json`, `fulcrum audit query --json`.
- **TUI**: primary surface.

## Acceptance criteria

- [x] Search: query → grouped results (tasks/docs/memories/runs/artifacts); facet checkbox `Tab` cycles; `Enter` navigates to entity.
- [x] Notifications inbox: "For you" tab shows user-relevant notifications; `R` marks single notification read; bell badge in StatusBar decrements; `M` mutes source.
- [x] Bell badge live update: new notification event via subscription → badge increments within 200ms.
- [x] Audit log: filter by `kind=task` + `since` date → correct rows; `E` exports JSON to file (test with temp path).
- [ ] After TUI `R` mark-read, web inbox shows notification as read; CLI `fulcrum notify list --unread --json` excludes it.

## Blocked by

- 15/issues/02-global-widgets.md

## Notes

T15-50–T15-52 maps to this slice. Saved searches CRUD is part of Settings slice (22).
