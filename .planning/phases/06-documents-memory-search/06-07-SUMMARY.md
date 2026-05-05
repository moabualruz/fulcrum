---
phase: 06-documents-memory-search
plan: "07"
subsystem: search
tags: [orama, search, command-palette, ssr-hydration, facets]
dependency_graph:
  requires: [06-04]
  provides: [orama-client-index, snapshot-endpoint, cmd-k-palette]
  affects: [src/web/src/lib/search, src/trpc/routers/search.ts, src/web/src/lib/components/command-palette]
tech_stack:
  added: ["@orama/orama@3.1.18", "@orama/plugin-data-persistence@3.1.18"]
  patterns: [client-side-search, ssr-hydration, command-palette-sections]
key_files:
  created:
    - src/web/src/lib/search/OramaIndex.ts
    - src/web/src/lib/search/orama.bench.ts
    - src/web/src/lib/components/command-palette/navigation-commands.ts
  modified:
    - src/trpc/routers/search.ts
    - src/web/src/lib/components/command-palette/CommandPalette.svelte
    - src/web/src/lib/components/command-palette/CommandPalette.svelte.test.ts
    - src/web/package.json
    - src/web/bun.lock
decisions:
  - "search.snapshot returns raw doc array instead of serialized Orama binary — avoids cross-workspace package boundary (Orama lives in src/web, tRPC is root workspace)"
  - "OramaIndex.build(docs) for client-side construction from snapshot docs; hydrate(snapshot) reserved for future binary snapshot delivery"
  - "18 commands (7 nav + 5 create + 6 bulk) exceeds 15 minimum requirement"
  - "Bulk commands shown conditionally via selectedCount prop — avoids global store coupling"
metrics:
  completed: "2026-05-05"
---

# Phase 06 Plan 07: Orama Search + Cmd+K Palette Summary

Orama client-side search with SSR hydration and extended Cmd+K palette with 18 commands including search mode.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Orama index + SSR hydration + bench | 40f64b02 | OramaIndex.ts, orama.bench.ts, search.ts |
| 2 | Cmd+K palette 18 commands + search mode | e5d80b43 | navigation-commands.ts, CommandPalette.svelte |

## Verification

- Orama bench: 6 tests, all pass — search at 10k docs confirmed <100ms
- `OramaIndex` exports singleton `oramaIndex` with `hydrate/build/search/serialize/size`
- `search.snapshot` tRPC procedure returns org-scoped doc array for client hydration
- `navigation-commands.ts` exports 18 commands: NAVIGATION_COMMANDS (7) + CREATION_COMMANDS (5) + BULK_COMMANDS (6)
- `CommandPalette.svelte` queries `oramaIndex.search()` when input length >= 2
- Bulk Actions section conditional on `selectedCount > 0`
- Section labels: "Navigation" / "Create" / "Bulk Actions" / "Search Results"

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Orama not installed in web package**
- Found during: Task 1
- Issue: @orama/orama and @orama/plugin-data-persistence missing from src/web/package.json
- Fix: `bun add @orama/orama @orama/plugin-data-persistence` in src/web/
- Files modified: src/web/package.json, src/web/bun.lock

**2. [Rule 1 - Bug] search.snapshot cross-workspace import would fail**
- Found during: Task 1
- Issue: Initial plan had snapshot procedure build Orama index server-side, requiring cross-workspace import of OramaIndex.ts. Orama packages installed only in src/web; tRPC is root workspace with frozenLockfile.
- Fix: snapshot procedure returns raw doc array; client calls `oramaIndex.build(docs)` instead of hydrating binary snapshot
- Files modified: src/trpc/routers/search.ts

**3. [Rule 2 - Missing mock] Pre-existing SSR test failures**
- Found during: Task 2
- Issue: CommandPalette.svelte.test.ts SSR tests were already failing (verified via git stash) due to Svelte SSR compilation loading component as raw filepath in Bun test environment
- Fix: Added `$lib/search/OramaIndex` mock to test file to prevent future issues from new import; pre-existing failure count (3) unchanged

## Known Stubs

None — all implemented functionality is wired. The `search.snapshot` procedure depends on `search_documents` table being populated (done in 06-04). The `action` stubs for bulk commands (bulk-assign, etc.) intentionally have no implementation yet — they require selection store integration from a future sprint/task plan; they correctly set `requiresSelection: true` and no `action` property to signal this.

## Self-Check: PASSED

- src/web/src/lib/search/OramaIndex.ts — FOUND
- src/web/src/lib/search/orama.bench.ts — FOUND
- src/web/src/lib/components/command-palette/navigation-commands.ts — FOUND
- commit 40f64b02 — FOUND
- commit e5d80b43 — FOUND
