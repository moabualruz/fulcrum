# Inference Backends

Concrete HTTP backend adapters that translate the parent area's `InferenceBackend` interface into each provider's wire protocol, plus a client that selects which adapter handles a given feature call.

## Language

**EmbeddedBackend**:
HTTP adapter that talks to the local inference sidecar at `http://localhost:8384` using Fulcrum-native `/embed`, `/generate`, `/classify`, `/tokenize` routes.
_Avoid_: native backend, local backend, in-process backend

**OllamaBackend**:
HTTP adapter for an Ollama daemon at `http://localhost:11434` using `/api/embed`, `/api/generate`, and `/api/tags` routes.
_Avoid_: ollama client, ollama driver

**LmStudioBackend**:
OpenAI-compatible HTTP adapter targeted at LM Studio's `http://localhost:1234/v1` server.
_Avoid_: lmstudio backend, lmstudio adapter

**OpenAICompatibleBackend**:
OpenAI-compatible HTTP adapter for any external `/v1` endpoint, gated by the `external-llm-provider` feature flag and configured via `FULCRUM_INFERENCE_URL` + `FULCRUM_INFERENCE_API_KEY`.
_Avoid_: openai backend, external backend, cloud backend

**SimulatedClassify**:
The `classify` path on `OllamaBackend`, `LmStudioBackend`, and `OpenAICompatibleBackend` that synthesizes a label by prompting `generate` and string-matching the response against the requested labels.
_Avoid_: fake classify, fallback classify

**EstimatedTokenize**:
The `tokenize` path that returns `count = ceil(input.length / 4)` with an empty `tokens` array when a backend has no real tokenizer endpoint.
_Avoid_: stub tokenize, dummy tokenize

**BackendInfo**:
A `{ id, available, requiredFlag }` row produced by `InferenceClient.listBackends` describing whether an adapter can currently be selected.
_Avoid_: backend descriptor, backend entry

**RequiredFlag**:
The flag string (`external-llm-provider`, `embeddings:ollama`, `embeddings:lm-studio`) a caller must enable in `FULCRUM_FEATURES` before the matching adapter is treated as enabled.
_Avoid_: gate, capability flag

## Relationships

- Each adapter (`EmbeddedBackend`, `OllamaBackend`, `LmStudioBackend`, `OpenAICompatibleBackend`) implements one `InferenceBackend` and owns one `BackendId`.
- `InferenceClient.resolveBackend(feature)` calls `selectBackend` from the parent routing config, then instantiates exactly one adapter via `createBackend`.
- `OllamaBackend`, `LmStudioBackend`, and `OpenAICompatibleBackend` route `classify` through `SimulatedClassify`, which calls their own `generate`.
- `LmStudioBackend` and `OpenAICompatibleBackend` route `tokenize` through `EstimatedTokenize`; `OllamaBackend` falls back to `EstimatedTokenize` only if `/api/tokenize` fails.
- `OpenAICompatibleBackend` is only reported `available` by `InferenceClient.listBackends` when its `RequiredFlag` is present in `FULCRUM_FEATURES`.

## Example dialogue

> **Dev:** "If I call `classify` on the `OllamaBackend`, what actually hits the wire?"
> **Domain expert:** "One `/api/generate` request — `SimulatedClassify` builds a labels prompt, then string-matches the response. There's no real `/classify` route on Ollama."
> **Dev:** "And `tokenize` on `LmStudioBackend`?"
> **Domain expert:** "Pure `EstimatedTokenize` — `ceil(len/4)`, empty tokens array. LM Studio has no tokenize endpoint, so we never go to the wire."

## Flagged ambiguities

- "OpenAI-compatible" applies to both `LmStudioBackend` (which speaks `/v1/*` against a fixed local URL) and `OpenAICompatibleBackend` (which speaks `/v1/*` against any URL behind a flag) — resolved: `LmStudioBackend` is a fixed-URL convenience adapter, `OpenAICompatibleBackend` is the generic flag-gated one.
- "available" overlapped "is the process running" and "is the flag enabled" — resolved: `BackendInfo.available` only reflects routing/flag eligibility; live reachability lives in the parent area's `BackendHealth`.
