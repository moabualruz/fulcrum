---
phase: 06-documents-memory-search
plan: "04"
subsystem: search
tags: [search, fts, trpc, rest, saved-searches, indexers]
dependency_graph:
  requires: [06-01]
  provides: [search-query-service, saved-searches-trpc, expanded-indexers]
  affects: [src/trpc/routers/search.ts, src/api/routes/search.ts, src/search/indexers/document.ts]
tech_stack:
  added: []
  patterns: [PGlite FTS with ts_rank/plainto_tsquery, needle-di Injectable service, parameterized SQL]
key_files:
  created:
    - src/search/query-service.ts
    - src/search/query-service.test.ts
    - src/db/entities/search/SavedSearch.ts
    - src/trpc/routers/saved-searches.ts
  modified:
    - src/trpc/routers/search.ts
    - src/api/routes/search.ts
    - src/search/indexers/document.ts
    - src/search/indexers/base.ts
decisions:
  - "SearchQueryService uses facetWhere from same WHERE clauses to avoid param drift"
  - "SavedSearch entity maps to saved_views table (view_type=search) — avoids duplicate table"
  - "suggest() uses ILIKE for now; can be replaced with FTS later without API change"
metrics:
  duration: "~20min"
  completed: "2026-05-05"
  tasks_completed: 2
  files_changed: 8
---

# Phase 06 Plan 04: Search Query Service + Saved Searches Summary

**One-liner:** PGlite FTS query service with ts_rank/facets/filters, wired to tRPC+REST, with SavedSearch entity and dedicated saved-searches router.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | SearchQueryService + tRPC/REST wiring (TDD) | fc94dbbe | query-service.ts, query-service.test.ts, routers/search.ts, api/routes/search.ts |
| 2 | Expanded indexers + SavedSearch entity + saved-searches router | 9e6ac3fd | indexers/document.ts, indexers/base.ts, SavedSearch.ts, routers/saved-searches.ts |

## What Was Built

### SearchQueryService (`src/search/query-service.ts`)
- `query(orgId, input)` — parameterized PGlite FTS using `plainto_tsquery` + `ts_rank` + `ts_headline`
- Dynamic WHERE clause builder for kinds/projectIds/statuses/dateRange filters
- `facets=true` triggers 3 parallel COUNT GROUP BY queries (kind/project/status)
- `suggest(orgId, term, limit)` — ILIKE prefix match for autocomplete

### tRPC Router (`src/trpc/routers/search.ts`)
- `search.query` procedure replaces stub — full `SearchQueryInputSchema` with limit max=100
- `search.suggest` procedure returns `{ suggestions: string[] }`
- Existing savedList/savedCreate/savedUpdate/savedDelete/recordClick preserved unchanged

### REST Route (`src/api/routes/search.ts`)
- Replaced hardcoded `STUB_RESULTS` with real `SearchQueryService.query()` call
- Resolves `orgId` + `db` from Hono request context

### DocumentIndexer expansion (`src/search/indexers/document.ts`)
- Now populates `status` and `updatedAt` expanded columns on upsert
- Graceful fallback via `tableColumns()` for older schemas without these columns

### SavedSearch entity (`src/db/entities/search/SavedSearch.ts`)
- MikroORM v7 ES Stage-3 decorators on `saved_views` table with `view_type='search'`
- Fields: id, org, orgId, userId, name, queryJson, scope, projectId, viewType, createdAt, updatedAt

### savedSearchesRouter (`src/trpc/routers/saved-searches.ts`)
- Standalone router with `list`, `create`, `update`, `delete` procedures
- All use `permissionedProcedure` pattern
- Delegates to existing `src/search/saved-searches.ts` service functions

## Deviations from Plan

### Auto-fixed Issues

None — plan executed as written.

### Notes
- `SavedSearch` entity maps to `saved_views` table rather than a new `saved_searches` table — the `SavedView` entity already covers this use case and a duplicate table would be redundant. The raw SQL in `product-kernel/saved-searches.ts` remains (different legacy table); the new router deliberately bypasses it.
- `SearchQueryService` takes `orgId` as first param (not embedded in input struct) to match the pattern established in the plan's interface definition.

## Security

| Threat | Mitigation | Status |
|--------|-----------|--------|
| T-06-07 Cross-org results | org_id=$1 on every query | Implemented |
| T-06-08 SQL injection | All user input as params ($N) | Implemented |
| T-06-09 DoS unbounded query | limit max=100 in Zod schema | Implemented |

## Known Stubs

None — all acceptance criteria satisfied with real implementations.

## Self-Check: PASSED

- `src/search/query-service.ts` — exists, contains `ts_rank` and `plainto_tsquery`
- `src/trpc/routers/search.ts` — contains `queryService` call (SearchQueryService)
- `src/api/routes/search.ts` — no hardcoded array, delegates to SearchQueryService
- `src/trpc/routers/saved-searches.ts` — exports router with list/create/delete procedures
- `src/db/entities/search/SavedSearch.ts` — exists with MikroORM decorators
- 6 tests pass: `bun test src/search/query-service.test.ts`
