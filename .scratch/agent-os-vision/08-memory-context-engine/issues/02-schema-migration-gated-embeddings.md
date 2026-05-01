---
Status: ready-for-agent
Triage: AFK
Pillar: 08-memory-context-engine
Blocked-by: [01-schema-migration-core.md]
PRD: .scratch/agent-os-vision/prds/08-memory-context-engine.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 8 section)
Decisions: [Q17, C1]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Memory + Context rows)
Docs: PRD §Schema changes — memory_embeddings, doc_embeddings DDL; PRD §Gated features — embeddings flag
---

## What to build

Migration creating the gated embedding tables: `memory_embeddings` and `doc_embeddings` (both `vector(384)` columns). HNSW index is NOT created here — it is added lazily on first write when the `embeddings` flag is on (slice 14 handles index creation). Migration ships unconditionally so the schema is always present; rows are written only when `FULCRUM_FEATURES=embeddings`.

End-to-end: migration runs on top of slice 01; tables exist with correct column types; no HNSW index yet; `fulcrum doctor --json` subsystem check confirms embedding schema present and reports flag state.

## Acceptance criteria

- [ ] `memory_embeddings(memory_id uuid PK → memories.id ON DELETE CASCADE, vector vector(384), model_id text, created_at timestamptz)` created
- [ ] `doc_embeddings(doc_id uuid PK → docs.id ON DELETE CASCADE, vector vector(384), model_id text, created_at timestamptz)` created
- [ ] Migration is idempotent
- [ ] No HNSW index created at this step (deferred to slice 14)
- [ ] `pgvector` extension available in PGlite WASM build confirmed (or fallback to Vectra file-backed documented)
- [ ] Test: tables exist post-migration; `vector(384)` column type correct; `memory_embeddings` FK cascade deletes with parent `memories` row
- [ ] `fulcrum doctor --json` `embeddings_schema` subsystem: `ok` (schema present) + `flag: off` when `FULCRUM_FEATURES` unset

## Blocked by

- `01-schema-migration-core.md`
