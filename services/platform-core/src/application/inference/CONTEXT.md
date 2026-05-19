# Inference

JSON-RPC client and backend-routing layer that brokers embed/generate/classify/tokenize calls between Fulcrum surfaces and one embedded sidecar plus three external OpenAI-compatible backends.

## Language

**InferenceBackend**:
A concrete provider implementing `embed`/`generate`/`classify`/`tokenize`/`health` against one `BackendId`.
_Avoid_: provider, engine, driver, llm host

**BackendId**:
The enum value identifying a backend: `embedded | ollama | lm-studio | openai-compatible`.
_Avoid_: backend name, vendor, runtime tag

**EmbeddedSidecar**:
The Rust `inference-server` process the lifecycle owns over a unix socket at `$FULCRUM_HOME/inference.sock`.
_Avoid_: local server, daemon, embedded backend process

**InferenceLifecycle**:
The supervisor that spawns, readiness-probes, caches, and stops the **EmbeddedSidecar**, and is the only component allowed to launch a backend.
_Avoid_: process manager, runner, sidecar manager

**InferenceClient**:
The NestJS-injectable JSON-RPC client that frames requests, retries on transient socket errors, and parses backend results with Zod.
_Avoid_: rpc wrapper, sdk, caller, stub

**InferenceTransport**:
A pluggable `(request) => Promise<response>` function the client uses instead of the default unix-socket transport (tests, in-process callers).
_Avoid_: dialer, channel, link

**JsonRpcFrame**:
The length-prefixed wire frame (4-byte big-endian length + UTF-8 JSON body) carrying one `InferenceRequest` or `InferenceResponse`.
_Avoid_: packet, message, envelope

**InferenceFeature**:
A routing key identifying a caller-side use case: `embeddings | router-llm | memory-llm-extract | classify | tokenize`.
_Avoid_: capability, intent, channel

**FeatureBackendMap**:
The in-memory `InferenceFeature -> BackendId` map seeded from `FULCRUM_FEATURES` and mutated at runtime by tRPC/CLI without restart.
_Avoid_: routing table, dispatch map, config

**BackendProbe**:
A single live `embed` or `generate` call against a backend's OpenAI-compatible HTTP endpoint, recording `ok`, `dimensions`, `durationMs`.
_Avoid_: ping, health check, smoke test

**BackendHealth**:
The aggregate per-backend snapshot (`configured`, `enabled`, `status`, `embedProbe`, `generateProbe`, `dimensions`, `reason`) returned to surfaces.
_Avoid_: status row, diagnostic, report

**EmbeddingModelMetadata**:
The `(modelId, dimensions)` pair resolved from a known-models table; unknown ids fail closed with `InferenceError`.
_Avoid_: model spec, embedding config

**InferenceError**:
The domain error thrown when an RPC returns a JSON-RPC error, a frame is malformed, or a dimension assertion fails; carries `code` and `backend`.
_Avoid_: rpc error, generic Error

## Relationships

- An **InferenceClient** delegates to an **InferenceTransport** that defaults to a unix-socket dialer against the **EmbeddedSidecar**.
- The **InferenceLifecycle** owns exactly one **EmbeddedSidecar**; external **InferenceBackends** are probed only and never launched.
- An **InferenceFeature** resolves to one **BackendId** via the **FeatureBackendMap**, then to a concrete **InferenceBackend**.
- A **BackendHealth** aggregates two **BackendProbes** (embed + generate) per non-embedded **BackendId**; the embedded entry derives state from socket presence.
- An `embed` result is checked against **EmbeddingModelMetadata** dimensions before returning to a caller.
- Every wire call is one **JsonRpcFrame** in, one **JsonRpcFrame** out; transport errors raise **InferenceError**.

## Example dialogue

> **Dev:** "If a tRPC call sets `embeddings` to `ollama`, does the **EmbeddedSidecar** still start?"
> **Domain expert:** "Only if some other **InferenceFeature** still maps to `embedded`. `ensureRunningIfEmbedded` checks the **FeatureBackendMap** before the **InferenceLifecycle** spawns anything."
> **Dev:** "And if Ollama answers `embed` but fails `generate`?"
> **Domain expert:** "The **BackendHealth** for Ollama becomes `degraded` — one **BackendProbe** ok, one not — and the `reason` field carries the generate error."

## Flagged ambiguities

- "backend" was used both for an **InferenceBackend** instance and for the network endpoint it talks to — resolved: the class is the **InferenceBackend**, the endpoint URL lives in the probe config.
- "health" overlapped the JSON-RPC `health` method result, the **InferenceLifecycle** `status()` output, and the per-backend **BackendHealth** — resolved: `HealthResult` is the sidecar's self-report, `InferenceStatus` is the lifecycle's view of the sidecar process, **BackendHealth** is the surface-facing aggregate across all backends.
- "model" referred to both a **BackendId**-scoped string (e.g. `llama3.2`) and an **EmbeddingModelMetadata** entry — resolved: only embed models carry typed metadata; generate/classify model ids are opaque strings passed through to the backend.
