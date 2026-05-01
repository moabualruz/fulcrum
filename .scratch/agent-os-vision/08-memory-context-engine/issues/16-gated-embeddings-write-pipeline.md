---
Status: ready-for-agent
Triage: AFK
Pillar: 08-memory-context-engine
Blocked-by: [02-schema-migration-gated-embeddings.md, 07-trpc-memory-crud-and-search.md]
PRD: .scratch/agent-os-vision/prds/08-memory-context-engine.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 8 section)
Decisions: [Q17, C1]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Memory + Context rows)
Docs: PRD §Gated features — embeddings flag; graphile-worker job generate-memory-embedding; HNSW index lazy creation
---

## What to build

Gated embedding write pipeline (`FULCRUM_FEATURES=embeddings`). On any `memories` row write (create or update), enqueue graphile-worker job `generate-memory-embedding`. Job calls Pillar 2 sidecar `embed(body) → float32[384]` and writes to `memory_embeddings(memory_id, vector, model_id)`.

HNSW index: created lazily on first successful embedding write (`CREATE INDEX IF NOT EXISTS memories_embedding_hnsw ON memory_embeddings USING hnsw (vector vector_cosine_ops)`). After creation, `EXPLAIN` confirms index scan used for `ORDER BY vector <=> $query_embed`.

Also: doc-save path writes to `doc_embeddings` via job `generate-doc-embedding` (same pattern; used for linked-doc re-ranking in assembler slice 2 when wikilinks > 5).

Default OFF — no sidecar calls, `memory_embeddings` stays empty.

## Acceptance criteria

- [ ] `FULCRUM_FEATURES` unset → no embedding jobs enqueued; `memory_embeddings` empty (`feature-flags.test.ts`)
- [ ] `FULCRUM_FEATURES=embeddings` → memory write → job enqueued → `memory_embeddings` row written with `vector` dimension 384
- [ ] `model_id` column set to the sidecar's reported model name (e.g. `bge-small-en-v1.5`)
- [ ] HNSW index created after first write; `EXPLAIN SELECT ... ORDER BY vector <=> $1` shows index scan
- [ ] `doc_embeddings` populated on doc save when flag on
- [ ] Sidecar unavailable → job retries 2× then fails silently; memory row still present without embedding
- [ ] Dimension mismatch (sidecar returns wrong size) → job fails with error log; no corrupt row written
- [ ] Integration test: flag ON + mock sidecar → assert `memory_embeddings` row; assert vector dimension = 384
- [ ] `fulcrum doctor --json` `embeddings` subsystem: `disabled` when flag off; `ok`/`degraded` with row count when on

## Blocked by

- `02-schema-migration-gated-embeddings.md`
- `07-trpc-memory-crud-and-search.md`
