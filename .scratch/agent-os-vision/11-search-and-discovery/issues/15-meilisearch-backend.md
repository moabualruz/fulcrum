---
Status: completed
Triage: AFK
Pillar: search-and-discovery
Blocked-by: [03-indexers-task-doc-memory.md, 04-indexers-run-artifact-repo-sprint.md, 05-fts-query-ranking.md]
PRD: .scratch/agent-os-vision/prds/11-search-and-discovery.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 11 section)
Decisions: [C1, D5]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Search facets / saved searches row)
Docs: []
---

# Gated: external-search-meilisearch — dual-write + query backend switch + PGlite fallback

## Parent
PRD: `.scratch/agent-os-vision/prds/11-search-and-discovery.md` (Issues T11-31)

## What to build
When `FULCRUM_FEATURES=external-search-meilisearch` ON: indexer hooks dual-write to both PGlite `search_documents` AND Meilisearch v1 index; `search.query` routes to Meilisearch at runtime. If Meilisearch down or unreachable → transparent fallback to PGlite FTS (no 500). Same query API surface — no change in tRPC input/output shape. `MEILISEARCH_URL` + `MEILISEARCH_KEY` env vars. Flag OFF: no Meilisearch calls, PGlite-only.

## Acceptance criteria
- [ ] Schema migration: N/A — Meilisearch is external index; `search_documents` stays as fallback.
- [ ] tRPC procedure / module: `search.query` backend selected by flag at runtime; `SearchBackend` interface with `PGliteBackend` and `MeilisearchBackend` implementations; factory in `src/search/backend.ts`.
- [ ] Web surface: flag ON with running Meilisearch → `/search` results served from Meilisearch (verified via query log).
- [ ] CLI command: `fulcrum search "foo" --json` works identically regardless of backend; `fulcrum doctor --json` reports Meilisearch reachability when flag ON.
- [ ] TUI screen: search results identical regardless of backend.
- [ ] Tests: OFF → no Meilisearch calls; ON → dual-write on upsert; query routed to Meilisearch; Meilisearch mock DOWN → PGlite fallback, no 500; results same shape from both backends; RED→GREEN.

## Blocked by
- `03-indexers-task-doc-memory.md` and `04-indexers-run-artifact-repo-sprint.md` — indexers to extend with dual-write.
- `05-fts-query-ranking.md` — `SearchBackend` interface extracted from `search.query`.

## Notes / Tech-stack hints
- Meilisearch v1 MIT; client: `meilisearch` npm package (MIT).
- Failure gate: Meilisearch too heavy on single-machine → Typesense (check GPL concern for cloud tier); fallback Zinc (Apache-2.0).
- Dual-write: indexer calls `pgBackend.upsert()` then `meilisearchBackend.upsert()` in parallel (`Promise.allSettled`); Meilisearch failure logged, not thrown.
- Doctor check: `GET ${MEILISEARCH_URL}/health` → reachable/unreachable status.
