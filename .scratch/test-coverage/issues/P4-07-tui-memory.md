---
Status: ready-for-agent
Phase: P4
Priority: high
Test-file: tests/tui/memory.test.ts
Framework: bun-test
Blocked-by: []
---

# TUI: Memory Browser Screen

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(tui): RED — memory browser screen`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(tui): GREEN — memory browser screen`

## What to test

`src/tui/screens/memory-browser.ts` — `MemoryBrowserScreen`.

## Setup

```ts
const mockMemories = [
  { id: "m1", kind: "fact", key: "pref-lang", body: "TypeScript preferred", tags: ["dev"], importance: "high", global: true, archived: false },
  { id: "m2", kind: "note", key: null, body: "Meeting notes", tags: [], importance: "low", global: false, archived: false },
  { id: "m3", kind: "fact", key: "archived-fact", body: "Old data", tags: [], importance: "low", global: false, archived: true },
];
const mockCaller = {
  memory: {
    list: async () => mockMemories.filter(m => !m.archived),
    promote: async ({ id }) => ({}),
    search: async ({ query }) => mockMemories.filter(m => m.body.includes(query)),
    archive: async ({ id }) => ({}),
    delete: async ({ id }) => ({}),
    update: async (input) => ({ ...mockMemories[0], ...input }),
  },
};
```

## Steps

1. Load + render — non-archived memories visible; key, kind, importance shown
2. `j`/`k` — cursor navigation
3. `/` — search mode; type query → `memory.search` called with debounce; results replace list
4. `Esc` from search — clears query, list reverts to full
5. `p` key — `memory.promote` called with cursor memory id
6. `a` key — `memory.archive` called
7. `d` / `Delete` — `memory.delete` called (with confirmation overlay if present)
8. `e` key — edit overlay opens; modify body → `memory.update` called on confirm
9. Render with empty list — no crash, "no memories" shown
10. `global` badge visible on global=true memories

## Assertions

- [ ] List renders with non-archived memories only
- [ ] Search calls memory.search with typed query
- [ ] promote / archive / delete each fire correct caller
- [ ] Edit overlay populates with existing body; update called on confirm
- [ ] Global badge distinguishes global vs project memories
- [ ] Empty list renders without crash
