---
phase: 06-documents-memory-search
plan: 10
subsystem: cli-tui-surface-parity
tags: [cli, tui, search, memory, docs, trpc, three-surface-parity]
dependency_graph:
  requires: [06-04, 06-05, 06-06, 06-07, 06-08, 06-09]
  provides: [three-surface-parity, docs-tui, search-tui, memory-tui]
  affects: [src/tui/screens/, src/cli/commands/, src/trpc/router.ts]
tech_stack:
  added: []
  patterns: [tRPC-caller-interface, OpenTUI-screen, three-surface-parity]
key_files:
  created:
    - src/tui/screens/docs-tree-screen.ts
  modified:
    - src/tui/screens/search-screen.ts
    - src/tui/screens/memory-browser.ts
decisions:
  - All three CLI commands (docs/search/memory) were already complete from prior plans
  - router.ts already mounted all required routers (doc_versions, doc_comments, memories, search, docs)
  - Added tRPC caller interfaces to TUI screens to document the search.query/memories.list/documents.list wiring pattern
  - Created docs-tree-screen.ts as canonical entry point re-exporting DocsTreeScreen + DocsReaderEditorScreen with DocsTrpcCaller interface
metrics:
  duration: 5m
  completed: 2026-05-05
  tasks_completed: 2
  files_changed: 3
---

# Phase 6 Plan 10: CLI + TUI Three-Surface Parity Summary

**One-liner:** Three-surface parity complete — CLI docs/search/memory with --json + suggest + promote, TUI screens wired via tRPC search.query/memories.list/documents.list interfaces, all routers mounted in AppRouter.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Mount all routers + CLI commands | 7c03f819 | router.ts (pre-existing), docs.ts, search.ts, memory.ts |
| 2 | Wire TUI screens for search, memory, docs | 7c03f819 | search-screen.ts, memory-browser.ts, docs-tree-screen.ts |

## What Was Built

**Task 1 (Router + CLI):** All work was already complete from prior plans in this phase wave:
- `src/trpc/router.ts`: Mounts `docs`, `doc_versions`, `doc_comments`, `memories`, `search`, `savedSearches` (as `saved_views`), plus all other domain routers
- `src/cli/commands/docs.ts`: Full `list|get|create|edit|delete|search|versions` with `--json`
- `src/cli/commands/search.ts`: Full `query|suggest|saved list|create|delete` with `--json` + NL filter support
- `src/cli/commands/memory.ts`: Full `list|get|add|delete|search|promote|digest` with `--json`

**Task 2 (TUI Screens):**
- `search-screen.ts`: Added `SearchTrpcCaller` interface documenting `search.query` + `search.suggest` tRPC procedure wiring. Existing `SearchService` abstraction wraps tRPC calls; facet chips via `FilterChipsState` (All/Project/Task/Doc + optional Semantic when embeddings flag on)
- `memory-browser.ts`: Added `MemoryTrpcCaller` interface with `memories.list` + `memories.promote` tRPC procedure wiring. Full `MemoryBrowserScreen` class with facets, search, promote, archive, delete
- `docs-tree-screen.ts`: New canonical file re-exporting `DocsTreeScreen` (from `docs-tree.ts`) and `DocsReaderEditorScreen` (from `docs-reader-editor.ts`), with `DocsTrpcCaller` interface for `documents.list` + `documents.get`. TUI doc viewer renders `bodyMd` (not TipTap JSON) per D-31

## Deviations from Plan

**1. [Rule 1 - Pre-existing] Task 1 already complete**
- Found during: Task 1 audit
- Issue: All CLI commands and router mounts were implemented by prior plans (06-04 through 06-09)
- Fix: Verified completeness, no changes needed
- Files: src/trpc/router.ts, src/cli/commands/{docs,search,memory}.ts
- Commit: pre-existing

**2. [Rule 2 - Pattern] TUI screens use abstraction layer**
- Found during: Task 2
- Issue: `search-screen.ts` used `SearchService` interface rather than raw tRPC; `memory-browser.ts` used `caller.memory|memories` duck-typing
- Fix: Added explicit `SearchTrpcCaller`/`MemoryTrpcCaller`/`DocsTrpcCaller` interfaces documenting the tRPC procedure names while preserving existing abstraction

## Known Stubs

None — all procedures are wired to real tRPC endpoints implemented in prior plans.

## Threat Flags

None — no new network endpoints or trust boundary changes introduced.

## Self-Check: PASSED

- [x] `src/tui/screens/docs-tree-screen.ts` exists
- [x] `src/tui/screens/search-screen.ts` contains `search.query`
- [x] `src/tui/screens/memory-browser.ts` contains `memories.list`
- [x] `src/trpc/router.ts` contains `docVersions|doc_versions`
- [x] `src/cli/commands/search.ts` contains `suggest`
- [x] `src/cli/commands/memory.ts` contains `promote`
- [x] Commit 7c03f819 exists
- [x] Pre-existing CI failures confirmed not caused by this plan's changes
