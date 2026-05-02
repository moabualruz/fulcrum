---
Status: ready-for-agent
Triage: AFK
Pillar: 07-docs-editor-collab
Blocked-by: [05-doc-crud-trpc.md, 16-search-index-hook.md]
PRD: .scratch/agent-os-vision/prds/07-docs-editor-collab.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 7 section)
Decisions: [C1, Q17]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Confluence-grade docs row)
Docs: []
---

# Gated: embeddings — on-save doc embedding via inference sidecar → docs.embedding vector(384)

## Parent
PRD: `.scratch/agent-os-vision/prds/07-docs-editor-collab.md` (issues lines P7-48; gated features table)

## What to build
Feature-flagged (`FULCRUM_FEATURES=embeddings`) embedding pipeline. When OFF: `docs.embedding`
column is NULL, no sidecar call. When ON: after every `docs.update` (post search-index upsert),
`src/docs/doc-embedder.ts` sends `body_md` (first 512 tokens) to the inference sidecar
(`src/inference/client.ts`); receives `vector(384)` back; writes to `docs.embedding`. Enables
hybrid FTS+cosine search via Pillar 11. Schema: `docs` table already has `embedding vector(384)
NULL` column from slice 01.

## Acceptance criteria
- [ ] `FULCRUM_FEATURES=embeddings` OFF: `docs.embedding` is NULL after `docs.update`; no sidecar call made
- [ ] Flag ON: `docs.update` triggers `doc-embedder.ts`; sidecar called with `body_md[0..512 tokens]`; `docs.embedding` populated with non-null vector
- [ ] `doc-embedder.ts` is async, non-blocking — `docs.update` tRPC resolves without waiting for embedding
- [ ] Failed sidecar call: logged as warning; `docs.embedding` left as previous value (no partial update); `docs.update` still succeeds
- [ ] Re-index: calling `docs.update` with unchanged `body_md` still refreshes embedding (deterministic)
- [ ] Schema: `docs.embedding vector(384)` column present (already from slice 01 migration)
- [ ] Tests: flag OFF — assert `doc-embedder.ts` is never imported in the OFF code path
- [ ] Tests: flag ON — mock sidecar client returns fixed vector; assert `docs.embedding` row updated with that vector
- [ ] Tests: sidecar failure — mock throws; assert `docs.update` still returns success; embedding stays NULL
- [ ] Web: no UI surface for embeddings (Pillar 11 owns hybrid search UI); verified via direct DB query in test
- [ ] CLI: `fulcrum docs show <slug> --json` does NOT expose raw embedding vector (too large); `has_embedding: true/false` field acceptable
- [ ] TUI: no surface; same as CLI — `has_embedding` status visible in `fulcrum docs show` output

## Blocked by
`05-doc-crud-trpc.md`, `16-search-index-hook.md`

## Notes / Tech-stack hints
- `doc-embedder.ts` uses `Promise.race([sidecar.embed(text), timeout(5000)])` to prevent hanging the save path
- Inference sidecar communication: Unix socket JSON-RPC per Pillar 2; `src/inference/client.ts` handles the protocol
- `vector(384)` matches bge-small-en output dimension; if sidecar switches to a 1536-dim model, migration adds new column
