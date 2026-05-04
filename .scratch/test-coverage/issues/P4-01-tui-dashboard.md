---
Status: ready-for-agent
Phase: P4
Priority: high
Test-file: tests/tui/dashboard.test.ts
Framework: bun-test
Blocked-by: []
---

# TUI: Dashboard Screen

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(tui): RED — dashboard screen`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(tui): GREEN — dashboard screen`

## What to test

`src/tui/screens/dashboard.ts` — `DashboardScreen`. First screen users see. Drives project/task counts, bell count, recent runs list.

## Setup

```ts
import { DashboardScreen } from "../../src/tui/screens/dashboard.ts";
import { FakeTTY } from "../../src/tui/test-utils/fake-tty.ts";

const mockCaller = {
  dashboard: {
    summary: async () => ({
      projectsCount: 3,
      openTasksCount: 12,
      runsLast7d: 5,
      bellCount: 2,
      recentRuns: [
        { id: "run-1", agent: "claude", status: "done", startedAt: new Date("2026-01-01") },
        { id: "run-2", agent: "codex", status: "running", startedAt: null },
      ],
    }),
  },
};
```

## Steps

1. Instantiate `new DashboardScreen({ caller: mockCaller })`
2. Call `screen.load()` — verify no throw
3. Call `screen.render(fakeTTY)` — verify output contains "projects", "tasks", "runs"
4. Verify bell count (2) appears in render output
5. Verify both run rows appear with agent name and status
6. Call `screen.handleKey("r")` (refresh) — verify `summary` called again
7. Call `screen.handleKey("q")` — verify exits / onExit callback fires
8. Test with empty recentRuns — verify "no runs" or empty state renders without crash

## Assertions

- [ ] Renders without throw with mock data
- [ ] Output contains projectsCount, openTasksCount, runsLast7d, bellCount
- [ ] Recent runs listed with agent + status
- [ ] Empty recentRuns renders without crash
- [ ] `r` key triggers reload (summary called twice total)
- [ ] `q` key fires onExit callback if provided
- [ ] Subscription teardown: `destroy()` unsubscribes all TuiSubscriptions
