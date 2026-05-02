---
Status: ready-for-agent
Triage: AFK
Pillar: 06-tasks-and-scrum
Blocked-by: [05-metrics-cache-schema, 20-burndown-chart]
PRD: .scratch/agent-os-vision/prds/06-tasks-and-scrum.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 6 section)
Decisions: [C4, Q8]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Burndown charts + per-project reporting row)
Docs: []
---

# Velocity + cycle-time + throughput + WIP + CFD reports

## Parent
PRD: `.scratch/agent-os-vision/prds/06-tasks-and-scrum.md` (issues breakdown lines T6-07, T6-34–T6-38, T6-44, T6-49)

## What to build
tRPC `reports.*` procedures for all remaining report types (velocity/cycleTime/
throughput/wip/cumulativeFlow); Web report tiles on `/projects/<id>/reports`;
CLI `fulcrum reports *`; TUI reports panel with `asciichart` for velocity.
All deterministic SQL — no LLM.

## Acceptance criteria
- [ ] tRPC `reports.velocity({projectId, sprintCount?: number})`: queries last `sprintCount` (default 3) completed sprints; returns `{sprint_name, committed_points, completed_points}[]`
- [ ] tRPC `reports.cycleTime({projectId, days?: number})`: queries `events` for `in_progress→done` transitions; returns `{task_id, title, cycle_time_hours, started_at, completed_at}[]`; computes p50/p75/p95 overlay values
- [ ] tRPC `reports.throughput({projectId, weeks?: number})`: aggregates `completed_count` from `metrics_cache` by ISO week for last `weeks` (default 12); returns `{week, tasks_completed}[]`
- [ ] tRPC `reports.wip({projectId})`: returns `{current_wip: number, sparkline: {date, wip_count}[]}` from `metrics_cache` last 7 days
- [ ] tRPC `reports.cumulativeFlow({projectId, sprintId?})`: returns `{date, status_category, count}[]` for stacked area; one row per (date, category) per day
- [ ] Web: `/projects/<id>/reports` hub renders six tiles — burndown (from slice 20), velocity stacked bar, cycle-time histogram with p50/p75/p95, throughput bar (12-week), WIP counter + sparkline, CFD stacked area — all using LayerChart
- [ ] CLI: `fulcrum reports velocity|cycletime|throughput --project <id> [--sprint <id>] --json`
- [ ] TUI: reports panel `R` — sub-views: `1` burndown, `2` velocity ASCII bar chart, `3` cycle-time (p50/p75/p95 text), `4` throughput ASCII bar, `5` WIP number + sparkline
- [ ] Tests: velocity 3-sprint window — committed vs completed values correct from fixture sprints
- [ ] Tests: cycle-time p50 = median of fixture durations (sorted array midpoint)
- [ ] Tests: throughput 12-week aggregation groups by ISO week correctly
- [ ] Tests: CFD one band per category, correct stacking (sum of all categories = total tasks at each date)
- [ ] Tests: WIP sparkline 7 days returns 7 data points

## Blocked by
- 05-metrics-cache-schema
- 20-burndown-chart (shares `/reports` route and LayerChart setup)

## Notes / Tech-stack hints
- Cycle-time queries `events WHERE verb='status_changed'` for tasks in the project; computes time between first `in_progress` event and first `done` event per task
- CFD stacking order: `unstarted → started → completed → cancelled` (category enum order)
- Velocity "committed" = sprint `capacity_points`; "completed" = actual `points_completed` from `metrics_cache`
- LayerChart CFD stacked area failure gate: if composition over 3 days → Chart.js (same facade as burndown)
