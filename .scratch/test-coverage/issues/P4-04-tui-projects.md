---
Status: ready-for-agent
Phase: P4
Priority: high
Test-file: tests/tui/projects.test.ts
Framework: bun-test
Blocked-by: []
---

# TUI: Projects Screen

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(tui): RED — projects screen`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(tui): GREEN — projects screen`

## What to test

`src/tui/screens/projects.ts` — `ProjectsScreen`.

## Setup

```ts
const mockProjects = [
  { id: "p1", name: "Alpha", slug: "alpha", status: "active", updatedAt: new Date() },
  { id: "p2", name: "Beta", slug: "beta", status: "archived", updatedAt: null },
];
const mockCaller = {
  projects: {
    list: async () => mockProjects,
    create: async (input) => ({ id: "p-new", slug: "new", status: "active", ...input }),
    delete: async () => ({ ok: true }),
  },
};
let navigated: string | null = null;
```

## Steps

1. Load + render — both projects visible with name and status
2. `j`/`k` — cursor moves between projects
3. `Enter` — `onNavigateProject` fires with selected project id
4. `n` key — create overlay opens
5. Type name + `Enter` in create overlay — `projects.create` called, project appears in list
6. `d` key — confirm-delete overlay opens
7. Confirm delete + `Enter` — `projects.delete` called, project removed from list
8. `Esc` on delete overlay — overlay closes without deleting
9. Scroll: load 30 projects, scroll past viewportRows — verify scrollTop advances
10. Render with empty list — "no projects" placeholder, no crash

## Assertions

- [ ] Both projects visible
- [ ] Cursor nav works
- [ ] onNavigateProject called with correct id on Enter
- [ ] Create overlay → projects.create called
- [ ] Delete overlay → projects.delete called on confirm, skipped on Esc
- [ ] Scroll advances when list exceeds viewportRows
- [ ] Empty list renders without crash
