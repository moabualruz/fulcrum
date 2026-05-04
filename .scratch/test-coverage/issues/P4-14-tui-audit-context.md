---
Status: ready-for-agent
Phase: P4
Priority: medium
Test-file: tests/tui/audit-context.test.ts
Framework: bun-test
Blocked-by: []
---

# TUI: Audit + Context Preview Screens

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(tui): RED — audit context screens`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(tui): GREEN — audit context screens`

## What to test

- `src/tui/screens/audit.ts` — `AuditScreen`
- `src/tui/screens/context-preview.ts` — `ContextPreviewScreen`

## Setup

```ts
const mockAuditRows = [
  { id: "a1", kind: "task", verb: "created", actor: "alice", subjectId: "t1", subjectKind: "task", at: new Date() },
  { id: "a2", kind: "doc", verb: "updated", actor: "bob", subjectId: "d1", subjectKind: "doc", at: new Date() },
];
const mockBundle = {
  tokenBudget: 4096,
  tokenCount: 1200,
  slices: {
    memories: { tokenCount: 300, content: "Memory content here" },
    linkedDocs: { tokenCount: 400, content: "Doc content here" },
    recentRuns: { tokenCount: 500, content: "Run transcript here" },
    repoState: { tokenCount: 0, content: "" },
  },
};
```

## AuditScreen steps

1. Load + render — both audit rows visible with verb, actor, subjectKind, timestamp
2. `j`/`k` — cursor moves
3. `f` key — filter overlay opens; select kind filter → `audit.query` called with kind
4. Date range filter: set from/to → `audit.query` called with dateRange
5. `e` key or export key — `audit.export({ format: "csv" })` called; success message shown
6. Pagination: scroll past limit → offset increments, next page fetched
7. Render with empty rows — no crash, "no audit events" placeholder

## ContextPreviewScreen steps

1. Load for taskId="t1" — `context.assemble` called with `{ taskId: "t1" }`
2. Render — tokenBudget and tokenCount visible (e.g. "1200 / 4096 tokens")
3. Four panes visible: Memories, Linked docs, Recent transcripts, Repo state
4. `j`/`k` or Tab — navigate between panes
5. Selected pane expands/highlights content slice
6. Empty slice (repoState tokenCount=0) — shows "empty" or blank, no crash
7. `q` — exits screen

## Assertions

- [ ] AuditScreen renders rows with all required fields
- [ ] Filter overlay calls audit.query with correct filter args
- [ ] Export key calls audit.export
- [ ] ContextPreviewScreen shows token budget and all 4 pane labels
- [ ] Pane navigation works; empty slice renders without crash
