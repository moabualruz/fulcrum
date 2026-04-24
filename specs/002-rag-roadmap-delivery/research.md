# Research: Fulcrum RAG Roadmap Delivery

**Feature**: [Fulcrum RAG Roadmap Delivery](./spec.md)
**Created**: 2026-04-23
**Research method**: Project roadmap review plus online primary-source research. Tavily CLI was attempted but unavailable because no `TAVILY_API_KEY` is configured, so online research used official/public source pages directly.

## Source-Grounded Decisions

### Decision 1: Stabilize current local RAG before optional runtime refactors

**Decision**: P1 work must repair live derived indexes, provider/model/device truth, unified search, and eval gates before adopting optional runtimes or stores as defaults.

**Rationale**: The roadmap shows current live vectors and graph are empty/degraded even though architectural intent is strong. Optional stores or sidecars would not fix trust if health, coverage, provenance, and eval gates remain weak.

**Alternatives considered**:
- Start with a new vector store or sidecar: rejected for P1 because it shifts infrastructure before baseline truth exists.
- Rewrite the control plane: rejected because roadmap explicitly says TypeScript control plane remains a good fit.

**Sources**:
- Local roadmap: `/home/mkh/workspace/pi-stack-plan/docs/audit/2026-04-23-fulcrum-rag-10-roadmap-research.md`

### Decision 2: Use hybrid, multi-stage retrieval as the target quality contract

**Decision**: Unified context search must combine lexical, semantic, metadata/freshness, and graph signals, then use bounded fusion/diversification/reranking before context packing.

**Rationale**: Anthropic reports that contextual embeddings plus BM25 reduced top-20 retrieval failure by 49%, and reranking reduced it by 67%. Qdrant documents sparse+dense prefetches fused by reciprocal rank fusion. LanceDB also treats hybrid search as semantic plus full-text search merged by reranking. Vespa documents phased ranking where broad first-stage retrieval stays cheap and later reranking is bounded.

**Alternatives considered**:
- Dense-vector-only retrieval: rejected because exact identifiers, symbols, paths, error codes, and technical terms need lexical matching.
- One heavy rerank pass over all candidates: rejected because multi-stage ranking gives bounded cost and observable latency.

**Sources**:
- [Anthropic Contextual Retrieval](https://www.anthropic.com/engineering/contextual-retrieval)
- [Qdrant Hybrid Queries](https://qdrant.tech/documentation/search/hybrid-queries/)
- [LanceDB Hybrid Search](https://docs.lancedb.com/search/hybrid-search)
- [Vespa Phased Ranking](https://docs.vespa.ai/en/ranking/phased-ranking.html)

### Decision 3: Keep contextual index text separate from canonical source content

**Decision**: Fulcrum should preserve raw source/chunk content as canonical evidence and store contextual index text as a retrieval-only representation with context versioning and source hashes.

**Rationale**: Anthropic's contextual retrieval method prepends chunk-specific context for embedding and BM25 indexing. Fulcrum's L0/L1 provenance means it can add retrieval context without corrupting the canonical source.

**Alternatives considered**:
- Rewrite chunk content with added context: rejected because it blurs provenance and makes exact citation less trustworthy.
- Use only document-level summaries: rejected because chunk-local context directly addresses missing local context.

**Sources**:
- [Anthropic Contextual Retrieval](https://www.anthropic.com/engineering/contextual-retrieval)

### Decision 4: Treat code RAG as a distinct evidence subsystem under one planner

**Decision**: Code retrieval should be unified at the query surface but preserve code-specific stages: path/symbol matching, lexical code search, dense code retrieval, dependency/graph expansion, line ranges, and code-specific provenance.

**Rationale**: Zoekt is a mature source-code search engine built around substring/regexp search, symbol-aware ranking, trigram indexing, and syntactic parsing. Qwen3 Embedding explicitly advertises code retrieval capability. BGE-M3 supports dense, sparse, and multi-vector retrieval, making it a strong future experiment for hybrid code/file search.

**Alternatives considered**:
- Force code chunks through the same memory-only index: rejected because code needs path, symbol, dependency, and line-range semantics.
- Replace all code search immediately: rejected because existing code search compatibility should remain while unified context search becomes the agent-preferred entry point.

**Sources**:
- [Zoekt](https://github.com/sourcegraph/zoekt)
- [Qwen3-Embedding-0.6B model card](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B)
- [BGE-M3 model card](https://huggingface.co/BAAI/bge-m3)

### Decision 5: Graph evidence must be rebuilt, measured, and explainable

**Decision**: Graph retrieval should not be optional decoration. Repair, health, evals, and explain output must report graph coverage, freshness, contribution, and source references.

**Rationale**: Microsoft Research describes GraphRAG/DRIFT as combining global and local search to improve comprehensiveness and diversity. Fulcrum's roadmap needs relationship recall across tasks, decisions, files, symbols, errors, fixes, and memory entities; that requires live graph coverage and explainable graph contribution.

**Alternatives considered**:
- Keep graph as future-only work: rejected for the roadmap target because empty graph coverage blocks 10/10 RAG.
- Use graph results without explain fields: rejected because operators and agents need to know when graph expansion changed evidence or ranking.

**Sources**:
- [Microsoft Research DRIFT Search](https://www.microsoft.com/en-us/research/blog/introducing-drift-search-combining-global-and-local-search-methods-to-improve-quality-and-efficiency/)

### Decision 6: Evaluate retrieval, grounding, answer quality, latency, and coverage separately

**Decision**: Fulcrum evals must separate retrieval relevance/ranking, context precision/recall, groundedness/provenance, answer correctness, citation accuracy, latency, freshness, and coverage.

**Rationale**: LangSmith's RAG evaluation tutorial separates correctness, groundedness, relevance, and retrieval relevance. Ragas lists RAG metrics including context precision, context recall, response relevancy, and faithfulness. The roadmap's failure mode is exactly that fixture evals can pass while live vectors and graph are empty, so eval gates need both quality and coverage dimensions.

**Alternatives considered**:
- Answer correctness only: rejected because a correct answer can hide bad retrieval or missing provenance.
- Fixture evals only: rejected because current fixture evals can pass while live indexes are degraded.

**Sources**:
- [LangSmith RAG eval tutorial](https://docs.langchain.com/langsmith/evaluate-rag-tutorial)
- [Ragas metrics](https://docs.ragas.io/en/stable/concepts/metrics/)

### Decision 7: Make runtime truth explicit and fail closed on explicit device/provider requests

**Decision**: Jobs, traces, health reports, and eval artifacts must distinguish requested provider/model/device/dimensions from actual runtime values. Explicit runtime requirements fail closed when unavailable; automatic fallback is allowed only when configured and reported.

**Rationale**: ONNX Runtime CUDA provider configuration exposes explicit provider options such as `device_id`. The roadmap identifies silent fallback and copied requested fields as operational truth gaps. RAG quality reports are misleading if actual runtime differs from requested runtime and that difference is hidden.

**Alternatives considered**:
- Always fallback automatically: rejected because explicit accelerator/operator intent must be honored.
- Store only requested runtime fields: rejected because actual runtime truth is needed for debugging, reproducibility, and eval interpretation.

**Sources**:
- [ONNX Runtime CUDA Execution Provider](https://onnxruntime.ai/docs/execution-providers/CUDA-ExecutionProvider.html)

### Decision 8: Optional vector-store/runtime upgrades require adapter boundaries and proof gates

**Decision**: Keep the local baseline first. Add adapter boundaries and experiments for future indexer/model-serving/vector-store paths, but require quality, latency, local-first, rollback, and risk comparison before any default switch.

**Rationale**: Qdrant and LanceDB provide strong hybrid-search options; Vespa provides search-engine-grade phased ranking. These sources support future upgrade paths, but the roadmap's best route is to repair and measure the current system first.

**Alternatives considered**:
- Switch immediately to the highest-ceiling platform: rejected because operational complexity can rise before evidence proves benefit.
- Avoid adapters entirely: rejected because 10/10 roadmap needs a path to higher-quality stores/model serving when sqlite-vec or in-process inference becomes the bottleneck.

**Sources**:
- [Qdrant Hybrid Queries](https://qdrant.tech/documentation/search/hybrid-queries/)
- [LanceDB Hybrid Search](https://docs.lancedb.com/search/hybrid-search)
- [Vespa Phased Ranking](https://docs.vespa.ai/en/ranking/phased-ranking.html)

## Clarification Defaults Chosen From Research

1. **Repair strategy**: verify and repair derived state from canonical sources; do not require a full clean-slate DB/vault rebuild for every run. Clean-slate rebuild remains available only when explicitly requested and scoped.
2. **Ranking strategy**: use hybrid recall plus rank fusion/diversification/reranking; no vector-only default.
3. **Context strategy**: index contextualized text, return canonical snippets with provenance and explain fields.
4. **Eval strategy**: fixture evals for deterministic contracts plus live evals for real workspace coverage.
5. **Device policy**: explicit runtime request fails closed; auto fallback is visible and gated.
6. **Future runtime policy**: optional runtimes/stores are experiments until evals prove quality/latency gains and rollback safety.

## Product Requirements Added Or Sharpened

- Added terminology for hybrid retrieval, multi-stage retrieval, contextual index text, live corpus eval, runtime truth, and healthy RAG state.
- Added bounded expensive reranking/expansion requirement and explain-output visibility for candidate limits.
- Added eval threshold requirement before suite execution.
- Tightened cross-domain unified search success to top 10.
- Tightened code RAG success to top 5.
- Added eval report metrics: recall@K, MRR/nDCG, context precision/recall, groundedness/provenance, citation accuracy, latency p50/p95, and coverage.

## Risks And Mitigations

- **Scope creep from optional runtimes**: keep optional runtime/store adoption behind proof gates and outside P1 default delivery.
- **Eval false confidence**: make live coverage gates fail when vector/graph coverage is empty or expected cases are missing.
- **Latency growth from reranking**: require bounded expensive stages and trace candidate limits.
- **Provenance corruption from contextual chunking**: keep contextual index text separate from canonical source content.
- **Security leakage in traces/reports**: redact secrets and expose absolute paths only on explicit operator-facing preflight/report surfaces.
- **Device/provider ambiguity**: record requested and actual runtime values separately and fail closed on explicit mismatches.

## Source Index

- Anthropic Contextual Retrieval: https://www.anthropic.com/engineering/contextual-retrieval
- Qdrant Hybrid Queries: https://qdrant.tech/documentation/search/hybrid-queries/
- LanceDB Hybrid Search: https://docs.lancedb.com/search/hybrid-search
- Vespa Phased Ranking: https://docs.vespa.ai/en/ranking/phased-ranking.html
- LangSmith RAG Eval Tutorial: https://docs.langchain.com/langsmith/evaluate-rag-tutorial
- Ragas Metrics: https://docs.ragas.io/en/stable/concepts/metrics/
- Microsoft Research DRIFT Search: https://www.microsoft.com/en-us/research/blog/introducing-drift-search-combining-global-and-local-search-methods-to-improve-quality-and-efficiency/
- Zoekt: https://github.com/sourcegraph/zoekt
- Qwen3-Embedding-0.6B: https://huggingface.co/Qwen/Qwen3-Embedding-0.6B
- BGE-M3: https://huggingface.co/BAAI/bge-m3
- ONNX Runtime CUDA Execution Provider: https://onnxruntime.ai/docs/execution-providers/CUDA-ExecutionProvider.html
