---
Status: implemented
Triage: AFK
Pillar: search-and-discovery
Blocked-by: [03-indexers-task-doc-memory.md, 04-indexers-run-artifact-repo-sprint.md]
PRD: .scratch/agent-os-vision/prds/11-search-and-discovery.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 11 section)
Decisions: [Q27, Q17]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Search facets / saved searches row)
Docs: []
---

# tRPC search.query: FTS + BM25+recency+kind_boost ranking + facets + pagination

## Parent
PRD: `.scratch/agent-os-vision/prds/11-search-and-discovery.md` (Issues T11-09)

## What to build
`search.query` tRPC procedure: full-text search over `search_documents` using `ts_rank_cd(ts_vector, query)` + recency decay `0.3*exp(-age_days/14.0)` + kind_boost (open tasks +0.5, high-importance memories +0.4, spec/adr/runbook docs +0.2, completed runs +0.1). All facet filters composable as `WHERE` clauses: `kind`, `project_id`, `sprint_id`, `doc_type` (from metadata), `status` (from metadata), `assignee_id` (from metadata), `tags @>`, `repo_id` (from metadata), `created_at`/`updated_at` date range, `author_id`. Pagination (`limit`, `offset`). Returns `{ results: SearchResult[], total: number, facetCounts: Record<string,number> }`.

## Acceptance criteria
- [ ] Schema migration: N/A — reads `search_documents`.
- [ ] tRPC procedure / module: `search.query` in `src/trpc/routers/search.ts`; Zod-validated input (all filters optional); output typed with `SearchResult` shape.
- [ ] Web surface: `/search?q=foo&kind=task` returns ranked results grouped by kind; facet counts match filter selection.
- [ ] CLI command: `fulcrum search "foo" --kind task --assignee me --json` returns `SearchResult[]` matching tRPC schema.
- [ ] TUI screen: cross-kind results visible in search pane with kind badges and score-ranked order.
- [ ] Tests: BM25 base — title-match ranks above body-match; recency decay — newer entity ranks higher with same BM25; kind_boost — open task ranks above completed task for same query; facet WHERE — `kind=doc` returns only docs; pagination — page 2 returns next batch; empty query returns top-N by recency; cross-kind dedup on `(org_id, kind, entity_id)`; p95 <200ms at 10k rows (hyperfine); RED→GREEN.

## Blocked by
- `03-indexers-task-doc-memory.md` — test data seeded via indexers.
- `04-indexers-run-artifact-repo-sprint.md` — all 8 kinds indexed.

## Notes / Tech-stack hints
- `ts_rank_cd` returns float [0,1]; normalize before adding decay and boost components.
- Failure gate: p95 >200ms at 50k docs → add `pg_trgm` GIN on `title`; fallback to Orama in-memory.
- `facetCounts`: separate COUNT query per active filter dimension (avoid COUNT DISTINCT on all rows — too slow).
- `assertPermission(ctx, 'search:read')` — no org can query another org's data.
