# Model Recommendations For Fulcrum RAG, Reranking, And Chat

Date: 2026-04-24
Status: recommended defaults

## Goal

Fulcrum should recommend strong model defaults without locking users to one provider. The product contract is provider-neutral:

- chat/extraction endpoint
- embedding endpoint
- optional reranking endpoint
- stable embedding model and dimensions recorded before indexing

Any provider that satisfies those contracts can work.

## Research Sources

- LightRAG README: https://github.com/HKUDS/LightRAG
- Qwen3 Embedding/Reranker official release: https://qwenlm.github.io/blog/qwen3-embedding/
- Qwen3 official release: https://qwenlm.github.io/blog/qwen3/
- Ollama embeddings docs: https://docs.ollama.com/capabilities/embeddings
- Voyage AI `voyage-code-3` release: https://blog.voyageai.com/2024/12/04/voyage-code-3/
- Mistral Codestral Embed docs: https://docs.mistral.ai/models/codestral-embed-25-05/
- Cohere Rerank docs: https://docs.cohere.com/docs/reranking
- Gemini Embedding docs: https://ai.google.dev/gemini-api/docs/embeddings
- OpenAI GPT-5 developer docs: https://openai.com/index/introducing-gpt-5-for-developers/
- OpenAI GPT-5.5 announcement: https://openai.com/index/introducing-gpt-5-5/
- OpenAI embeddings API docs: https://developers.openai.com/api/docs/api-reference/embeddings/create
- OpenAI gpt-oss release: https://openai.com/index/introducing-gpt-oss/

## Model Selection Rules

1. Do not auto-download large models without explicit user consent.
2. Do not hardcode Ollama. Ollama is one preset for local OpenAI-compatible endpoints.
3. Record `embedding_model`, `embedding_dimensions`, and provider kind before indexing.
4. Changing embedding model or dimensions requires rebuilding affected vector indexes.
5. Use separate recommendations for markdown/memory retrieval, code semantic retrieval, reranking, LightRAG extraction/query chat, and agent orchestration/chat.
6. Default to local-first recommendations; remote models are opt-in quality tiers.

## Recommended Defaults

### Normal Local Machine

| Use | Recommended | Why |
|---|---|---|
| Memory/doc embeddings | `Qwen3-Embedding-0.6B` | strong multilingual/code-capable open model, 1024 dims, 32K sequence length, practical local size |
| Code semantic embeddings | `Qwen3-Embedding-0.6B` first; code-specific remote optional | keeps one local embedding model across docs/code early; code-specific remote can be opt-in |
| Reranker | `Qwen3-Reranker-0.6B` if provider supports it; otherwise `BAAI/bge-reranker-v2-m3` | Qwen3 stronger on code/multilingual benchmarks; BGE reranker is stable and widely deployable |
| Chat/extraction | `Qwen3-14B` if available; `Qwen3-8B` as low-resource fallback | 128K context on 8B/14B, Apache 2.0, good agent/coding support |
| Reasoning fallback | `gpt-oss-20b` | local open-weight reasoning option for 16GB+ memory machines |

### High-Quality Local Workstation

| Use | Recommended | Why |
|---|---|---|
| Memory/doc embeddings | `Qwen3-Embedding-4B` or `Qwen3-Embedding-8B` | higher retrieval quality, flexible dimensions |
| Code semantic embeddings | `Qwen3-Embedding-4B/8B` local; remote `Codestral Embed` or `voyage-code-3` optional | Qwen handles code and multilingual; code-specialized APIs can improve code-only retrieval |
| Reranker | `Qwen3-Reranker-4B` | strong rerank quality without 8B cost |
| Chat/extraction | `Qwen3-30B-A3B` or `Qwen3-32B` | better graph extraction and multi-hop query quality |
| Long reasoning | `gpt-oss-20b` or `Qwen3-30B-A3B` | strong local reasoning/tool use depending on runtime |

### Remote Opt-In Quality

| Use | Recommended | Why |
|---|---|---|
| Code embeddings | `Codestral Embed` or `voyage-code-3` | code-specialized embeddings for repository search |
| General/multimodal embeddings | `gemini-embedding-001` | flexible dimensions and strong general embedding option |
| General embeddings | `text-embedding-3-large` | stable widely supported OpenAI embedding baseline |
| Reranking | `rerank-v4.0-pro` or `rerank-v4.0-fast` | Cohere multilingual reranker options |
| Agent/chat | `gpt-5` stable API; `gpt-5.5` when API is available | frontier coding/agentic quality, remote only |

Remote providers must show visible opt-in status in `doctor` and config.

## Ollama Preset

Ollama is a convenience preset, not a dependency.

Recommended Ollama preset values:

```toml
[memory.provider]
kind = "openai-compatible"
base_url = "http://127.0.0.1:11434/v1"
api_key_env = "FULCRUM_LLM_API_KEY"
chat_model = "qwen3:14b"
embedding_model = "qwen3-embedding:0.6b"
embedding_dimensions = 1024
reranker_model = ""
```

Fallback when `qwen3-embedding` is unavailable:

```toml
embedding_model = "embeddinggemma"
embedding_dimensions = 768
```

Low-resource fallback:

```toml
chat_model = "qwen3:8b"
embedding_model = "all-minilm"
embedding_dimensions = 384
```

`all-minilm` is convenience-only. It should not be presented as best quality.

## LM Studio / vLLM / llama.cpp Presets

These presets should use the same generic provider schema:

```toml
[memory.provider]
kind = "openai-compatible"
base_url = "http://127.0.0.1:<port>/v1"
api_key_env = "FULCRUM_LLM_API_KEY"
chat_model = "<user-selected-chat-model>"
embedding_model = "<user-selected-embedding-model>"
embedding_dimensions = <required>
```

Doctor must verify:

- `/v1/models` when available
- embedding request returns vector length equal to `embedding_dimensions`
- chat request returns text
- reranker endpoint works when configured

## Use-Case Matrix

| Fulcrum use case | Local default | Quality local | Remote opt-in |
|---|---|---|---|
| Markdown memory RAG embeddings | `Qwen3-Embedding-0.6B` | `Qwen3-Embedding-4B/8B` | `gemini-embedding-001`, `text-embedding-3-large` |
| Code semantic search embeddings | `Qwen3-Embedding-0.6B` | `Qwen3-Embedding-4B/8B` | `Codestral Embed`, `voyage-code-3` |
| Context pack reranking | `Qwen3-Reranker-0.6B` or `bge-reranker-v2-m3` | `Qwen3-Reranker-4B` | Cohere `rerank-v4.0-fast/pro` |
| LightRAG entity extraction | `Qwen3-14B` | `Qwen3-30B-A3B` / `Qwen3-32B` | `gpt-5`, `gpt-5.5` when available |
| Agent task/chat reasoning | `Qwen3-14B`, `gpt-oss-20b` | `Qwen3-30B-A3B`, `Qwen3-32B` | `gpt-5`, `gpt-5.5` when available |
| Low-resource local | `all-minilm` + `Qwen3-8B` | not applicable | remote provider |

## Doctor Requirements

`fulcrum setup doctor memory` must check:

```text
provider.kind
provider.base_url
chat_model
embedding_model
embedding_dimensions
chat endpoint smoke
embedding endpoint smoke
returned embedding vector length == embedding_dimensions
reranker endpoint smoke when configured
```

If a vector index already exists and provider dimensions changed:

```text
status=blocked
reason=embedding model/dimensions changed after indexing
fix=fulcrum index rebuild --vectors
```

If provider is missing:

```text
dependency=memory-provider status=blocked
why=LightRAG needs both LLM and embedding endpoints for extraction/query.
presets=ollama-local,lmstudio-local,vllm-local,llama-cpp-local,localai,openai-compatible
```

## Setup UX

Human local-first path:

```bash
fulcrum setup provider preset ollama-local --chat-model qwen3:14b --embedding-model qwen3-embedding:0.6b --embedding-dimensions 1024
fulcrum setup doctor memory
```

Generic endpoint path:

```bash
fulcrum setup provider configure \
  --kind openai-compatible \
  --base-url http://127.0.0.1:1234/v1 \
  --chat-model qwen3-14b \
  --embedding-model Qwen3-Embedding-0.6B \
  --embedding-dimensions 1024
fulcrum setup doctor memory
```

Remote opt-in path:

```bash
fulcrum setup provider configure \
  --kind openai-compatible \
  --base-url https://api.example.com/v1 \
  --api-key-env FULCRUM_LLM_API_KEY \
  --chat-model gpt-5 \
  --embedding-model text-embedding-3-large \
  --embedding-dimensions 3072
fulcrum setup doctor memory
```

## Recommendation To Implement

1. Add provider model catalog to setup docs and `doctor`.
2. Make `Qwen3-Embedding-0.6B` + `Qwen3-Reranker-0.6B` + `Qwen3-14B` the recommended normal local tier.
3. Keep `embeddinggemma` as Ollama fallback, not primary best model.
4. Keep `BAAI/bge-reranker-v2-m3` as stable reranker fallback.
5. Recommend `Codestral Embed` / `voyage-code-3` only for remote opt-in code search.
6. Always record dimensions and block silent dimension drift.
7. Surface privacy status for remote providers in cockpit and doctor.
