---
Status: implemented
Triage: AFK
Pillar: 02-inference-sidecar
Blocked-by: 03-inference-cache-schema, 04-trpc-procedures-and-health-surface
---

# `embed()` operation — fastembed-rs crate + cache + CLI + web test page

## Parent
PRD: `.scratch/agent-os-vision/prds/02-inference-sidecar.md`

## What to build
Implement the `embed(texts: string[]) → Promise<number[][]>` operation end-to-end: Rust `inference-embed` crate using `fastembed-rs` v4 with `BAAI/bge-small-en-v1.5` (384-dim ONNX, ~67 MB, downloaded on first use); JSON-RPC `embed` method dispatched by `inference-server`; cache-aside read/write against `CacheStore` `EmbedCacheEntry` (7-day TTL, keyed on `(model, sha256(concat(texts)))`); `InferenceClient.embed()` wrapper; `fulcrum inference embed <text> [--model <id>] [--json]` CLI; `inference.embed()` tRPC procedure (wired in slice 04, exercised here end-to-end); web settings page smoke-embed test input.

## Acceptance criteria
- [x] Rust impl: `inference-embed/src/lib.rs` — `EmbedRequest { texts, model? }` → `EmbedResponse { vectors: Vec<Vec<f32>>, model, cached }` over JSON-RPC; `fastembed-rs` EmbeddingModel initialized once and cached in `Arc<Mutex<...>>`; batch encode; output dims = 384 for `bge-small-en-v1.5`; `cargo test -p inference-embed` green (two strings → two vectors, different inputs → different vectors).
- [x] Rust impl: cache-aside in `embed()` — `EmbedCacheEntry` hit returns stored blob without calling `fastembed-rs`; `hitCount` incremented; second call with identical text triggers zero model inference (verified by counter mock in test).
- [x] CLI command: `fulcrum inference embed "hello world" --json` returns 384-element float array; `--model <id>` selects non-default model; no API key required after initial download.
- [x] TUI screen: N/A at this slice (embed stats surface in TUI inference dashboard, slice 13).
- [x] Web/API surface: `/settings/inference` page has a "Test embed" input that calls `inference.embed(["<text>"])` via tRPC and shows first 5 vector values + dimensions; renders without crash when sidecar is down (error state).
- [x] Tests: contract test embeds two strings against real binary (`SKIP_MODEL_DOWNLOAD=1` uses mocked model path); asserts dims, uniqueness, cache hit on second call; Playwright test opens `/settings/inference`, types text, clicks "Test embed", asserts dimension display. `bun run ci` green.

## Implementation
- TS client wrapper: `src/inference/client.ts`.
- Sidecar surface: `inference/inference-server/src/main.rs`, `inference/inference-embed/src/lib.rs`, `inference/inference-server/src/cache.rs`.
- CLI/tRPC/web surfaces: `src/cli/inference.ts`, `src/server/trpc/routers/inference.ts`, `src/web/src/routes/settings/inference/+page.server.ts`, `src/web/src/routes/settings/inference/+page.svelte`.
- Regression coverage: `tests/inference/embed-operation.test.ts`, `src/inference/contract.test.ts`, `src/cli/inference.test.ts`, `src/server/trpc/routers/__tests__/inference.test.ts`.

## Blocked by
03-inference-cache-schema, 04-trpc-procedures-and-health-surface

## Notes
- Failure gate: if `fastembed-rs` ONNX link fails on ARM64 → switch to `candle` for embeddings (update `inference-embed` to `candle`-backed path, keep same JSON-RPC interface).
- `SKIP_MODEL_DOWNLOAD=1` env var disables HF download in tests; uses a pre-baked tiny ONNX fixture from `inference/fixtures/`.
- Cache blob serialization: store `Vec<Vec<f32>>` as little-endian binary blob; deserialize with `bytemuck` or manual cast.
