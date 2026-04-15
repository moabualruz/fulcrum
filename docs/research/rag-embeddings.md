# RAG/Embeddings SOTA Research

_Audited against Fulcrum codebase as of 2025-04. All file references are relative to the repo root._

---

## SOTA Summary (2025)

### 1. Code-Aware Chunking

**CAST (2025, CMU/ACL Findings)** is the current reference implementation for AST-aware RAG chunking. It parses source into a tree-sitter AST, then greedily merges nodes bottom-up until a token budget is reached, recursing into nodes that overflow. Key result: +5.5 NDCG on RepoEval with StarCoder2-7B, +4.3 on CrossCodeEval vs. sliding-window baselines. The insight is that syntactically complete nodes (functions, classes, blocks) are more self-contained retrievable units than character windows, which frequently bisect identifier names or string literals.

Tools like Cursor scan the full project using this approach. GitHub Copilot's workspace index uses import graph adjacency (Jaccard similarity) as a retrieval signal on top of 60-line sliding windows, upgraded September 2025 to a custom embedding model producing an index 8x smaller with 37.6% better retrieval.

### 2. Code Embeddings

| Model | Type | Dims | Notes |
|---|---|---|---|
| **voyage-code-3** (Dec 2024) | Matryoshka, remote | 256–2048 | +13.8% over OpenAI v3-large, +16.8% over CodeSage on CodeSearchNet. Supports int8/binary quantization. |
| **Gemini Embedding 2** | Remote | — | MTEB Code: 84.0, top leaderboard as of Q1 2026. |
| **BAAI/bge-m3** | Local, bi-encoder | 1024 | Strong multilingual; commonly used as local fallback. |
| **text-embedding-3-large** | Remote | 3072 | General purpose; 5-8 NDCG points below voyage-code-3 on code retrieval. |

voyage-code-3 uses asymmetric encoding (`input_type: query` vs `document`) and Matryoshka training so dimensions can be truncated without significant accuracy loss.

### 3. Hybrid Search

The production pattern in 2025: **sparse (BM25 or SPLADE) + dense vector + RRF at k=60**, followed by a cross-encoder reranker on the top-N candidates.

- **RRF at k=60** is the robust default. It is rank-based (immune to score-scale differences) and requires no calibration data.
- **SPLADE** consistently outperforms BM25 on BEIR; it learns term importance expansions and stores a sparse vector per document. Main cost: ~100-300ms inference per query unless pre-computed.
- **ColBERT late interaction**: query and document are encoded separately into token matrices; final score is a MaxSim operation. Best accuracy among efficient retrievers; requires purpose-built infrastructure (e.g., RAGatouille).
- The current consensus: **BM25 + dense + RRF is the pragmatic destination for most teams**; SPLADE and ColBERT give additional lift at significant operational cost.

### 4. Reranking

Cross-encoders see the query and passage jointly, achieving deeper semantic understanding than bi-encoders at the cost of O(N) inference per candidate.

Top rerankers (ZeroEntropy leaderboard, Q1 2026):
1. **Zerank-2** — 1638 ELO (top open-source)
2. **Cohere Rerank 4 Pro** — 1629 ELO
3. **BAAI/bge-reranker-v2-m3** — strong multilingual, Apache 2.0, viable GPU self-host

Typical pipeline: retrieve top-50 → rerank to top-10 → LLM. Studies show +33-40% accuracy for ~120ms added latency.

### 5. Memory and Context Management

**MemGPT / Letta** (2023–2025): treats the LLM context window as RAM and external storage (vector DB, archival memory) as disk. The agent calls memory read/write tools to page data in and out. Key properties: unbounded effective memory, explicit memory editing by the agent, no implicit context truncation.

**GraphRAG (Microsoft, 2024)**: build a knowledge graph (entities + relationships) from the corpus via LLM extraction, then hierarchically summarize communities. At query time, retrieve from both the local graph neighborhood and the global community summaries. Result: 72-83% comprehensiveness vs. naive RAG, 3.4x accuracy on enterprise multi-hop queries. Cost was the early bottleneck ($33K indexing for large corpora) but reduced significantly in subsequent work (LazyGraphRAG, 2024).

### 6. Code vs. Text Pipeline Separation

SOTA code search systems treat code and prose through distinct pipelines:
- **Code**: AST chunking → code-specific embedder (voyage-code-3) → symbol metadata (function name, file path, language, imports) stored as filter fields → call-graph/import-graph as supplementary traversal signal.
- **Text**: paragraph-boundary chunking with overlap → general embedder → entity extraction → temporal context (event_time).

---

## Gap Analysis

### GAP-RAG-1: Regex-Based Code Chunking in `ingest.ts`

- **SOTA**: AST-based chunkers (tree-sitter via CAST/cAST) split at true syntactic boundaries — functions, classes, methods — regardless of file layout. They handle nested closures, decorated classes, arrow-function assignments, and generator functions correctly. +5.5 NDCG over sliding-window on RepoEval.
- **Fulcrum**: `packages/memory/src/ingest.ts:25-75` uses a regex `SYNTAX_BOUNDARIES = /(?=^(?:export\s+)?(?:async\s+)?(?:function|class)\s+\w)/gm`. This misses: arrow functions assigned to `const`, class methods, decorators, TypeScript interfaces/type aliases, and any non-`export`/non-top-level declaration. The `ASTChunker` in `packages/memory/src/chunkers/ast-chunker.ts` is correctly implemented but **is not wired into `ingest.ts`** — `ingest.ts` calls `chunkSyntax()` (the regex path) directly and never calls `createASTChunker()`.
- **Severity**: Major
- **Impact**: Code chunks are frequently bisected mid-function or miss entire declaration types. Retrieval quality for symbol-level queries degrades because chunk boundaries don't align with logical units. The existing `ASTChunker` code is already written but unused — this is a wiring gap, not a design gap.
- **Fix direction**: Replace the `chunkSyntax()` call in `ingest.ts` with `createASTChunker()` (already implemented); fall back to the regex chunker if WASM loading fails. Extend `SUPPORTED_LANGUAGES` to cover Python, Go, Rust by loading the corresponding tree-sitter grammars.

---

### GAP-RAG-2: No Asymmetric Embedding in the Recall Path

- **SOTA**: Asymmetric retrieval (separate query and document embeddings) is now standard. voyage-code-3 uses `input_type: query` vs `input_type: document`. The local `LocalEmbeddingProvider` correctly applies `QUERY_PREFIX` / `DOC_PREFIX` via `embedQuery()` and `embedDocument()`.
- **Fulcrum**: `packages/memory/src/recall.ts:212-215` calls `embedder.embed(input.query)` for the vector search path, not `embedder.embedQuery()`. The L2 path at line 155 also calls `embedder.embed(input.query)`. Both use the document embedding for query-time lookup, which applies `DOC_PREFIX` instead of `QUERY_PREFIX` for local models and sends no `input_type` distinction to Voyage.
- **Severity**: Major
- **Impact**: For local E5/GTE models this causes a systematic scoring penalty; queries and documents use the same instruction prefix, which the Matryoshka/E5-Instruct training assumes are different. For Voyage, the model's asymmetric training (query vs. document fine-tuning) is bypassed.
- **Fix direction**: Replace `embedder.embed(input.query)` with `embedder.embedQuery(input.query)` in both the L1 vector path (recall.ts:212) and the L2 path (recall.ts:155). Document ingestion already correctly uses `embed()` (which maps to `embedDocument()`), so no write-side change is needed.

---

### GAP-RAG-3: FTS5 `memories_fts` Lacks a Code-Appropriate Tokenizer

- **SOTA**: Code identifiers use `camelCase`, `snake_case`, `PascalCase`, and namespaced forms like `@scope/package`. The default FTS5 `unicode61` tokenizer treats these as single tokens. Code-aware tokenization should split on case boundaries and punctuation so that a query for `recallMemory` also matches `recall`, `memory`, and the full identifier.
- **Fulcrum**: `packages/core/src/db/migrations/m002.ts:165-166` — `memories_fts` is declared with no `tokenize=` clause, inheriting the FTS5 default (`unicode61`). Planning tables in `m003.ts:107` do use `tokenize='porter unicode61'`, but porter stemming alone does not split camelCase. `memories_fts` gets neither.
- **Severity**: Minor (vector search compensates for near misses; critical only when embedder is absent)
- **Impact**: Exact-match FTS5 queries for code symbols (`createASTChunker`, `recallMemory`) fail unless the caller happens to type the exact case. This reduces the BM25 leg of the RRF fusion, lowering recall for code-specific queries in the FTS5-only fallback mode.
- **Fix direction**: Add a migration that drops and recreates `memories_fts` with `tokenize='unicode61 categories "L* N*" separators " \t\n_."'` and a camelCase splitter UDF, or register a custom SQLite tokenizer via `better-sqlite3-multiple-ciphers` that handles camelCase splitting. At minimum, apply `porter unicode61` to match the planning tables.

---

### GAP-RAG-4: No Import/Call-Graph Signal in Code Recall

- **SOTA**: GitHub Copilot's workspace index uses import graph adjacency as a retrieval signal: files that import the file containing the cursor symbol are scored higher. Cursor uses full-project traversal with symbol cross-referencing. The CAST paper uses file-level metadata (language, imports, class membership) as chunk-level filter fields.
- **Fulcrum**: `packages/memory/src/ingest.ts` stores `file_path`, `language`, and `symbol_path` (extracted function name) but extracts no import graph, call graph, or parent class. The Kuzu graph schema (`packages/memory/src/kuzu/schema.ts`) has `USES` and `IS_A` edges between entities but these are populated only from LLM semantic extraction (Track 2) on curated memory kinds like `decision` and `fact` — not from static code analysis of `symbol`/`doc` chunks.
- **Severity**: Major
- **Impact**: Co-located symbols (functions in the same file, classes that inherit from each other, modules that import each other) are not graph-linked. A query about `ASTChunker` will not automatically surface `SlidingWindowChunker` as a fallback sibling, even though they live in the same file and share an interface. This is the largest gap between Fulcrum's graph layer and the graph-augmented code search in SOTA tools.
- **Fix direction**: During code ingest, parse import declarations (using a lightweight regex or tree-sitter) and emit `USES` edges between file-level entities. Optionally, parse class inheritance to emit `IS_A` edges. These are static and cheap to compute at ingest time. Track 2 LLM extraction should remain for semantic edges but should not be the sole source of structural code relationships.

---

### GAP-RAG-5: MMR Diversification Lacks True Embedding Similarity

- **SOTA**: Maximal Marginal Relevance (MMR) selects a result set by iteratively picking the candidate that maximizes `λ × relevance - (1-λ) × max_similarity_to_selected`, where similarity is cosine distance between candidate embeddings. This prevents returning five paraphrases of the same fact.
- **Fulcrum**: `packages/memory/src/kuzu/query.ts:56-77` — the `mmrDiversify()` function comment explicitly notes "Without candidate embeddings in memory, we use score ordering as approximation." The implementation degrades to pure score ordering (top-k), which is functionally identical to no MMR at all.
- **Severity**: Minor
- **Impact**: L2 recall results can be repetitive if several memories share high graph connectivity to the same entities (e.g., all memories about a single technology stack). The λ=0.7 weighting is set up correctly but produces no diversity benefit.
- **Fix direction**: The `queryMemoriesL2` function already retrieves `embedding FLOAT[${dims}]` in the Memory node schema. Pass candidate embeddings alongside scores into `mmrDiversify()` and implement the cosine step. This is an in-function change with no schema work required.

---

### GAP-RAG-6: Reranker Is Wired but Its Score Is Clamped Incorrectly

- **SOTA**: Cross-encoder rerankers output raw logits; proper calibration maps logits to a [0, 1] probability via sigmoid, not a hard clamp. The typical pipeline: `score = sigmoid(logit)`, then sort descending. Hard clamping distorts the ranking if logits span a wide range (e.g., -8 to +12).
- **Fulcrum**: `packages/memory/src/recall.ts:278-280`:
  ```ts
  score: typeof rs === 'number' && Number.isFinite(rs)
    ? Math.max(0, Math.min(1, rs))  // clamp logits to [0,1]
    : s.score,
  ```
  This applies a linear clamp. Logits above 1.0 are all collapsed to 1.0; logits below 0.0 are all collapsed to 0.0. The sort order among high-quality results (all logits > 1.0) is lost.
- **Severity**: Minor (reranker is optional and inactive by default; only affects installs where `config.reranker.provider = 'local'`)
- **Impact**: Results with logit scores of 1.5 and 8.0 both become 1.0 and are ordered by their original RRF score, defeating the reranker's purpose for well-matched results.
- **Fix direction**: Replace the linear clamp with `1 / (1 + Math.exp(-rs))` (sigmoid). This correctly maps any logit to (0, 1) and preserves rank order. Alternatively, normalize by subtracting the min and dividing by the range within the batch.

---

### GAP-RAG-7: No SPLADE or Learned Sparse Vectors

- **SOTA**: SPLADE sparse vectors consistently outperform BM25 on BEIR benchmarks. They expand query/document terms using a masked language model, adding semantically related terms as weighted sparse dimensions. At query time only the query is run through SPLADE; document vectors are precomputed. This gives dense-model-level recall with vector-index latency.
- **Fulcrum**: Hybrid search uses SQLite FTS5 (BM25) as the sparse leg. There is no SPLADE integration and no sparse vector storage column in the memories schema.
- **Severity**: Minor (BM25 + dense + RRF is the pragmatic standard; SPLADE is a lift on top of that)
- **Impact**: FTS5 misses semantically related terms that SPLADE would have expanded. For code search with synonyms (e.g., `embed` vs `vectorize`) the BM25 leg contributes less signal than it could.
- **Fix direction**: Lower priority than GAP-RAG-1 through GAP-RAG-4. If prioritized: add a `sparse_vector` BLOB column to `memories`, run SPLADE at index time (or use a lighter lexical expansion approach), and replace the FTS5 leg of RRF with a sparse dot-product lookup.

---

### GAP-RAG-8: No Virtual Context Paging (MemGPT Pattern)

- **SOTA**: Letta/MemGPT agents treat the context window as RAM and surface read/write tools the agent itself can call to move observations in and out of the active window. This enables unbounded effective memory and explicit agent-driven memory curation.
- **Fulcrum**: The agent receives memories from `recallMemory` as a batch of up to 20 compact results injected into the prompt. There is no mechanism for the agent to request additional pages, narrow the query, or explicitly evict stale memories from context. The `access_count` and `last_accessed_at` fields exist and are updated, but no tool exposes paging.
- **Severity**: Minor (the current single-shot recall is adequate for most tasks; paging matters at scale)
- **Impact**: For long-running agents with large memory stores, the top-20 injection may crowd out relevant but low-rank results that would surface on a second page query. There is no agent-accessible "fetch next page" primitive.
- **Fix direction**: Expose an `offset` parameter on `recall_memory` MCP tool. Optionally, implement a MemGPT-style `archival_memory_search(query, page)` tool alongside the main recall tool so agents can paginate explicitly.

---

## Summary Table

| Gap | File(s) | Severity | Effort |
|---|---|---|---|
| GAP-RAG-1: Regex chunking, ASTChunker not wired | `ingest.ts:27`, `chunkers/ast-chunker.ts` | **Major** | Low (wiring only) |
| GAP-RAG-2: `embed()` used for queries instead of `embedQuery()` | `recall.ts:155,212` | **Major** | Trivial |
| GAP-RAG-3: `memories_fts` no code tokenizer | `migrations/m002.ts:165` | Minor | Low |
| GAP-RAG-4: No import/call-graph edges from static analysis | `ingest.ts`, `kuzu/schema.ts` | **Major** | Medium |
| GAP-RAG-5: MMR uses score ordering, not cosine similarity | `kuzu/query.ts:56-77` | Minor | Low |
| GAP-RAG-6: Reranker logits clamped instead of sigmoid | `recall.ts:278-280` | Minor | Trivial |
| GAP-RAG-7: No SPLADE sparse vectors | schema/recall pipeline | Minor | High |
| GAP-RAG-8: No virtual context paging (MemGPT) | MCP tool layer | Minor | Medium |
