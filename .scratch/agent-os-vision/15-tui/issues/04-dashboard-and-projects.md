---
Status: implemented
Triage: AFK
Pillar: tui
Blocked-by: [15/issues/02-global-widgets.md]
PRD: .scratch/agent-os-vision/prds/15-tui.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 15 section)
Decisions: [C4, Q28]
Vision: .scratch/agent-os-vision/VISION-GAPS.md ("Three surfaces, all shipped" row)
Docs: []
---

## Parent

Pillar 15 — TUI (OpenTUI, Full Feature Parity)

## What to build

Dashboard screen (projects count, open tasks count, recent runs, bell badge), Projects list screen (VirtualList, `c` create form overlay, `Enter` navigate, `d` delete with confirm), Project detail screen (tabs: board/list/sprints/reports/repos/docs switchable via `1`–`6` or tab key). All screens: read via tRPC `createCaller`; mutations via tRPC mutation procedures; subscription updates for bell badge + recent runs.

- **Web**: `/` dashboard, `/projects`, `/projects/[id]` are the web equivalents.
- **CLI**: `fulcrum projects list --json`, `fulcrum projects create --json` are CLI equivalents.
- **TUI**: primary surface.

## Acceptance criteria

- [x] Dashboard: shows `projectsCount`, `openTasksCount`, `runsLast7d`, `bellCount`; bell increments on new notification (subscription).
- [x] Projects list: 20 projects render in VirtualList; `c` opens create overlay; `Enter` navigates to project detail; `d` deletes with "Confirm? [y/N]".
- [x] Project detail: tabs board/list/sprints/reports/repos/docs switchable; active tab highlighted; navigation preserves scroll position.
- [x] After web creates project, TUI projects list shows it (same DB); CLI `fulcrum projects list --json` reflects.
- [x] FakeTTY snapshot for dashboard screen (strip-ansi).

## Blocked by

- 15/issues/02-global-widgets.md

## Notes

T15-16–T15-18 maps to this slice.
