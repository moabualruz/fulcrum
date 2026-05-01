---
Status: ready-for-agent
Triage: AFK
Pillar: 02-inference-sidecar
Blocked-by: 03-inference-cache-schema, 04-trpc-procedures-and-health-surface
---

# Models registry — `fulcrum inference models pull|list|rm` + auto-download on first use

## Parent
PRD: `.scratch/agent-os-vision/prds/02-inference-sidecar.md`

## What to build
Build `ModelManager::ensure(model_id)` in Rust: checks `$FULCRUM_HOME/models/<model_id>.gguf`; if absent, downloads from HuggingFace Hub (HTTPS + streaming SHA-256 verify); streams `{"type":"download_progress","pct":N,"downloaded":D,"total":T}` progress JSON to the JSON-RPC client via a long-polling or subscription pattern. Sync `inference_models` PGlite rows on pull/rm. Wire CLI verbs `fulcrum inference models list [--json]`, `pull <model-id> [--force]`, `rm <model-id>`. Surface download progress on the web settings page (tRPC subscription) and as a real-time progress bar in the TUI.

## Acceptance criteria
- [ ] Rust impl: `inference/inference-server/src/models.rs` — `ModelManager::ensure("BAAI/bge-small-en-v1.5")` downloads to `$FULCRUM_HOME/models/`; SHA-256 matches manifest in `inference/models.toml`; progress stream emits 0%→100% JSON objects; `inference_models` row set `downloaded=true` on completion; `cargo test -p inference-server -- models` green.
- [ ] CLI command: `fulcrum inference models list --json` returns `InferenceModel[]` array with `downloaded`, `size_bytes`, `kind` fields; `pull <model-id>` streams progress to stdout; `rm <model-id>` deletes GGUF + sets `downloaded=false` in DB.
- [ ] TUI screen: progress overlay (progress bar) appears during `models.pull` tRPC subscription; completes and dismisses when `pct=100`; model list updates without manual refresh.
- [ ] Web/API surface: `/settings/inference` model list shows download button per undownloaded model; clicking triggers `inference.models.pull` tRPC subscription; progress bar overlay renders; list updates on completion.
- [ ] Tests: unit test mocks HF HTTPS endpoint; asserts progress events emitted in order; SHA-256 mismatch → error + file deleted; Playwright test clicks "Download" on a fixture model, asserts progress bar appears and disappears. `bun run ci` green.

## Blocked by
03-inference-cache-schema, 04-trpc-procedures-and-health-surface

## Notes
- `inference/models.toml` declares default bundled models: `bge-small-en-v1.5`, `Qwen2.5-0.5B-Instruct-GGUF Q4_K_M`, plus optional user-selectable ones from PRD.
- Failure gate: HF blocked → accept GGUF from `FULCRUM_MODELS_DIR` local path; `ModelManager::ensure` checks local path first.
- `reqwest` with `async-stream` for streaming download body; progress computed as `bytes_received / content-length`.
- `--force` on `pull` re-downloads even if `downloaded=true`.
