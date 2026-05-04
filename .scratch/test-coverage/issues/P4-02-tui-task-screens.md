---
Status: ready-for-agent
Phase: P4
Priority: high
Test-file: tests/tui/task-screens.test.ts
Framework: bun-test
Blocked-by: []
---

# TUI: Task Screens (list, board, detail, calendar, timeline)

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(tui): RED — task screens`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(tui): GREEN — task screens`

## What to test

- `src/tui/screens/task-list.ts` — `TaskListScreen`
- `src/tui/screens/task-board.ts` — `TaskBoardScreen`
- `src/tui/screens/task-detail.ts` — `TaskDetailScreen`
- `src/tui/screens/task-calendar.ts`
- `src/tui/screens/task-timeline.ts`

## Setup

```ts
const mockTasks = [
  { id: "t1", title: "Fix bug", status: "todo", assignee: "alice", labels: ["backend"] },
  { id: "t2", title: "Write docs", status: "in-progress", assignee: "bob", labels: [] },
  { id: "t3", title: "Deploy", status: "done", assignee: null, labels: [] },
];
const mockCaller = {
  tasks: {
    list: async () => mockTasks,
    bulk: async () => ({ ok: true }),
    update: async (input) => ({ ...mockTasks[0], ...input }),
    create: async (input) => ({ id: "t-new", ...input }),
  },
};
```

## TaskListScreen steps

1. Load + render — verify all 3 task titles appear
2. `j` / `↓` key — cursor moves down (verify via render highlight or state getter)
3. `k` / `↑` key — cursor moves up
4. `/` key — search mode activates; typing filters tasks by title
5. `Space` key — selects task; cursor task enters selected set
6. `b` key (bulk) — overlay opens showing selected count
7. `Enter` on bulk overlay — bulk mutation called; overlay closes
8. `Esc` — exits search / closes overlay
9. Verify scroll wraps: cursor at last task, press `j` → cursor wraps or clamps (document actual behavior)

## TaskBoardScreen steps

1. Load + render — verify 3 status columns (todo, in-progress, done) each contain correct tasks
2. `h`/`l` or arrow keys — column cursor moves between columns
3. `j`/`k` — moves within column
4. `n` key — create overlay opens
5. Fill title in overlay + `Enter` — `tasks.create` called with correct status
6. `Esc` — overlay closes without creating

## TaskDetailScreen steps

1. Render with full task data — verify title, description, assignee, labels, comments render
2. Render with minimal task (only id + title) — verify no crash on null fields
3. `e` key — switches to edit mode
4. `q` key — fires onBack callback
5. Verify subtasks and blockedBy links render when present

## TaskCalendar / TaskTimeline steps

1. Render with tasks that have dueDate — verify date grid/timeline renders without crash
2. Render with tasks missing dueDate — verify no crash
3. Navigate between time periods (arrow keys) — verify no crash

## Assertions

- [ ] TaskListScreen: all tasks visible, keyboard nav updates cursor, search filters, bulk overlay works
- [ ] TaskBoardScreen: columns correct, create overlay fires tasks.create
- [ ] TaskDetailScreen: full and minimal data render without crash, edit mode toggles
- [ ] TaskCalendar/Timeline: render without crash with and without dueDates
- [ ] All screens: `q` or `Esc` fires appropriate exit callback
