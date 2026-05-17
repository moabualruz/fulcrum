# Inference Runtime

Rust workspace that runs local inference for Fulcrum: text embedding, classification, tokenization, and grammar-constrained text generation. Exposes a single JSON-RPC 2.0 surface over Unix-domain socket or stdio. Sits outside the NestJS/TypeORM service tier — its boundary is the line-delimited JSON protocol, not a TypeScript module import.

## Language

**RuntimeServer**:
The `inference-server` binary that owns the JSON-RPC dispatcher, transport, and on-disk cache.
_Avoid_: daemon, host, service process, inference daemon.

**Transport**:
The wire framing carrying RPC requests — either Unix-domain `Socket` (with line or 4-byte length-prefixed frames) or `Stdio`.
_Avoid_: channel, connection, IPC, pipe.

**Method**:
A single JSON-RPC verb the runtime answers: `health`, `embed`, `classify`, `tokenize`, `generate`, `models.list`, `models.pull`, `models.rm`.
_Avoid_: endpoint, route, op, command, action.

**Embedding**:
A fixed-dimension `Vec<f32>` produced from input text by an embed `Model` (default 384 dims, `BAAI/bge-small-en-v1.5`).
_Avoid_: vector, encoding, representation (use only when speaking generically about the `Vec<f32>` payload, not the concept).

**Classification**:
Cosine-similarity scoring of a text against a caller-supplied label set, built on top of `Embedding`.
_Avoid_: labelling, tagging, intent detection.

**Generation**:
Producing text from a prompt via a generate `Model`, optionally constrained by a JSON Schema converted to GBNF `Grammar`.
_Avoid_: completion, sampling, LLM call, chat.

**Grammar**:
A GBNF rule set derived from a JSON Schema that constrains `Generation` output shape; falls back to free-text plus post-hoc validation when the schema uses unsupported constructs (`$ref`, `oneOf`, `anyOf`, `allOf`).
_Avoid_: schema, constraint, validator (those are inputs/outputs, not the GBNF itself).

**Tokenization**:
Splitting text into tokens — either by a `tokenizer.json` file when a path is supplied, or by whitespace as a model-free baseline.
_Avoid_: chunking, splitting, parsing.

**Model**:
A named, downloadable artefact (`embed` or `generate` kind) declared in `models.toml` with `id`, `url`, `sha256`, `size_bytes`; lives on disk under `$FULCRUM_HOME/models/`.
_Avoid_: backend, engine, weights, checkpoint, runtime.

**ModelManager**:
The component that reads `models.toml`, lists installed models, downloads (`ensure`) missing ones from HuggingFace, and removes them.
_Avoid_: loader, registry, downloader.

**CacheStore**:
SQLite-backed (`$FULCRUM_HOME/inference-cache.db`) store with two tables: `embed_cache` (keyed by `model + input_hash`, 7-day TTL) and `generate_cache` (keyed by `model + prompt_hash + options_hash`, 1-hour TTL).
_Avoid_: database, store, memo, registry.

**DeterministicMode**:
The `SKIP_MODEL_DOWNLOAD=1` path that bypasses real model loading and returns reproducible FNV-derived vectors / stub text. Used by tests and CI.
_Avoid_: mock mode, fake mode, test mode, offline mode.

## Relationships

- A **RuntimeServer** chooses exactly one **Transport** per process (Socket when `FULCRUM_HOME` is set and stdin is not a stream, otherwise Stdio); `--socket` / `--stdio` flags override.
- A **RuntimeServer** dispatches each **Method** to a handler in `inference-embed` or `inference-generate`.
- An **Embedding** is produced by one embed **Model**; a **Classification** consumes one or more **Embeddings** (one for the text, one per label) and emits sorted `ClassificationScore`s.
- A **Generation** uses one generate **Model** and zero or one **Grammar**; supplying a JSON Schema yields a **Grammar**, an invalid schema returns `GRAMMAR_ERROR (-32602)`.
- A **CacheStore** memoises **Embedding** results keyed by `(model, input_hash)` and unconstrained **Generation** results keyed by `(model, prompt_hash, options_hash)`; schema-bearing **Generation** calls bypass the cache.
- A **ModelManager** owns the on-disk lifecycle of every **Model**; `models.list / models.pull / models.rm` are its **Methods**.
- **DeterministicMode** short-circuits the **Model** call inside `embed` and `classify` (returns FNV-derived vectors) and inside `generate` (returns stub text). It does not bypass the **CacheStore**.

## Example dialogue

> **Dev:** "If I send the same `embed` request twice, do I hit the embedding **Model** twice?"
> **Domain expert:** "No — the second call is a **CacheStore** hit keyed on `model + input_hash`. The response has `cached: true` and the **Model** is not touched. TTL is 7 days."
> **Dev:** "And if I pass a JSON Schema to `generate`?"
> **Domain expert:** "That builds a **Grammar** to constrain the **Generation**, and the **CacheStore** is skipped entirely — schema-bearing requests are never cached, so a schema change can't return stale text."

## Flagged ambiguities

- "model" was used for both the **Model** artefact (file on disk, manifest entry) and the in-process `TextEmbedding` handle — resolved: **Model** is the artefact/definition; the runtime handle is not a domain term.
- "backend" appears in the `health` response (`backends: []`) but is currently unused — treat it as reserved protocol surface, not a domain concept; do not coin a `Backend` term until populated.
- "cache" was used for both the SQLite **CacheStore** and the on-disk **Model** files under `$FULCRUM_HOME/models/` — resolved: **CacheStore** is the RPC-result memo only; downloaded model files are a **ModelManager** concern, not a cache.
- "classify" vs "embed" — **Classification** is built on **Embedding**, not a separate **Model** kind for the default path; the `classify` **Model** kind in `models.toml` exists in the enum but has no entries today.
- "tokens_used" in `GenerateResponse` is whitespace-split word count of the stub output, not real tokenizer output — do not conflate with **Tokenization** results from the `tokenize` **Method**.
