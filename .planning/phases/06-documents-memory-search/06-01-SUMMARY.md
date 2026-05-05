---
phase: 06-documents-memory-search
plan: 01
subsystem: search-schema
tags: [schema, migration, entities, testing, npm]
dependency_graph:
  requires: []
  provides: [SearchDocument-expanded, Document-contextSummary, Wave0-stubs, npm-packages]
  affects: [src/db/entities/search/SearchDocument.ts, src/db/entities/docs/Document.ts, src/db/migrations/Migration20260506001.ts]
tech_stack:
  added: ["@tiptap/extension-mathematics", "mermaid", "prosemirror-changeset", "@orama/orama", "@orama/plugin-data-persistence"]
  patterns: [MikroORM-v7-ES-decorators, GIN-FTS-index, JSONB-column]
key_files:
  created:
    - src/db/migrations/Migration20260506001.ts
    - src/docs/editor.test.ts
    - src/docs/frontmatter.test.ts
    - src/web/src/lib/editor/katex.test.ts
    - src/web/src/lib/editor/mermaid.test.ts
    - src/web/src/lib/docs/tree.test.ts
    - src/web/src/lib/components/command-palette/palette.test.ts
    - src/web/src/lib/components/search/search.test.ts
    - src/product-kernel/context-bundle.test.ts
    - src/product-kernel/hybrid-scoring.test.ts
    - src/memory/context-bundle-service.test.ts
  modified:
    - src/db/entities/search/SearchDocument.ts
    - src/db/entities/docs/Document.ts
    - src/web/package.json
    - src/web/bun.lock
decisions:
  - it.todo() in bun:test requires 2-arg signature (name + fn) per bun-types; stub files use it.todo("name", () => {}) for type safety
metrics:
  duration: ~8 minutes
  completed: 2026-05-05
---

# Phase 06 Plan 01: Schema Foundation + Wave 0 Stubs Summary

SearchDocument entity expanded from 4 to 11 columns with GIN FTS index, Document entity gains contextSummary JSONB, 5 npm packages installed, 10 Wave 0 stub test files created for Nyquist compliance.

## Tasks Completed

| Task | Name | Commit |
|------|------|--------|
| 0 | Wave 0 stub test files | 80211d8b |
| 1 | npm packages + entity expansion | 8bf9b738 |
| 2 | DB migration | 0cdef8d8 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed it.todo() TypeScript signature**
- **Found during:** Task 0 verification (tsc --noEmit)
- **Issue:** bun-types declares `it.todo` as requiring 2-3 arguments; plan template used single-arg form `it.todo("name")` which fails tsc
- **Fix:** Changed all bun:test stub files to `it.todo("name", () => {})` 2-arg form
- **Files modified:** src/docs/editor.test.ts, src/docs/frontmatter.test.ts, src/product-kernel/context-bundle.test.ts, src/product-kernel/hybrid-scoring.test.ts, src/memory/context-bundle-service.test.ts
- **Commit:** 8bf9b738 (included in Task 1 commit)

## Known Stubs

All stub test files are intentional Wave 0 placeholders — no implementation behind them yet. They exist solely for Nyquist compliance tracking. Each will be filled in by subsequent plans in this phase.

## Self-Check: PASSED

- src/db/migrations/Migration20260506001.ts: FOUND
- src/db/entities/search/SearchDocument.ts title property: FOUND
- src/db/entities/docs/Document.ts contextSummary property: FOUND
- src/web/package.json @orama/orama: FOUND
- All 10 stub test files: FOUND
- Commits 80211d8b, 8bf9b738, 0cdef8d8: FOUND
