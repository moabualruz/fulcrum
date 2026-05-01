---
Status: ready-for-agent
Triage: AFK
Pillar: tui
Blocked-by: [15/issues/05-task-list-and-kanban-board.md]
PRD: .scratch/agent-os-vision/prds/15-tui.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 15 section)
Decisions: [C4, Q7, Q8, Q36, Q28]
Vision: .scratch/agent-os-vision/VISION-GAPS.md ("Sprint / scrum / dev cycles interactive monitoring" row)
Docs: []
---

## Parent

Pillar 15 — TUI (OpenTUI, Full Feature Parity)

## What to build

Sprints list (planned/active/completed grouping, `A` start sprint → `sprints.activate`, `c` create), Sprint planning split pane (backlog left | sprint pane right; `m` moves task → `sprints.addTask`; capacity bar in header), Active sprint board (Kanban columns scoped to sprint, days-remaining header, quick-add), Sprint close flow (disposition modal for incomplete tasks — move to backlog or next sprint; retro doc creation event emitted), Reports hub (`1`–`6` key switches chart type), all six ASCII charts: Burndown (ideal + actual line from `metrics_cache`, `asciichart`), Velocity (3-sprint bar), Cycle-time (histogram + median marker), Throughput (sparkline), WIP (counters), CFD (stacked area). Failure gate for CFD stacked area: if `asciichart` missing → bespoke ANSI bar renderer (~150 LOC).

- **Web**: `/projects/[id]/sprints`, `/projects/[id]/sprint/[sid]`, `/projects/[id]/reports` equivalents.
- **CLI**: `fulcrum sprints list --json`, `fulcrum sprints activate --json`.
- **TUI**: primary surface.

## Acceptance criteria

- [ ] Sprints list: grouped by status; `A` activates selected sprint; `c` creates sprint with date/name form.
- [ ] Sprint planning: `m` moves task from backlog to sprint pane; capacity bar updates point total; `x` removes task.
- [ ] Active sprint board: only sprint's tasks; days-remaining in header; quick-add creates task in sprint.
- [ ] Sprint close: "5 incomplete tasks — move to: [Backlog] [Next Sprint]"; selection recorded; retro event emitted.
- [ ] Reports hub: keys `1`–`6` switch between burndown/velocity/cycle-time/throughput/WIP/CFD.
- [ ] Burndown: known fixture data → deterministic ASCII output (snapshot); ideal line vs actual.
- [ ] Velocity: 3-sprint bar chart; bar height proportional to points.
- [ ] After TUI sprint activate, web shows active sprint board; CLI `fulcrum sprints list --json` shows `status='active'`.

## Blocked by

- 15/issues/05-task-list-and-kanban-board.md

## Notes

T15-29–T15-37 maps to this slice.
