---
Status: ready-for-agent
Triage: AFK
Pillar: 08-memory-context-engine
Blocked-by: [01-schema-migration-core.md]
PRD: .scratch/agent-os-vision/prds/08-memory-context-engine.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 8 section)
Decisions: [Q17, C1]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Memory + Context rows)
Docs: PRD §Schema changes — `MemoryEmbedding`, `DocEmbedding` entities; PRD §Gated features — embeddings flag
---

## What to build

Migration class creating the gated embedding entities: `MemoryEmbedding` and `DocEmbedding` (both `@Property({ type: VectorType, length: 384, nullable: true })`). HNSW `@Index({ expression: 'USING hnsw (embedding vector_cosine_ops)' })` metadata is present here, but writes/query use remain gated by the `embeddings` flag. Migration ships unconditionally so the schema is always present; rows are written only when `FULCRUM_FEATURES=embeddings`.

End-to-end: migration runs on top of slice 01; `em.getMetadata()` confirms `VectorType` length 384 and HNSW metadata; `fulcrum doctor --json` subsystem check confirms embedding entity metadata present and reports flag state.

## Acceptance criteria

- [ ] `MemoryEmbedding` entity created with primary one-to-one `memory`, `embedding` `VectorType` length 384, `modelId`, and `createdAt`
- [ ] `DocEmbedding` entity created with primary `docId`, `embedding` `VectorType` length 384, `modelId`, and `createdAt`
- [ ] Migration class is idempotent through MikroORM migration runner
- [ ] HNSW metadata uses only the C6 carve-out decorator expression: `@Index({ expression: 'USING hnsw (embedding vector_cosine_ops)' })`
- [ ] `pgvector/mikro-orm` extension path available in PGlite WASM build confirmed (or fallback to Vectra file-backed documented)
- [ ] Test: `em.getMetadata()` confirms `VectorType` length 384; `MemoryEmbedding` cascade deletes with parent `Memory` row through ORM round-trip
- [ ] `fulcrum doctor --json` `embeddings_schema` subsystem: `ok` (schema present) + `flag: off` when `FULCRUM_FEATURES` unset

## Blocked by

- `01-schema-migration-core.md`
