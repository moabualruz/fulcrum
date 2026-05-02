---
Status: in-progress
Owner: claude-orchestrator
Triage: AFK
Pillar: 02-inference-sidecar
Blocked-by: 05-embed-operation
---

# `classify()` + `tokenize()` operations — CLI + tRPC + web debug panel

## Parent
PRD: `.scratch/agent-os-vision/prds/02-inference-sidecar.md`

## What to build
Implement two lightweight operations that reuse the embed backend:

- `classify(text, labels) → {label, score}[]` — zero-shot via cosine similarity between text embedding and per-label embeddings; no extra model; sorted descending by score.
- `tokenize(text, model?) → {count, tokens}` — token budget counter for context assembler (Pillar 3/8); uses the tokenizer bundled with the active model (HuggingFace `tokenizers` crate or `fastembed-rs` tokenizer accessor).

Both operations get JSON-RPC methods, tRPC procedures, CLI commands, and web debug panel inputs.

## Acceptance criteria
- [ ] Rust impl: `inference-embed/src/classify.rs` — `classify("buy groceries", ["task", "question", "reminder"])` returns `[{label:"task",score:0.N},{...}]` sorted by score; all labels scored; reuses embed backend Arc (no second model load); `cargo test -p inference-embed -- classify` green.
- [ ] Rust impl: `inference-generate/src/tokenize.rs` (or `inference-core`) — `tokenize("hello world")` returns `{count: N, tokens: [...]}` for the active generation model's tokenizer; `cargo test` green.
- [ ] CLI command: `fulcrum inference embed --classify "buy groceries" --labels "task,question,reminder" --json` returns label array; OR expose as `fulcrum inference classify <text> --labels <csv> [--json]`; `fulcrum inference tokenize <text> [--model <id>] [--json]` returns `{count, tokens}`.
- [ ] TUI screen: N/A at this slice.
- [ ] Web/API surface: `/settings/inference` adds "Test classify" and "Test tokenize" panels; each calls respective tRPC procedure; renders results table (classify) or token count + list (tokenize).
- [ ] Tests: unit test `classify` with three labels — top label plausible; `tokenize` count non-zero; contract test against real binary with `SKIP_MODEL_DOWNLOAD=1`; Playwright tests for both panels. `bun run ci` green.

## Blocked by
05-embed-operation

## Notes
- `classify` cosine similarity: `dot(v_text, v_label) / (|v_text| * |v_label|)`.
- `tokenize` only needs the tokenizer, not the model weights — load tokenizer config from model download dir, no full GGUF load.
- Both operations cacheable through `CacheStore` `EmbedCacheEntry` (classify: keyed on `(model, sha256(text + labels_sorted))`; tokenize: in-memory LRU only, no DB).
