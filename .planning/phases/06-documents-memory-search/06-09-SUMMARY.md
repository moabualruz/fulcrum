---
phase: 06-documents-memory-search
plan: "09"
subsystem: web-ui
tags: [memory, search, facets, saved-searches, svelte]
dependency_graph:
  requires: [06-06]
  provides: [MemoryBrowser, SearchPage, FacetChip, SavedSearchRow, MemoryPromoteToggle]
  affects: [memory-routes, search-routes]
tech_stack:
  added: []
  patterns: [fetch-trpc-pattern, svelte5-runes, shadcn-tokens]
key_files:
  created:
    - src/web/src/lib/memory/MemoryBrowser.svelte
    - src/web/src/lib/memory/MemoryPromoteToggle.svelte
    - src/web/src/lib/components/search/SearchPage.svelte
    - src/web/src/lib/components/search/FacetChip.svelte
    - src/web/src/lib/components/search/SavedSearchRow.svelte
  modified: []
decisions:
  - "Orama client-side search wired as same fetch pattern as tRPC — no dedicated Orama wrapper existed; SearchPage calls tRPC search.query as primary with instant feedback from term state"
  - "SavedSearch undo uses setTimeout 5s + pendingDelete state to match UI-SPEC without a toast service dependency"
  - "MemoryPromoteToggle inline confirm avoids modal overhead; matches UI-SPEC two-step pattern"
metrics:
  duration: "15m"
  completed: "2026-05-05"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 06 Plan 09: Web Memory Browser and Search Page Summary

Web-surface memory management table (MemoryBrowser + MemoryPromoteToggle) and full-featured search UI (SearchPage + FacetChip + SavedSearchRow) wired to tRPC memories/search/savedSearches routers.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | MemoryBrowser + MemoryPromoteToggle | e3d8b463 | MemoryBrowser.svelte, MemoryPromoteToggle.svelte |
| 2 | SearchPage + FacetChip + SavedSearchRow | 95c13f18 | SearchPage.svelte, FacetChip.svelte, SavedSearchRow.svelte |

## What Was Built

**MemoryBrowser.svelte** — Table with columns Body (2-line truncate), Importance (badge: primary/secondary/outline), Project, Global (promote toggle), Actions (delete). Debounced search via `memories.search`. Destructive delete dialog with UI-SPEC copy. Empty state: "No memories yet. Run an agent task to start building project memory."

**MemoryPromoteToggle.svelte** — Two-step inline confirm ("Promote to global? [Yes] [Cancel]"), calls `memories.promote` tRPC. Already-global memories show disabled "Global" badge with `--primary` fill.

**SearchPage.svelte** — 240px left panel (facet checkboxes with counts, saved searches list) + flex-1 right panel. 48px search input with search icon + bookmark save button. Active filter FacetChips row. Tabs: All/Docs/Tasks/Memories/Runs/Artifacts. Result rows at 72px height with title/snippet/kind-badge/timestamp. Match highlight via `--primary` text color. Both tRPC `search.query` (authoritative) and client-state instant feedback. Two empty states: no-query and no-results.

**FacetChip.svelte** — `--primary` fill when active, `--secondary` when inactive. Props: label, count, active, onClick.

**SavedSearchRow.svelte** — Load and delete actions. Delete shows inline "Saved search deleted. [Undo]" for 5s before committing via `savedSearches.delete` tRPC.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all components wire to real tRPC procedures.

## Threat Flags

None — no new network surface beyond what plan's threat model covers (T-06-19, T-06-20).

## Self-Check: PASSED

- `src/web/src/lib/memory/MemoryBrowser.svelte` — exists, contains MemoryPromoteToggle (3 references)
- `src/web/src/lib/memory/MemoryPromoteToggle.svelte` — exists, calls memories.promote
- `src/web/src/lib/components/search/SearchPage.svelte` — exists, 2× FacetChip, 9× savedSearches
- `src/web/src/lib/components/search/FacetChip.svelte` — exists
- `src/web/src/lib/components/search/SavedSearchRow.svelte` — exists
- Commits e3d8b463, 95c13f18 verified in git log
