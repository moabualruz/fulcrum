---
Status: ready-for-agent
Triage: AFK
Pillar: 02-inference-sidecar
Blocked-by: 01-cargo-workspace-scaffold
---

# Inference cache SQLite schema + migration + PGlite embedding columns

## Parent
PRD: `.scratch/agent-os-vision/prds/02-inference-sidecar.md`

## What to build
Create the two SQLite/PGlite migrations that underpin the caching and embedding pipeline: (1) `0008_inference_cache` — `embed_cache` + `gen_cache` tables in a separate `$FULCRUM_HOME/inference-cache.db` SQLite file managed by `rusqlite` inside the Rust sidecar; (2) `0008_inference_columns` — `embedding vector(384)` columns on `memories`, `search_documents`, `documents` in PGlite, plus the `inference_models` registry table. Embedding columns are written only when `isEnabled('embeddings')` is true at application layer. This slice does NOT implement the embed/generate operations — it only lays the schema that slices 05 and 07 build on.

## Acceptance criteria
- [ ] Rust impl: `inference/inference-server/src/cache.rs` initializes `inference-cache.db` via `rusqlite`; runs `CREATE TABLE IF NOT EXISTS embed_cache (...)` and `gen_cache (...)` as defined in the PRD; `cargo test -p inference-server -- cache` green; cache DB created at `$FULCRUM_HOME/inference-cache.db` on server start.
- [ ] CLI command: `fulcrum inference status --json` output includes `"cache": {"db_path": "...", "embed_rows": N, "gen_rows": N}` after server start.
- [ ] TUI screen: N/A at this slice; cache stats surface in slice 13.
- [ ] Web/API surface: PGlite migration `0008_inference_columns` applies via the project's migration runner; `inference_models` table created with correct schema; embedding columns present on `memories`, `search_documents`, `documents` (writes guarded by `isEnabled('embeddings')`).
- [ ] Tests: migration test asserts all tables + indexes exist post-migration; rollback leaves schema clean; `bun run migrate:test` green.

## Blocked by
01-cargo-workspace-scaffold

## Notes
- Migration `0008_inference_cache` is a Rust-owned SQLite migration run by the sidecar on startup, not by the PGlite migration runner.
- Migration `0008_inference_columns` runs through the existing PGlite migration runner from Pillar 1.
- HNSW indexes on embedding columns are created at runtime by application layer when `isEnabled('embeddings')` — not in the migration itself (as noted in PRD).
- `inference_models` table lives in PGlite main DB, not in `inference-cache.db`.
