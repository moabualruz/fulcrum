---
phase: 06-documents-memory-search
plan: "08"
subsystem: docs-ui
tags: [docs, versioning, comments, drag-drop, tRPC, svelte]
dependency_graph:
  requires: ["06-02", "06-05"]
  provides: ["DocVersionTimeline", "DocCommentPanel", "DocsSidebar", "docVersionsRouter"]
  affects: ["src/trpc/routers/doc-versions.ts", "src/web/src/lib/components/docs/"]
tech_stack:
  added: []
  patterns: ["svelte-dnd-action dndzone", "shadcn Sheet right panel", "prosemirror-changeset diff via diffDocVersionsHtml", "inline confirm row (no dialog)", "tRPC permissionedProcedure"]
key_files:
  created:
    - src/trpc/routers/doc-versions.ts
    - src/trpc/routers/doc-versions.test.ts
    - src/web/src/lib/components/docs/DocVersionTimeline.svelte
    - src/web/src/lib/components/docs/DocCommentPanel.svelte
    - src/web/src/lib/components/docs/DocsSidebar.svelte
  modified: []
decisions:
  - "Used reconstructDocVersion (existing) for restore/diff — no new reconstruction logic"
  - "T-06-17: restore creates new version with restoreOf linkage; originals never deleted"
  - "T-06-18: diff uses only server-side stored snapshots"
  - "DocsSidebar uses flat DND list with depth-tracking for parent recalculation on drop"
metrics:
  duration: "~25 min"
  completed: "2026-05-05"
  tasks_completed: 2
  files_created: 5
---

# Phase 06 Plan 08: Doc Version Timeline, Comments, and Sidebar Summary

Doc UX features: version history with inline diff, threaded inline comments, and drag-drop doc tree sidebar.

## Tasks Completed

| Task | Commit | Files |
|------|--------|-------|
| 1: DocVersionTimeline + doc-versions tRPC router | 5553543b | doc-versions.ts, doc-versions.test.ts, DocVersionTimeline.svelte |
| 2: DocCommentPanel + DocsSidebar drag-drop tree | c6a505cb | DocCommentPanel.svelte, DocsSidebar.svelte |

## What Was Built

**doc-versions tRPC router** (`src/trpc/routers/doc-versions.ts`):
- Replaced stub with real `list`, `restore`, `diff` procedures
- `list`: returns versions ordered DESC with author name/id
- `restore`: reconstructs content via `reconstructDocVersion`, saves new version with `restoreOf` audit link (T-06-17)
- `diff`: calls `diffDocVersionsHtml` on server-side snapshots (T-06-18)
- 7 unit tests passing

**DocVersionTimeline.svelte** (`src/web/src/lib/components/docs/DocVersionTimeline.svelte`):
- shadcn `Sheet` right panel (360px)
- Version list: relative timestamp, author avatar initial, v{num} label
- Current version: filled circle + "Current" badge, no restore button
- "Show diff" toggle per item: fetches diff on demand, renders green/red `<del>`/`<ins>` HTML
- Restore: inline confirm row "Restore? [Confirm] [Cancel]" (not a dialog)

**DocsSidebar.svelte** (`src/web/src/lib/components/docs/DocsSidebar.svelte`):
- `svelte-dnd-action` `dndzone` for drag-drop reorder
- Recursive tree flattened to DND items with depth tracking
- 12px indent per nesting level
- `grip-vertical` drag handle (opacity 0→1 on hover)
- 2px `--primary` drop target outline
- On finalize: calls `onUpdatePosition` (wired to `documents.updatePosition` tRPC)
- Expand/collapse chevron for nodes with children
- Active node: `bg-secondary` + `border-l-2 border-primary`
- Inline new doc name input (+ button in header)

**DocCommentPanel.svelte** (`src/web/src/lib/components/docs/DocCommentPanel.svelte`):
- 300px inline panel (not a sheet — pushes editor content via flex layout)
- Root comments + replies grouped by thread
- `anchorRange` shown as "Anchored to selection" badge
- Threading: replies indented 24px, max 2 levels rendered
- Resolve button: `CheckIcon` calls `onResolve` → `docComments.resolve` tRPC
- Resolved comments collapsed to 1-line summary (expandable)
- New comment compose + reply compose with Cmd/Ctrl+Enter submit

## Threat Mitigations Applied

| ID | Status |
|----|--------|
| T-06-17 | Mitigated: restore creates new version with restoreOf; originals never deleted |
| T-06-18 | Mitigated: diff uses server-side stored snapshots only |

## Deviations from Plan

None — plan executed as written.

## Known Stubs

- `DocsSidebar.svelte`: `onUpdatePosition` prop is callback-based; actual tRPC wiring is done by the parent page component (not inside the sidebar). Pattern matches existing TaskBoard/BoardColumn approach.
- `DocVersionTimeline.svelte`: `onFetchDiff` and `onRestore` are callback props; tRPC calls wired by parent. Data not fetched inside the component.
- `DocCommentPanel.svelte`: `onResolve`/`onAddComment` are callback props; tRPC calls wired by parent.

These are intentional — the components are presentation-layer with callback props for testability and reuse. Parent doc pages wire the tRPC calls.

## Self-Check: PASSED

Files exist:
- src/trpc/routers/doc-versions.ts ✓
- src/trpc/routers/doc-versions.test.ts ✓
- src/web/src/lib/components/docs/DocVersionTimeline.svelte ✓
- src/web/src/lib/components/docs/DocCommentPanel.svelte ✓
- src/web/src/lib/components/docs/DocsSidebar.svelte ✓

Commits: 5553543b, c6a505cb ✓

Tests: 7/7 pass ✓
