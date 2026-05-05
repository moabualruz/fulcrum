# Phase 5: Task Management + Metrics - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-05
**Phase:** 05-task-management-metrics
**Areas discussed:** All — comprehensive competitive research pass
**Mode:** `--all --auto` initial pass → user-directed research revision

---

## Revision History

### Pass 1 (auto-generated)
- 28 shallow decisions auto-selected with recommended defaults
- User feedback: "decisions and plans does not have parity with open project or jira or plane or any of the best task management platforms it is still shallow and lacking"

### Pass 2 (research-driven)
- Spawned 3 parallel research agents:
  1. **Platform feature comparison** — Linear, Jira, ClickUp, Shortcut, Plane, Asana, GitHub Projects, Notion across 17 feature areas
  2. **Dependency/library research** — best Svelte-compatible packages per feature area to minimize custom code
  3. **Reports & analytics deep dive** — sprint/flow/project/team/quality reports + data model patterns
- User additional direction: "Research dependencies to minimize new code and maximize reusability without losing any feature target"
- User additional direction: "do not forget also research about reports not only charting all kinds of reports and charts general and per project/epic/milestone"
- Rewrote CONTEXT.md with 88 competitive-grade decisions

## Research Winners by Area

| Area | UX Benchmark | Why |
|------|-------------|-----|
| Task creation | Linear | `C` anywhere, keyboard-first, AI expand |
| Board | Linear + Jira | Linear grouping + Jira swimlanes + WIP limits |
| Side panel | Linear | Right panel preserves list context, J/K nav |
| Cmd-K | Linear | Fuzzy search across all entities, instant |
| Sprint planning | Linear | Drag from backlog tray, capacity bar |
| Sprint reports | Jira | Most complete: burndown + burnup + velocity + sprint report |
| Flow metrics | Shortcut | Best native CFD implementation |
| Gantt | ClickUp/Plane | Dep arrows + drag + zoom levels |
| Calendar | ClickUp/Asana | Drag-to-reschedule + multi-day spans |
| Bulk ops | ClickUp | Toolbar UX + custom field bulk edit + undo |
| Custom fields | ClickUp/Jira | Most types + field visibility rules |
| Keyboard shortcuts | Linear | 50+ bindings, entire workflow mouse-free |

## Key Library Decisions

| Feature | Library | Rationale |
|---------|---------|-----------|
| Kanban DnD | svelte-dnd-action | 2.1k stars, Svelte 5 native, cross-container |
| Gantt | @svar/gantt-svelte | MIT, Svelte 5 native, dep arrows, drag, 10k tested |
| Calendar | @event-calendar/core | Zero deps, month/week/day, drag, Svelte native |
| Charts | layerchart | D3-based, composable, stacked area for CFD |
| Table | @tanstack/svelte-table | Headless, column resize, sort, virtual scroll |
| Virtual scroll | @tanstack/svelte-virtual | 60fps, headless |
| Cmd-K | shadcn-svelte Command (Bits UI) | Already in stack |
| Kbd shortcuts | tinykeys | 650 bytes, framework-agnostic |
| Rich text | TipTap + extensions | Already using TipTap; add mention + task-list |
| ASCII charts | asciichart | Pure JS, sparklines + line for TUI |
| Dates | date-fns | Tree-shakable, cycle time math |

## Deferred Ideas

- Hard workflow transition rules (v2)
- Automation engine beyond status-change auto-actions (v2)
- Time tracking / timesheets (v2)
- Custom dashboard builder (v2)
- Portfolio/cross-project dashboard (v2)
- Scheduled email reports (v2)
- Multi-assignee (v2)
- Critical path in Gantt (v2)
- Monte Carlo forecasting (v2)
- Field dependencies (v2)
