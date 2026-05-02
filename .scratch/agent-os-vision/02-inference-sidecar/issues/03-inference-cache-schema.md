---
Status: completed
Owner: codex-orchestrator
Triage: AFK
Pillar: 02-inference-sidecar
Blocked-by: 01-cargo-workspace-scaffold
---

# Inference cache entities + migration class + PGlite embedding properties

## Parent
PRD: `.scratch/agent-os-vision/prds/02-inference-sidecar.md`

## What to build
Create the cache/entity layer that underpins the caching and embedding pipeline: (1) sidecar `CacheStore` typed entries for embed/gen cache in `$FULCRUM_HOME/inference-cache.db`, managed by Rust with no checked-in schema file; (2) MikroORM migration class `src/db/migrations/Migration<timestamp>.ts` covering `ModelCache`, `ProviderCredential`, and `VectorType` embedding properties on `Memory`, `SearchDocument`, and `Document`. Embedding properties use `@Property({ type: VectorType, length: 384, nullable: true })` and are written only when `isEnabled('embeddings')` is true at application layer. This slice does NOT implement the embed/generate operations — it only lays the metadata that slices 05 and 07 build on.

## Acceptance criteria
- [ ] Rust impl: `inference/inference-server/src/cache.rs` initializes `inference-cache.db` via `CacheStore`; `EmbedCacheEntry` and `GenerateCacheEntry` put/get/ttl round-trips pass; `cargo test -p inference-server -- cache` green; cache DB created at `$FULCRUM_HOME/inference-cache.db` on server start.
- [ ] CLI command: `fulcrum inference status --json` output includes `"cache": {"db_path": "...", "embed_rows": N, "gen_rows": N}` after server start.
- [ ] TUI screen: N/A at this slice; cache stats surface in slice 13.
- [ ] Web/API surface: generated MikroORM migration class applies via the project's migration runner; `ModelCache` entity metadata is present; embedding properties exist on `Memory`, `SearchDocument`, and `Document` (writes guarded by `isEnabled('embeddings')`).
- [ ] Tests: migration test uses `em.getMetadata()` plus create/read/delete round-trips for `ModelCache` and embedding properties; rollback leaves metadata clean; `bun run migrate:test` green.

## Blocked by
01-cargo-workspace-scaffold

## Notes
- Sidecar cache bootstrap is Rust-owned and hidden behind `CacheStore`, not the PGlite migration runner.
- MikroORM migration class `Migration<timestamp>` runs through the existing PGlite/PostgreSQL migration runner from Pillar 1.
- HNSW indexes on embedding properties use `@Index({ expression: 'USING hnsw (embedding vector_cosine_ops)' })` and are activated by application layer when `isEnabled('embeddings')`.
- `ModelCache` lives in the main Fulcrum DB, not in `inference-cache.db`.
