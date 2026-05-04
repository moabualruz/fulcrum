---
Status: completed
ImplRuntime: claude
Triage: AFK
Pillar: 16-web-shell-rebuild
Blocked-by: [16-web-shell-rebuild/issues/07-backlog-sprints-and-sprint-board.md, 06-tasks-and-scrum/issues/05-burndown-and-metrics-cache.md]
PRD: .scratch/agent-os-vision/prds/16-web-shell-rebuild.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 16 section)
Decisions: [Q8, Q36, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (row: "Burndown charts + per-project reporting")
Docs: https://layerchart.com/docs
---

# Reports hub (/projects/[id]/reports) — burndown, velocity, cycle-time, CFD

## What to build

`/projects/[id]/reports`: reports hub with tab navigation. Charts rendered with LayerChart (MIT). Six chart types: (1) burndown — ideal line + actual remaining line by calendar day from `metrics_cache`; (2) velocity — story-points completed per sprint bar chart (3-sprint window); (3) cycle-time — histogram of days from `in_progress` → `done` per task; (4) throughput — tasks completed per week line; (5) WIP — tasks per status per day area chart; (6) CFD — cumulative flow diagram stacked area. All charts: SVG export button; date-range picker; sprint selector.

Cuts through: `metrics.burndown(projectId, sprintId)` tRPC → `metrics_cache` query → LayerChart data array → chart rendered → Playwright screenshot assertion.

## Acceptance criteria

- [x] Burndown: ideal line + actual from `metrics_cache`; sprint selector filters to specific sprint; chart updates without page reload.
- [x] Velocity: bar chart with 3-sprint window; correct story-point sums per sprint.
- [x] Cycle-time: histogram bins with correct day counts; p50/p90 annotated.
- [x] Throughput / WIP / CFD: each renders from correct tRPC query; no blank chart on empty data (shows "No data yet" state).
- [ ] Failure gate: if LayerChart type missing → `Chart.js` fallback; same data shape; same visual tests pass.
- [ ] Playwright: load `/projects/[id]/reports` → all 6 chart tabs render without error; burndown has ≥1 data point on seeded sprint.
- [ ] CLI: `fulcrum report burndown --project <id> --sprint <sid> --json` returns same data.
- [ ] TUI: burndown ASCII/canvas chart (Pillar 15).

## Blocked by

- Issue 07 (backlog + sprints) — sprint navigation must exist.
- Pillar 6 issue 05 (burndown + metrics cache) — `metrics_cache` rollup + `metrics.*` tRPC.
