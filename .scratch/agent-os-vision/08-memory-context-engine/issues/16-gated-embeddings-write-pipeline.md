---
Status: completed
Triage: AFK
ImplRuntime: claude
Pillar: 08-memory-context-engine
Blocked-by: [02-schema-migration-gated-embeddings.md, 07-trpc-memory-crud-and-search.md]
PRD: .scratch/agent-os-vision/prds/08-memory-context-engine.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 8 section)
Decisions: [Q17, C1]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Memory + Context rows)
Docs: PRD §Gated features — embeddings flag; graphile-worker job generate-memory-embedding; HNSW `@Index({ expression })`
---

## What to build

Gated embedding write pipeline (`FULCRUM_FEATURES=embeddings`). On any `Memory` entity write (create or update), enqueue graphile-worker job `generate-memory-embedding`. Job calls Pillar 2 sidecar `embed(body) → float32[384]` and writes `MemoryEmbedding.embedding` through `MemoryEmbeddingRepository`.

HNSW index: declared with the C6 decorator carve-out on the entity, `@Index({ expression: 'USING hnsw (embedding vector_cosine_ops)' })`. After first successful embedding write, metadata and repository integration tests confirm the hybrid path uses the indexed `embedding` property.

Also: doc-save path writes `DocEmbedding.embedding` via job `generate-doc-embedding` (same pattern; used for linked-doc re-ranking in assembler slice 2 when wikilinks > 5).

Default OFF — no sidecar calls, `MemoryEmbeddingRepository.count()` stays zero.

## Acceptance criteria

- [ ] `FULCRUM_FEATURES` unset → no embedding jobs enqueued; `MemoryEmbeddingRepository.count()` stays zero (`feature-flags.test.ts`)
- [ ] `FULCRUM_FEATURES=embeddings` → memory write → job enqueued → `MemoryEmbedding.embedding` written with dimension 384
- [ ] `modelId` property set to the sidecar's reported model name (e.g. `bge-small-en-v1.5`)
- [ ] HNSW metadata present after first write path; repository hybrid search uses indexed `embedding` property
- [ ] `DocEmbedding.embedding` populated on doc save when flag on
- [ ] Sidecar unavailable → job retries 2× then fails silently; memory row still present without embedding
- [ ] Dimension mismatch (sidecar returns wrong size) → job fails with error log; no corrupt row written
- [ ] Integration test: flag ON + mock sidecar → assert `MemoryEmbedding` row; assert vector dimension = 384
- [ ] `fulcrum doctor --json` `embeddings` subsystem: `disabled` when flag off; `ok`/`degraded` with row count when on

## Blocked by

- `02-schema-migration-gated-embeddings.md`
- `07-trpc-memory-crud-and-search.md`
