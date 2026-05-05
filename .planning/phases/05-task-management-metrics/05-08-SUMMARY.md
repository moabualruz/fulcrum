---
phase: 05-task-management-metrics
plan: "08"
subsystem: web-ui
tags: [kanban, dnd, tanstack-table, virtual-scroll, sprint-planning]
dependency_graph:
  requires: [05-06]
  provides: [TaskBoard, TaskCard, TaskListView, SprintPlanningTray, WipLimitIndicator]
  affects: [project board routes, sprint planning UI]
tech_stack:
  added:
    - svelte-dnd-action (dndzone directive for kanban DnD)
    - "@tanstack/svelte-table (createSvelteTable for list view)"
    - "@tanstack/svelte-virtual (createVirtualizer for 10k+ row scroll)"
  patterns:
    - raw fetch to /api/trpc/* (matches existing ActivityFeed pattern)
    - Svelte 5 runes ($state, $derived, $effect)
    - shadcn-svelte cn() utility for conditional classes
key_files:
  created:
    - src/web/src/lib/components/tasks/TaskBoard.svelte
    - src/web/src/lib/components/tasks/TaskCard.svelte
    - src/web/src/lib/components/tasks/TaskListView.svelte
    - src/web/src/lib/components/tasks/SprintPlanningTray.svelte
    - src/web/src/lib/components/tasks/WipLimitIndicator.svelte
decisions:
  - "Used raw fetch to /api/trpc/* (no tRPC client lib in web layer — matched existing pattern)"
  - "SprintPlanningTray capacity from sprints.get (no capacityPreview endpoint exists; adapted to real schema)"
  - "TaskListView uses absolute positioning for virtual rows (TanStack Virtual pattern)"
metrics:
  duration: "~25 min"
  completed: "2026-05-05"
  tasks_completed: 2
  tasks_total: 2
  files_created: 5
---

# Phase 05 Plan 08: TaskBoard + TaskListView + SprintPlanningTray Summary

Kanban board with svelte-dnd-action DnD across configurable columns, compact/comfortable TaskCard density modes, TanStack Table list view with virtual scroll and inline editing, and sprint planning backlog tray with capacity bar.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | TaskBoard + TaskCard + WipLimitIndicator | 89727f2f | TaskBoard.svelte, TaskCard.svelte, WipLimitIndicator.svelte |
| 2 | TaskListView + SprintPlanningTray | 89727f2f | TaskListView.svelte, SprintPlanningTray.svelte |

## Decisions Made

1. **tRPC via raw fetch** — no tRPC client is installed in the web layer; existing components (ActivityFeed.svelte) use `fetch('/api/trpc/...')` pattern. Matched that.
2. **capacityPreview endpoint absent** — plan referenced `trpc.sprints.capacityPreview` but `src/server/trpc/routers/sprints.ts` only exposes `get`. SprintPlanningTray uses `sprints.get` to pull `capacityPoints` field from the sprint entity directly.
3. **Virtual row positioning** — TanStack Virtual requires `position: absolute; top: ${vRow.start}px` on each `<tr>`. Table `<tbody>` gets `height: totalSize; position: relative` wrapper.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] capacityPreview tRPC endpoint does not exist**
- **Found during:** Task 2 — plan says `trpc.sprints.capacityPreview.query` but sprints router has no such procedure
- **Fix:** SprintPlanningTray fetches `sprints.get` instead, reading `sprint.capacityPoints` to compute the same capacity bar (green <80%, yellow 80-100%, red >100%)
- **Files modified:** SprintPlanningTray.svelte
- **Commit:** 89727f2f

## Known Stubs

None — all data wired to real tRPC endpoints. TaskBoard/TaskListView load from `tasks.list`, mutations go to `tasks.update`. SprintPlanningTray uses `sprints.get` for capacity.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: tampering | TaskListView.svelte | Inline cell edits call tasks.update via tRPC — permissionedProcedure on server enforces org validation (T-05-18 mitigated) |

## Self-Check: PASSED

- TaskBoard.svelte: exists, contains `use:dndzone`
- TaskCard.svelte: exists, contains `isBlocked`, `Blocked` badge, `density`, priority colors, label chips, custom fields, subtask progress
- TaskListView.svelte: exists, contains `createSvelteTable`, `createVirtualizer`, inline edit, column visibility
- SprintPlanningTray.svelte: exists, contains `capacity`, dndzone, capacity bar
- WipLimitIndicator.svelte: exists, contains green/yellow/red thresholds
- Commit 89727f2f: present in git log
