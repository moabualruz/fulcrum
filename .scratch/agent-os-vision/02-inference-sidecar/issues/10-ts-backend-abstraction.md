---
Status: completed
ImplRuntime: claude
Triage: AFK
Pillar: 02-inference-sidecar
Blocked-by: 04-trpc-procedures-and-health-surface
---

# TS backend abstraction — embedded / ollama / lm-studio / openai-compatible

## Parent
PRD: `.scratch/agent-os-vision/prds/02-inference-sidecar.md`

## What to build
Implement the full `InferenceBackend` interface in `src/inference/backends/` with four needle-di injectable concrete classes: `EmbeddedBackend` (routes to Unix socket through `InferenceClient`), `OllamaBackend` (HTTP to `localhost:11434/api/embed` + `/api/generate`), `LmStudioBackend` (OpenAI-compat at `localhost:1234/v1`), `OpenAICompatibleBackend` (URL + API key from `FULCRUM_INFERENCE_URL` + `FULCRUM_INFERENCE_API_KEY`, gated by `external-llm-provider` flag). `InferenceClient` selects backend via `FULCRUM_INFERENCE_BACKEND` env + per-feature flag qualifier (e.g. `embeddings:ollama`, `router-llm:embedded`). Per-feature backend routing config exposed in web settings.

## Acceptance criteria
- [ ] TS wrapper: `src/inference/backends/index.ts` exports `InferenceBackend` interface with `embed()`, `generate()`, `classify()`, `tokenize()`, `health()` methods; all four backend classes implement it; TypeScript strict-mode clean.
- [ ] TS wrapper: `@Injectable() InferenceClient` reads `FULCRUM_INFERENCE_BACKEND` (global default) + feature-qualifier map (`embeddings:ollama` → Ollama for embed calls, `router-llm:embedded` → Embedded for generate calls); falls back to `embedded` when no env set.
- [ ] TS wrapper: `OllamaBackend` and `LmStudioBackend` are gated — activated only when `isEnabled('embeddings:ollama')` etc.; `OpenAICompatibleBackend` gated by `isEnabled('external-llm-provider')`.
- [ ] CLI command: `FULCRUM_INFERENCE_BACKEND=ollama fulcrum inference status --json` shows `backend: "ollama"` in health output; `FULCRUM_INFERENCE_BACKEND=embedded` shows `backend: "embedded"`.
- [ ] TUI screen: backend selector in Settings → Inference screen (slice 13) reads from `inference.backends.list()` tRPC; shows flag-gated availability labels.
- [ ] Web/API surface: `/settings/inference` backend selector reads `inference.backends.list()`; gated backends shown as "requires flag X" tooltip; active backend highlighted.
- [ ] Tests: unit tests for all four backends mock their respective HTTP/socket calls; assert they implement `InferenceBackend`; `FULCRUM_INFERENCE_BACKEND=ollama` test mocks `localhost:11434` and asserts `embed()` routes there; `openai-compatible` test asserts `isEnabled('external-llm-provider')` gate respected. `bun test src/inference/backends/__tests__/` green.

## Blocked by
04-trpc-procedures-and-health-surface

## Notes
- `OllamaBackend.embed()` → `POST http://localhost:11434/api/embed { model, input }`.
- `LmStudioBackend` uses OpenAI-compat `/v1/embeddings` + `/v1/chat/completions`.
- `OpenAICompatibleBackend` reads `FULCRUM_INFERENCE_URL` + `FULCRUM_INFERENCE_API_KEY`; no vendor SDK added — raw `fetch` with OpenAI-compat JSON.
- Per-feature qualifier format: `FULCRUM_FEATURES=embeddings:ollama,router-llm:embedded`; parsed in `client.ts` feature-qualifier map.
