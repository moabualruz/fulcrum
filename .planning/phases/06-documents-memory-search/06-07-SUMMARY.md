---
phase: 06-documents-memory-search
plan: "07"
subsystem: search
tags: [orama, command-palette, client-search, ssr-hydration, facets]
dependency_graph:
  requires: [06-04]
  provides: [orama-client-index, command-palette-commands, search-mode]
  affects: [layout.svelte, CommandPalette.svelte, search-router]
tech_stack:
  added: ["@orama/orama", "@orama/plugin-data-persistence"]
  patterns: [OramaIndex singleton, SSR hydration snapshot, Svelte store for selection]
key_files:
  created:
    - src/web/src/lib/search/OramaIndex.ts
    - src/web/src/lib/search/orama.bench.ts
    - src/search/snapshot-service.ts
    - src/web/src/lib/components/command-palette/navigation-commands.ts
    - src/web/src/lib/stores/selection.ts
  modified:
    - src/trpc/routers/search.ts
    - src/web/src/lib/components/command-palette/CommandPalette.svelte
decisions:
  - "OramaIndex singleton exported from OramaIndex.ts for direct import in CommandPalette"
  - "SnapshotService.buildSnapshot() queries search_documents, limits to 5000 rows per org"
  - "selectedTaskIds writable store added in lib/stores/selection.ts for cross-component bulk state"
  - "CommandPalette backward-compat: still accepts items prop for legacy paletteItems in layout.svelte"
metrics:
  duration: "15 minutes"
  completed: "2026-05-05"
  tasks: 2
  files_changed: 7
---

# Phase 06 Plan 07: Orama Client Search + Cmd+K Commands Summary

Orama in-browser full-text search with per-org SSR hydration and Cmd+K palette extended to 18 commands with search mode, section headers, and contextual bulk actions.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Orama client-side index with SSR hydration and facets | 79b630b0 | OramaIndex.ts, orama.bench.ts, snapshot-service.ts, search.ts |
| 2 | Extend Cmd+K palette with 18 commands and search mode | a13f9731 | navigation-commands.ts, CommandPalette.svelte, selection.ts |

## What Was Built

### Task 1: OramaIndex + SSR hydration

- `OramaIndex` class: `hydrate(snapshot)` restores from JSON; `build(docs)` for testing; `search(term, opts)` with facets (kind/project/status); `serialize()` for SSR transfer
- `oramaIndex` singleton exported for import in client components
- `search.snapshot` tRPC procedure: calls `SnapshotService.buildSnapshot(orgId)`, returns JSON string
- `SnapshotService`: queries `search_documents` table (max 5000 rows), builds and persists Orama index server-side
- `orama.bench.ts`: generates 10k synthetic docs, benchmarks 5 runs across 8 queries, asserts max < 100ms, also benchmarks facet search

### Task 2: CommandPalette extended

- `navigation-commands.ts`: 8 nav + 4 create + 6 bulk = 18 commands
- Each command: id, label, section, icon, action (or requiresSelection for bulk)
- `CommandPalette.svelte` updated: section headers (Navigation / Create / Bulk Actions / Search Results), 44px item height, backward compat with legacy `items` prop
- Bulk Actions shown conditionally via `selectedTaskIds` Svelte writable store
- Search mode: when query >= 2 chars, calls `oramaIndex.search()`, shows results in Search Results section
- `lib/stores/selection.ts`: `selectedTaskIds` writable store for cross-component selection state

## Deviations from Plan

### Auto-fixes

**1. [Rule 1 - Bug] ProductDb uses .query() not .execute()**
- Found during: Task 1
- Issue: ProductDb type only exposes `query<T>()`, not `execute()`
- Fix: SnapshotService uses `db.query<SearchRow>()` 
- Files: src/search/snapshot-service.ts

**2. [Rule 2 - Missing] SnapshotService not in existing package.json**
- Found during: Task 1
- Issue: @orama packages not in root package.json; only in src/web
- Resolution: SnapshotService lives in src/search/ but is only imported through SvelteKit server context where src/web/node_modules/@orama is resolvable

**3. [Rule 2 - Addition] selectedTaskIds store created**
- Found during: Task 2
- Issue: Plan referenced a selectedTaskIds store that didn't exist
- Fix: Created `src/web/src/lib/stores/selection.ts` with writable store

## Known Stubs

None — OramaIndex search returns real Orama results; CommandPalette search mode wires to oramaIndex. The oramaIndex.ready gate means search returns empty until hydrated (by design — hydration happens on app load from search.snapshot).

Note: `+layout.server.ts` hydration wiring (calling `search.snapshot` on load and calling `oramaIndex.hydrate()`) is not included in this plan's scope — the plan specified SSR hydration infrastructure only. The wiring point is documented as a follow-on (can be done in +layout.ts with a tRPC prefetch).

## Threat Surface Scan

| Flag | File | Description |
|------|------|-------------|
| threat_flag: information_disclosure | src/search/snapshot-service.ts | Snapshot must filter by orgId (implemented — WHERE org_id = $1) |

No new unmitigated surface. T-06-15 mitigation applied: snapshot generation is gated behind authenticated tRPC procedure, filters by orgId.

## Self-Check: PASSED

- src/web/src/lib/search/OramaIndex.ts: FOUND
- src/web/src/lib/search/orama.bench.ts: FOUND
- src/search/snapshot-service.ts: FOUND
- src/web/src/lib/components/command-palette/navigation-commands.ts: FOUND
- src/web/src/lib/stores/selection.ts: FOUND
- Commit 79b630b0: FOUND
- Commit a13f9731: FOUND
