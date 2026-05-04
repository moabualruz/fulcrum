---
Status: ready-for-agent
Phase: P4
Priority: medium
Test-file: tests/tui/repos-reports.test.ts
Framework: bun-test
Blocked-by: []
---

# TUI: Repos + Reports + Activity Screens

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(tui): RED — repos reports activity screens`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(tui): GREEN — repos reports activity screens`

## What to test

- `src/tui/screens/repos.ts` — `ReposScreen`
- `src/tui/screens/reports.ts` — `ReportsScreen`
- `src/tui/screens/activity.ts` — `ActivityFeedScreen`

## Setup

```ts
const mockRepos = [
  { id: "repo-1", name: "fulcrum", slug: "fulcrum", supervisionMode: "auto", lastSyncedAt: new Date(), branchCount: 3 },
  { id: "repo-2", name: "client-app", slug: "client-app", supervisionMode: null, lastSyncedAt: null, branchCount: null },
];
const mockMetrics = {
  burndown: [{ day: 1, ideal: 10, actual: 9 }, { day: 2, ideal: 8, actual: 7 }],
  velocity: [{ sprint: "S1", points: 20 }],
  cycleTime: [2, 3, 4],
  throughput: [5, 6],
  wip: { todo: 3, "in-progress": 2, done: 8 },
  cfd: [{ date: "2026-01-01", todo: 3, "in-progress": 2, done: 0 }],
};
const mockActivity = {
  items: [
    { id: "e1", subjectKind: "task", verb: "created", actor: "alice", subjectId: "t1", createdAt: new Date() },
  ],
  total: 1, limit: 20, offset: 0,
};
```

## ReposScreen steps

1. Load + render — repos listed with name, supervisionMode, lastSyncedAt, branchCount
2. `j`/`k` — cursor moves
3. `s` key — `repos.sync({ id })` called on selected repo; result merged into list
4. `r` key (register) — overlay opens; fill name + path → `repos.register` called
5. `Enter` — `onOpenRepo` fires with repo id
6. Render with null lastSyncedAt — "never synced" placeholder, no crash

## ReportsScreen steps

1. Load + render — default report (burndown) displayed
2. `1`–`6` keys — switches to burndown/velocity/cycle/throughput/wip/cfd report
3. Each report type renders non-empty output for mock metrics
4. Render with `metrics: null` (before load) — no crash, loading indicator

## ActivityFeedScreen steps

1. Load + render — event visible with subjectKind, verb, actor, date
2. Scroll/pagination: `j` past last item → offset increments, next page fetched
3. Filter by subjectKind: `f` key → filter overlay; select filter → `audit.query` called with filter
4. Empty result → no crash

## Assertions

- [ ] ReposScreen sync calls repos.sync; register calls repos.register
- [ ] ReportsScreen 1–6 keys switch report types; all 6 types render without crash
- [ ] ActivityFeedScreen pagination loads next page on scroll past end
- [ ] All 3 screens render without crash on empty/null data
