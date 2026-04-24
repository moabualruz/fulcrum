# Model Recommendations Roadmap Input
- Source: /home/mkh/workspace/pi-stack-plan/docs/research/2026-04-24-model-recommendations.md

## Must Carry Into Roadmap
- Provider model support must stay provider-neutral: chat/extraction endpoint, embedding endpoint, optional reranking endpoint, stable embedding model and dimensions recorded before indexing.
- Setup must not auto-download large models without explicit user consent.
- Ollama should be a convenience preset for local OpenAI-compatible endpoints, not a hard dependency or hardcoded provider.
- Recommended normal local tier: `Qwen3-Embedding-0.6B`, `Qwen3-Reranker-0.6B` when supported, `Qwen3-14B`; `Qwen3-8B` as low-resource chat fallback.
- Recommended quality local tier: `Qwen3-Embedding-4B/8B`, `Qwen3-Reranker-4B`, `Qwen3-30B-A3B` or `Qwen3-32B`.
- Remote providers are opt-in quality tiers only; show remote/privacy status in `doctor`, config, and cockpit.
- Embedding model and dimension changes after indexing must block use until affected vector indexes are rebuilt.
- Separate recommendations are needed for markdown memory retrieval, code semantic retrieval, reranking, LightRAG extraction/query chat, and agent orchestration/chat.

## Milestone Impacts
- Provider setup milestone: add generic `openai-compatible` provider configuration plus presets for `ollama-local`, LM Studio, vLLM, llama.cpp, LocalAI, and remote endpoints.
- Doctor milestone: implement `fulcrum setup doctor memory` checks for provider config, `/v1/models` when available, chat smoke, embedding smoke, vector length match, and reranker smoke when configured.
- Indexing milestone: persist `embedding_model`, `embedding_dimensions`, and provider kind with vector index metadata; add blocked status and rebuild guidance for dimension drift.
- Documentation milestone: add provider model catalog, local/quality/remote recommendation tiers, low-resource fallbacks, and sample setup commands.
- Cockpit milestone: surface provider kind, configured models, embedding dimensions, remote opt-in/privacy state, and rebuild-needed state.
- RAG/LightRAG milestone: require both LLM and embedding endpoints for extraction/query; treat reranking as optional but discoverable.

## Acceptance Criteria
- `fulcrum setup provider preset ollama-local --chat-model qwen3:14b --embedding-model qwen3-embedding:0.6b --embedding-dimensions 1024` writes provider config without downloading models implicitly.
- Generic provider setup accepts `--kind openai-compatible`, `--base-url`, `--api-key-env`, `--chat-model`, `--embedding-model`, and `--embedding-dimensions`.
- `fulcrum setup doctor memory` reports blocked when provider config is missing and lists supported presets.
- Doctor verifies returned embedding vector length equals configured `embedding_dimensions`.
- Doctor verifies chat endpoint returns text and reranker endpoint works when `reranker_model` is configured.
- Existing vector indexes become blocked when configured embedding model or dimensions differ from stored index metadata; output includes `fulcrum index rebuild --vectors`.
- `embeddinggemma` and `all-minilm` are documented as fallbacks/convenience options, not best-quality defaults.
- Remote model choices such as `Codestral Embed`, `voyage-code-3`, `gemini-embedding-001`, `text-embedding-3-large`, Cohere rerank, `gpt-5`, and `gpt-5.5` are labeled opt-in.

## Risks / Open Questions
- Availability of `qwen3-embedding:0.6b` in Ollama may vary; fallback path must be explicit.
- Reranker endpoint shape is not standardized across OpenAI-compatible providers; need adapter contract or provider-specific checks.
- `gpt-5.5` API availability is conditional in source; roadmap should avoid making it required.
- Need decide where index metadata lives and how many indexes are affected by model/dimension drift.
- Need decide cockpit wording for remote privacy status and whether remote providers require additional confirmation.
- Need clarify whether provider catalog is static documentation, runtime data, or both.

## Links To Preserve
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
