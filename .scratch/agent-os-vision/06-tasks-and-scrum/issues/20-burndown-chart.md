---
Status: implemented
Triage: AFK
ImplRuntime: claude
Pillar: 06-tasks-and-scrum
Blocked-by: [05-metrics-cache-schema, 17-sprints-trpc-crud]
PRD: .scratch/agent-os-vision/prds/06-tasks-and-scrum.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 6 section)
Decisions: [C4, Q8]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Burndown charts + per-project reporting row)
Docs: []
---

# Burndown chart — LayerChart, ideal line vs actual, metrics_cache

## Parent
PRD: `.scratch/agent-os-vision/prds/06-tasks-and-scrum.md` (issues breakdown lines T6-07, T6-33)

## What to build
tRPC `reports.burndown(projectId, sprintId)` returning `{date, pointsRemaining,
ideal}[]`; Web burndown chart on `/projects/<id>/reports` using LayerChart (area +
line); CLI `fulcrum reports burndown --json`; TUI ASCII burndown via `asciichart`.
Reads from `metrics_cache`; falls back to on-demand computation when cache is empty.

## Acceptance criteria
- [ ] tRPC `reports.burndown({projectId, sprintId})`: reads `metrics_cache` ordered by date; computes `ideal` line per day using sprint capacity formula; returns `{date: string, pointsRemaining: number, ideal: number}[]`
- [ ] tRPC `reports.burndown` falls back to on-demand `computeMetricsOnDemand()` (slice 05) when cache is empty; same return shape
- [ ] Web: `/projects/<id>/reports` route renders burndown chart using LayerChart `<AreaChart>` for actual + `<LineChart>` for ideal; sprint selector dropdown; x-axis = sprint days, y-axis = points remaining
- [ ] Web: chart loads < 100ms from `metrics_cache` (measured in test)
- [ ] Web: tooltip on hover shows date, points remaining, ideal for that day
- [ ] CLI: `fulcrum reports burndown --project <id> --sprint <id> --json` returns typed `{date, pointsRemaining, ideal}[]`
- [ ] TUI: `R` key opens reports panel; burndown sub-view renders ASCII chart using `asciichart` (points remaining vs ideal over sprint days); sprint picker
- [ ] Tests: `reports.burndown` ideal line formula: day 0 = capacity_points, day N = 0, intermediate = linear interpolation
- [ ] Tests: fallback path returns same shape as cache path for identical fixture data
- [ ] Tests: chart load time < 100ms assertion (vitest `performance.now()`)
- [ ] Tests: CLI `--json` schema matches return type (Zod parse)

## Blocked by
- 05-metrics-cache-schema
- 17-sprints-trpc-crud

## Notes / Tech-stack hints
- Failure gate: `LayerChart` CFD chart missing + d3 compose > 3 days or SSR breaks → fall back to `Chart.js` (MIT, 67k stars) wrapper component; keep chart component behind `<BurndownChart>` facade for easy swap
- `asciichart` npm package renders ASCII sparklines; install from npm; TUI imports directly
- Sprint reports route `/projects/<id>/reports` is the hub for all report sub-views (burndown, velocity, etc.)
