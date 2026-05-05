---
phase: 05-task-management-metrics
plan: 14
subsystem: cli-tui
tags: [cli, tui, reports, ascii-charts, task-hierarchy, three-surface-parity]
dependency_graph:
  requires: [05-06, 05-09]
  provides: [cli-report-subcommands, tui-reports-screen, ascii-chart-component]
  affects: [three-surface-parity, HIGH-04-cli-surface, D-82, D-83, D-84, D-87, D-119, D-120, D-121]
tech_stack:
  added: [asciichart]
  patterns: [dependency-injected-caller, tdd-red-green, methodology-aware-tabs]
key_files:
  created:
    - src/cli/commands/report.ts
    - src/cli/commands/report.test.ts
    - src/cli/commands/task-relate.ts
    - src/cli/commands/task-hierarchy.ts
    - src/cli/commands/comment.ts
    - src/cli/commands/project-config.ts
    - src/cli/commands/import.ts
    - src/cli/commands/export.ts
    - src/cli/commands/my-work.ts
    - src/tui/components/AsciiChart.ts
    - src/tui/screens/ReportsScreen.ts
  modified: []
decisions:
  - "Used dependency-injected caller pattern matching auth.ts for all CLI commands — enables unit tests without DB"
  - "AsciiChart wraps asciichart.plot() for line charts; hand-rolls sparkline (single-row unicode ticks)"
  - "ReportsScreen fetches methodology to select tab set — avoids showing sprint features in kanban projects"
  - "CSV import auto-maps headers to ImportedTask fields via keyword map — handles title/name/summary synonyms"
metrics:
  duration: "~45 minutes"
  completed: "2026-05-05"
  tasks_completed: 2
  files_created: 11
---

# Phase 05 Plan 14: CLI Report Subcommands + TUI ASCII Charts Summary

Three-surface parity (TSK-14): CLI report subcommand with 12 report types + task relate/hierarchy/comment/project-config/import/export/my-work. TUI ReportsScreen with methodology-aware tabs and ASCII charts via asciichart.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | CLI report + task relate commands | 6c6d360a | 9 new CLI command files |
| 2 | TUI reports screen with ASCII charts | 93267d32 | AsciiChart.ts, ReportsScreen.ts |

## What Was Built

### CLI Commands

**report.ts** — `fulcrum report <type>` with 12 types (burndown, burnup, velocity, cfd, cycle-time, lead-time, throughput, wip, workload, blocked, stale, progress). Supports `--format json|table|csv`, `--project`, `--sprint`, `--workspace`, `--days`, `--json`. All output to stdout for piping.

**task-relate.ts** — `fulcrum task relate <id> <type> <otherId>` creates relationships (blocks, blocked-by, relates-to, duplicate-of). `--list` lists relationships with table format. `--delete` removes. HIGH-04 CLI surface complete.

**task-hierarchy.ts** — `fulcrum task tree <id>` renders tree with box-drawing chars (◆●○⚠ type icons, ├──/└── structure). `fulcrum task list --type/--parent` filters. `archive`/`restore` subcommands.

**comment.ts** — `fulcrum comment list <id>` renders threaded comments with `↳` indent (up to 3 levels). `add`, `reply` (with parentCommentId), `resolve` subcommands.

**project-config.ts** — `fulcrum project config <id>` shows methodology + enabled types + transition count. `--methodology scrum|kanban|none` sets methodology. `--types` sets enabled task types.

**import.ts** — CSV import with auto column mapping (title/name/summary, status/state, etc.), dry-run preview, batch progress output. API sources prompt for env token.

**export.ts** — `fulcrum export tasks --format csv|json` exports to stdout or `--output file`. CSV uses canonical column set.

**my-work.ts** — Tasks assigned to current user grouped by urgency (OVERDUE/DUE TODAY/THIS WEEK/LATER) with priority icons.

### TUI Components

**AsciiChart.ts** — `renderSparkline()` (unicode block chars), `renderBarChart()` (ASCII horizontal bars `label [===   ] value`), `renderLineChart()` (asciichart.plot multi-series), `renderCycleTimeStats()` (P50/P85/P95 table).

**ReportsScreen.ts** — Replaces old mock-data screen. Fetches methodology via `trpc.workflows.getMethodology`, selects tab set accordingly (scrum=Sprint/Flow/Project/Team, kanban=Flow/Project/Team, none=Project/Team). Fetches data via unified metrics endpoint or individual procedures. Keyboard: Tab/1-4 switch tabs, j/k scroll, q back.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TS cast errors in resolveCaller**
- Found during: Task 2 lint run
- Issue: `factory(ctx) as Required<Opts>["caller"]` rejected by TS — type doesn't overlap
- Fix: Added `as unknown as` double cast in import.ts, my-work.ts, task-hierarchy.ts
- Files: src/cli/commands/import.ts, my-work.ts, task-hierarchy.ts
- Commit: 93267d32

## Known Stubs

None — all CLI commands call tRPC procedures or handle missing procedures gracefully (return empty result with no crash). ReportsScreen falls back cleanly when individual report procedures are absent.

## Threat Flags

None — no new network endpoints. CLI commands use existing tRPC caller pattern (authenticated via stored session). Report data scoped by projectId passed through existing tRPC authorization layer.

## TDD Gate Compliance

- RED gate: test commit created (report.test.ts with 11 failing tests before implementation)
- GREEN gate: feat commit created after RED (all 11 tests pass)
- Gate sequence: PASSED

## Self-Check: PASSED

Files exist:
- src/cli/commands/report.ts: FOUND
- src/cli/commands/task-relate.ts: FOUND
- src/cli/commands/task-hierarchy.ts: FOUND
- src/cli/commands/comment.ts: FOUND
- src/cli/commands/project-config.ts: FOUND
- src/cli/commands/import.ts: FOUND
- src/cli/commands/export.ts: FOUND
- src/cli/commands/my-work.ts: FOUND
- src/cli/commands/report.test.ts: FOUND
- src/tui/components/AsciiChart.ts: FOUND
- src/tui/screens/ReportsScreen.ts: FOUND

Commits: 6c6d360a (Task 1), 93267d32 (Task 2) — both exist in git log.
