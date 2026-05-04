---
Status: ready-for-agent
Phase: P4
Priority: high
Test-file: tests/tui/sprints.test.ts
Framework: bun-test
Blocked-by: []
---

# TUI: Sprints Screen

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(tui): RED — sprints screen`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(tui): GREEN — sprints screen`

## What to test

`src/tui/screens/sprints.ts` — `SprintsListScreen` and `ActiveSprintBoardScreen` (also `active-sprint-board.test.ts` existing test file as reference).

## Setup

```ts
const mockSprints = [
  { id: "s1", name: "Sprint 1", status: "active", startDate: "2026-01-01", endDate: "2026-01-14" },
  { id: "s2", name: "Sprint 2", status: "planned", startDate: "2026-01-15", endDate: "2026-01-28" },
];
const mockCaller = {
  sprints: {
    list: async () => mockSprints,
    activate: async () => ({ ok: true }),
    create: async (input) => ({ id: "s-new", status: "planned", ...input }),
  },
};
```

## Steps

1. Load + render — verify both sprints appear with name and status
2. `j`/`k` — cursor navigation across sprint list
3. `Enter` on planned sprint — `sprints.activate` called with correct id
4. `n` key — create overlay opens
5. Fill sprint name in overlay + `Enter` — `sprints.create` called
6. `Esc` — overlay closes without creating
7. Active sprint indicator visible (e.g. `[active]` badge or color diff in render output)
8. Render with empty sprints list — verify "no sprints" placeholder renders without crash

## Assertions

- [ ] Both sprints visible with name + status
- [ ] Cursor moves with j/k
- [ ] Activate calls `sprints.activate` with correct id
- [ ] Create overlay opens on `n`, fires `sprints.create` on confirm
- [ ] Empty list renders without crash
- [ ] Active sprint visually differentiated
