---
Status: ready-for-agent
Triage: AFK
Pillar: 08-memory-context-engine
Blocked-by: [16-gated-embeddings-write-pipeline.md, 06-retriever-bm25-recency-importance.md]
PRD: .scratch/agent-os-vision/prds/08-memory-context-engine.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 8 section)
Decisions: [Q17, C1]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Memory + Context rows)
Docs: PRD §Gated features — embeddings hybrid scoring formula; PRD §Retriever
---

## What to build

Hybrid scoring path in `retriever.ts` activated when `FULCRUM_FEATURES=embeddings`. When flag is on, `retrieve()` calls sidecar `embed(query) → float32[384]` to obtain the query vector, then scores:

```
score = 0.6 * normalize(ts_rank_cd(...))
      + 0.4 * cosine(query_embed, memory_embed)
```

`normalize(bm25) = bm25 / max_bm25_in_result_set`. Recency and importance boosts unchanged (additive). Query embed cached in `context_snapshots.bundle_blob` for replay.

`doc_embeddings` used for linked-doc slice 2 in assembler re-ranking when wikilinks > 5 (adds cosine ranking on top of wikilink order).

Falls back to FTS-only scoring if sidecar is unavailable (log warning, proceed).

## Acceptance criteria

- [ ] `FULCRUM_FEATURES=embeddings` ON → `retrieve()` calls sidecar `embed(query)`; scoring uses hybrid formula
- [ ] `memory.search` re-ranks differently from FTS-only for ≥3/10 test queries (`retriever.hybrid.test.ts`)
- [ ] `normalize(bm25)` computed correctly: `bm25 / max(bm25)` within result set; no divide-by-zero on empty set
- [ ] Cosine similarity: `1 - (vector <=> query_vec)` using pgvector operator
- [ ] Query embed cached in `context_snapshots.bundle_blob` so replay hydration doesn't re-embed
- [ ] Sidecar unavailable with flag on → fallback to FTS-only; warning logged; no error thrown
- [ ] Doc embeddings: assembler slice 2 re-ranks linked docs by cosine similarity when wikilinks > 5
- [ ] Flag OFF → retriever unchanged; no sidecar calls
- [ ] HNSW index scan confirmed in EXPLAIN for hybrid path (from slice 16)
- [ ] All retriever tests from slice 06 still pass with flag off

## Blocked by

- `16-gated-embeddings-write-pipeline.md`
- `06-retriever-bm25-recency-importance.md`
