---
Status: ready-for-agent
Phase: P4
Priority: high
Test-file: tests/tui/docs.test.ts
Framework: bun-test
Blocked-by: []
---

# TUI: Docs Screens (tree, reader/editor, new-doc)

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(tui): RED — docs screens`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(tui): GREEN — docs screens`

## What to test

- `src/tui/screens/docs-tree.ts` — `DocsTreeScreen`
- `src/tui/screens/docs-reader-editor.ts` — `DocsReaderEditorScreen`
- `src/tui/screens/new-doc.ts`

## Setup

```ts
const mockDocs = [
  { id: "d1", title: "README", slug: "readme", scope: "project", projectId: "p1", parentId: null, docType: "doc", updatedAt: "2026-01-01" },
  { id: "d2", title: "ADR-001", slug: "adr-001", scope: "project", projectId: "p1", parentId: "d1", docType: "adr", updatedAt: "2026-01-02" },
];
const mockCaller = {
  docs: {
    list: async () => mockDocs,
    tree: async () => mockDocs,
    create: async (input) => ({ id: "d-new", slug: "new", scope: "project", ...input }),
    delete: async () => ({}),
    get: async ({ id }) => ({ ...mockDocs[0], id, body: "# Hello\n\nContent here." }),
    update: async () => ({}),
  },
};
```

## DocsTreeScreen steps

1. Load + render — both docs in tree; child indented under parent
2. `j`/`k` — cursor navigates
3. `Enter` — `onOpenDoc` fires with doc id
4. `n` key — enters new-type mode (doc type picker)
5. Select type + `Enter` — new-title mode activates; type title + `Enter` — `docs.create` called
6. `d` key — `docs.delete` called on selected doc
7. `Esc` — exits new-doc flow back to tree mode
8. Toggle expand/collapse on parent node (if applicable)

## DocsReaderEditorScreen steps

1. Load + render in reader mode — verify title and body text appear
2. `e` key — switches to editor mode; body buffer populated
3. Edit body buffer via simulated keystrokes
4. `Ctrl+S` or `Enter` — `docs.update` called with modified body
5. `Esc` from editor — reverts to reader mode without saving
6. `q` key in reader mode — onBack fires

## new-doc screen steps

1. Render — form fields visible (title, docType, scope)
2. Fill form fields + submit — fires correct create call
3. Blank title submit — validation error shown, no create call

## Assertions

- [ ] DocsTreeScreen: tree renders with parent/child, nav works, create/delete fire correct caller
- [ ] DocsReaderEditorScreen: reader → editor toggle, update called on save, Esc reverts
- [ ] new-doc: form validation prevents empty title
