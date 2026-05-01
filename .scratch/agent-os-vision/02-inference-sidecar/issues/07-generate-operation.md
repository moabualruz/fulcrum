---
Status: ready-for-agent
Triage: AFK
Pillar: 02-inference-sidecar
Blocked-by: 06-models-registry-pull-list-rm
---

# `generate()` operation — candle crate + gen cache + CLI + web debug panel

## Parent
PRD: `.scratch/agent-os-vision/prds/02-inference-sidecar.md`

## What to build
Implement `generate(prompt, options?) → Promise<GenerateResult>` end-to-end: Rust `inference-generate` crate using `candle` v0.9+ loading `Qwen2.5-0.5B-Instruct` Q4_K_M GGUF; temperature + top-p sampling; `GenerateOptions { schema?, model?, maxTokens?, temperature? }`; JSON-RPC `generate` method dispatched by `inference-server`; `gen_cache` cache-aside (1-hour TTL, schema-less requests only — structured output not cached to avoid invalid cache hits); TS `client.ts` `generate()` wrapper; `fulcrum inference generate <prompt> [--model <id>] [--max-tokens N] [--json]` CLI; web settings page "Test generate" debug panel.

## Acceptance criteria
- [ ] Rust impl: `inference-generate/src/lib.rs` — `GenerateRequest { prompt, model?, max_tokens?, temperature?, schema? }` → `GenerateResponse { text, model, tokens_used }`; `candle` model loaded once; `"The capital of France is"` returns text containing "Paris"; completes under 30 s CPU-only; `cargo test -p inference-generate` green.
- [ ] Rust impl: `gen_cache` — identical prompt + options (no schema) → cache hit within 1-hour TTL; cache miss increments model call counter; schema-bearing requests bypass cache.
- [ ] CLI command: `fulcrum inference generate "The capital of France is" --json` returns `{ text, model, tokens_used }` with "Paris" in text; `--max-tokens 50` respected; completes without API key.
- [ ] TUI screen: N/A at this slice; generate throughput surfaces in TUI inference dashboard (slice 13).
- [ ] Web/API surface: `/settings/inference` page has "Test generate" input; calls `inference.generate(prompt)` via tRPC; renders response text + token count; error state when sidecar down.
- [ ] Tests: contract test against real binary with `SKIP_MODEL_DOWNLOAD=1` + fixture GGUF stub; asserts non-empty text; cache hit on second identical call; Playwright test types prompt, clicks "Generate", asserts text appears. `bun run ci` green.

## Blocked by
06-models-registry-pull-list-rm

## Notes
- Failure gate: `candle` Metal backend crashes on M-series → launch with `--no-metal`, CPU-only; note in `fulcrum doctor`.
- Failure gate: Qwen2.5-0.5B > 1 GB in practice → switch to Q2_K (~250 MB); expose `--quality` flag.
- Model loaded lazily on first generate call, not at server startup.
- CPU-only path must pass CI (no GPU required in CI environment).
