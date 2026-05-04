---
Status: ready-for-agent
Phase: P4
Priority: medium
Test-file: tests/tui/search.test.ts
Framework: bun-test
Blocked-by: []
---

# TUI: Search Screens (search.ts + search-screen.ts)

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(tui): RED — search screens`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(tui): GREEN — search screens`

## What to test

- `src/tui/screens/search.ts` — `SearchScreen` (interactive keyboard-driven search)
- `src/tui/screens/search-screen.ts` — headless `SearchScreenState` with feature-flag-gated semantic toggle

## Setup

```ts
const mockResults = [
  { id: "t1", kind: "tasks" as const, title: "Fix login bug", subtitle: "project: Alpha" },
  { id: "d1", kind: "docs" as const, title: "API Reference", subtitle: null },
];
const mockCaller = {
  search: {
    query: async ({ query, facets }) => mockResults.filter(r => facets.includes(r.kind)),
    suggest: async ({ query }) => ["fix login", "fix tests"],
  },
};
```

## SearchScreen steps

1. Type query string via `handleKey` character by character — verify `search.query` called after debounce
2. Results render with kind badge and title
3. `j`/`k` — cursor navigates results
4. `Enter` on result — `onOpenEntity` fires with kind + id
5. `Tab` — cycles enabled facets (tasks → docs → memories → etc.)
6. Disabled facet hidden from results
7. `Esc` — clears query and closes palette
8. Empty query — no search call made; results cleared

## SearchScreenState (search-screen.ts) steps

1. `buildSearchScreenState({ env: {} })` — `semanticChipVisible: false`, `mode: "fts"`
2. `buildSearchScreenState({ env: { FULCRUM_FEATURES: "embeddings" } })` — `semanticChipVisible: true`
3. Toggle semantic chip — `mode` switches to "hybrid"
4. Toggle again — `mode` reverts to "fts"

## Assertions

- [ ] SearchScreen fires query after debounce on each keystroke
- [ ] Facet cycling filters results correctly
- [ ] onOpenEntity fires with correct kind/id
- [ ] SearchScreenState: semanticChip hidden when embeddings flag OFF
- [ ] SearchScreenState: mode toggles fts ↔ hybrid when chip toggled
