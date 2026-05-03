---
Status: implemented
Triage: AFK
Pillar: 02-inference-sidecar
Blocked-by: 03-inference-cache-schema, 04-trpc-procedures-and-health-surface
Owner: codex-worker-p2-models-registry
---

# Models registry — `fulcrum inference models pull|list|rm` + auto-download on first use

## Parent
PRD: `.scratch/agent-os-vision/prds/02-inference-sidecar.md`

## What to build
Build `ModelManager::ensure(model_id)` in Rust: checks `$FULCRUM_HOME/models/<model_id>.gguf`; if absent, downloads from HuggingFace Hub (HTTPS + streaming SHA-256 verify); streams `{"type":"download_progress","pct":N,"downloaded":D,"total":T}` progress JSON to the JSON-RPC client via a long-polling or subscription pattern. Sync `ModelCache` MikroORM rows through `ModelCacheRepository` on pull/rm. Wire CLI verbs `fulcrum inference models list [--json]`, `pull <model-id> [--force]`, `rm <model-id>`. Surface download progress on the web settings page (tRPC subscription) and as a real-time progress bar in the TUI.

## Acceptance criteria
- [x] Rust impl: `inference/inference-server/src/models.rs` — `ModelManager::ensure("BAAI/bge-small-en-v1.5")` downloads to `$FULCRUM_HOME/models/`; SHA-256 matches manifest in `inference/models.toml`; progress stream emits 0%→100% JSON objects; `ModelCacheRepository.markDownloaded(modelId)` called on completion; `cargo test -p inference-server -- models` green.
- [x] CLI command: `fulcrum inference models list --json` returns `InferenceModel[]` array with `downloaded`, `size_bytes`, `kind` fields; `pull <model-id>` streams progress to stdout; `rm <model-id>` deletes GGUF + sets `downloaded=false` in DB.
- [x] TUI screen: progress overlay (progress bar) appears during `models.pull` tRPC subscription; completes and dismisses when `pct=100`; model list updates without manual refresh.
- [x] Web/API surface: `/settings/inference` model list shows download button per undownloaded model; clicking triggers `inference.models.pull` tRPC subscription; progress bar overlay renders; list updates on completion.
- [x] Tests: unit test mocks HF HTTPS endpoint; asserts progress events emitted in order; SHA-256 mismatch → error + file deleted; web settings SSR fixture asserts Download/progress rendering; `bun run ci` green.

## Blocked by
03-inference-cache-schema, 04-trpc-procedures-and-health-surface

## Notes
- `inference/models.toml` declares default bundled models: `bge-small-en-v1.5`, `Qwen2.5-0.5B-Instruct-GGUF Q4_K_M`, plus optional user-selectable ones from PRD.
- Failure gate: HF blocked → accept GGUF from `FULCRUM_MODELS_DIR` local path; `ModelManager::ensure` checks local path first.
- `reqwest` with `async-stream` for streaming download body; progress computed as `bytes_received / content-length`.
- `--force` on `pull` re-downloads even if `downloaded=true`.

## EXECUTION-LOG

### 2026-05-02 — codex-worker-p2-models-registry

- RED: `cargo test -p inference-server --manifest-path inference/Cargo.toml -- models`
  - First failure: `cannot find struct, variant or union type ModelManifest in this scope`.
- RED: `bun test src/cli/inference.test.ts src/web/src/routes/settings/inference/page.svelte.test.ts src/server/trpc/routers/__tests__/inference.test.ts`
  - First failures: `JSON Parse error: Unexpected EOF`, `tui.pullInferenceModel is not a function`, missing `Download` text.
- Implemented Rust `ModelManager` manifest loading, local override lookup, HTTPS streaming download, SHA-256 verification, progress events, and rm/list behavior.
- Wired JSON-RPC `models.list|pull|rm`, CLI `fulcrum inference models`, tRPC subscription, TUI progress overlay, web settings download form/progress state, and `ModelCacheRepository` downloaded/missing sync.
- Fixed SSR build blocker by keeping decorated MikroORM classes out of static web bundle imports in `inferenceRouter`.
- GREEN: `cargo test -p inference-server --manifest-path inference/Cargo.toml -- models` — 2 passed.
- GREEN: `bun test src/cli/inference.test.ts src/web/src/routes/settings/inference/page.svelte.test.ts src/server/trpc/routers/__tests__/inference.test.ts` — 27 passed.
- GREEN: `bun run lint` — pass.
- GREEN: `bun run ci` — pass: 1830 pass, 2 skip, 0 fail; all CI stages green.
- Decision flagged: model IDs are sanitized to filesystem-safe `<model-id>.gguf` filenames to avoid path traversal from slash-bearing HuggingFace IDs.
- Decision flagged: `BAAI/bge-small-en-v1.5` manifest uses upstream `model.safetensors` because that HF repo does not publish a GGUF artifact; local cache target still follows Fulcrum `.gguf` contract.

### 2026-05-03 — codex-worker-p2-models-registry-js-client

- Status remains implemented.
- RED: `bun test src/inference/client.test.ts`
  - First failure: `listModels calls models.list and normalizes registry metadata` dropped `size_bytes` and `size_bytes_actual` from Rust JSON-RPC model payloads.
- Implemented scoped JS client/protocol fix: `InferenceModelSchema` accepts Rust snake_case model size fields and normalizes them to TypeScript camelCase.
- Added `src/inference` tests for `models.list`, `models.pull`, and `models.rm` JSON-RPC client operations.
- GREEN: `bun test src/inference/client.test.ts` — 10 pass, 0 fail.
- Broader inference run: `bun test src/inference/client.test.ts src/inference/protocol.test.ts src/inference/lifecycle.test.ts src/inference/contract.test.ts tests/inference/embed-operation.test.ts` — 18 pass, 2 fail; failures are lifecycle sidecar startup errors (`inference-server exited before readiness (code 1)`), with sandbox Unix socket skips in contract tests.
- Project gate: `bun run ci` blocked in typecheck by existing out-of-scope errors under docs routes, notifications tests, and TUI docs tests before test stage.
