---
Status: implemented
Triage: AFK
Pillar: search-and-discovery
Blocked-by: [03-indexers-task-doc-memory.md, 04-indexers-run-artifact-repo-sprint.md, 05-fts-query-ranking.md]
PRD: .scratch/agent-os-vision/prds/11-search-and-discovery.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 11 section)
Decisions: [C1, Q17, D5]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Search facets / saved searches row)
Docs: []
---

# Gated: embeddings hybrid search (FULCRUM_FEATURES=embeddings) — pgvector IVFFlat + hybrid scoring

## Parent
PRD: `.scratch/agent-os-vision/prds/11-search-and-discovery.md` (Issues T11-30)

## What to build
When `FULCRUM_FEATURES=embeddings` ON: indexer hooks call inference sidecar to embed entity text → write `search_documents.embedding vector(384)`; `search.query` computes hybrid score `0.6 * normalized_bm25 + 0.4 * cosine(query_embed, doc_embed)` replacing always-on score. On first flag enable: create pgvector IVFFlat index `sd_embedding_ivf` and bulk-reindex all entities via graphile-worker. Flag OFF: no embedding writes, no cosine computation, BM25-only score.

## Acceptance criteria
- [ ] Schema migration: `embedding` column (`@Property({ type: VectorType, length: 384, nullable: true })`) already in `SearchDocument` entity from migration class covering `0011_search` (NULL when flag OFF); IVFFlat index added via a separate migration class auto-generated when `embeddings` flag is first enabled (idempotent — MikroORM snapshot diff). Index expressed as `@Index({ expression: "sd_embedding_ivf ON search_documents USING ivfflat(embedding vector_cosine_ops) WITH (lists=100)" })` on `SearchDocument` — sanctioned single DDL-string-per-index escape under C6.
- [x] tRPC procedure / module: `search.query` branches on `isFeatureEnabled('embeddings')` → hybrid scoring path; unit tested for hybrid vs BM25-only.
- [ ] Web surface: `/search` results ranked differently when flag ON (semantic matches surface even without exact keyword); no UI change needed (scoring is internal).
- [ ] CLI command: `fulcrum search "deploy to production" --json` returns semantically relevant results (e.g. "release pipeline" doc) when flag ON, with recall ≥0.85 on test set.
- [ ] TUI screen: search pane results semantically ranked when flag ON.
- [x] Tests: OFF → `embedding` column NULL for all new entities, no sidecar calls; ON → non-null embedding, hybrid score applied; recall test: 10 query/result pairs, ≥8 correct at top-3 (≥0.8 recall); IVFFlat index exists after flag enable; bulk reindex completes; flag flip OFF after ON → BM25-only fallback, no 500; RED→GREEN.

## Blocked by
- `03-indexers-task-doc-memory.md` and `04-indexers-run-artifact-repo-sprint.md` — indexers to extend.
- `05-fts-query-ranking.md` — `search.query` to extend with hybrid scoring branch.
- Pillar 2 (Inference sidecar) — must be running; mock in unit tests.

## Notes / Tech-stack hints
- Per C1: both paths (with/without embeddings) tested; default OFF.
- `vector(384)`: matches `bge-small-en-v1.5` output dimension (384) from Pillar 2.
- Failure gate: IVFFlat recall <0.9 at 100k rows → switch to HNSW index (pgvector ≥0.5); or `halfvec` quantisation (pgvector 0.7+).
- Cosine normalisation: `1 - (embedding <=> query_embed)` gives [0,1]; normalize BM25 to [0,1] via max-normalisation in query.
