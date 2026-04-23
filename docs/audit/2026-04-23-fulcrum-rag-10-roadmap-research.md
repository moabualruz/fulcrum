# Fulcrum RAG 10/10 Roadmap Research

Date: 2026-04-23
Scope: memory RAG, file RAG, code RAG, embeddings, reranking, graph retrieval, indexing lifecycle, evals, observability, and possible language/runtime moves.

This report combines external industry research with code analysis of the current Fulcrum repo and live `fulcrum memory doctor --json` output from this workspace.

## Roadmap Delivery Notes

This audit now serves as the delivery umbrella for the RAG roadmap spec set:

- [spec.md](../../specs/002-rag-roadmap-delivery/spec.md)
- [plan.md](../../specs/002-rag-roadmap-delivery/plan.md)
- [tasks.md](../../specs/002-rag-roadmap-delivery/tasks.md)
- [contracts/rag-roadmap-contracts.md](../../specs/002-rag-roadmap-delivery/contracts/rag-roadmap-contracts.md)
- [quickstart.md](../../specs/002-rag-roadmap-delivery/quickstart.md)

Implemented coverage to date spans Phase 1 through Phase 8, covering T001-T120. Phase 9 focuses on docs and polish tasks T121-T124, with T125-T127 reserved for verification and artifact review.

Evidence carried forward for the final polish gate:

- Absolute paths stay operator-only; agent-facing traces, reports, evals, and artifacts use fingerprints or stable source refs.
- Redaction applies to secrets, raw env values, and private paths in traces, reports, and eval artifacts.
- Optional runtime and store experiments are disabled by default and cannot be adopted without quality, latency, rollback, local-first, agent/tool parity, and operational risk gates.
- Model-heavy and accelerator-heavy evals stay opt-in.

## Executive Summary

Fulcrum has the right architecture shape but not yet the operational guarantees of a 10/10 RAG system.

Current state:

- Design intent: 8/10
- Live memory/file/code RAG capability: 5/10
- Overall current capability: 6.5/10
- Reachable target with focused fixes and eval gates: 9/10
- Reachable target with sidecar refactors for indexing/model serving: 10/10

The biggest issue is not the idea. The idea is solid: L0 raw, L1 curated, L2 vectors, FTS, graph, reranker, explainability. The issue is that derived indexes are currently inconsistent. Live doctor output shows L0 healthy but L1 degraded, vectors empty, and graph empty:

- L0: 1055 files, 1055 rows, healthy.
- L1: 7 curated files, 0 rows, degraded.
- FTS: 31844 memory rows and 28504 code chunk rows, healthy.
- Code: 1873 files, 28504 chunks, degraded due legacy chunks.
- Vectors: 0 current vectors, 60348 rows missing metadata, degraded.
- Graph: 0 entities, 0 edges, degraded.

The industry-standard target is clear: hybrid lexical+dense retrieval, contextual chunking, multi-stage reranking, graph-aware expansion, code-specific indexing, robust evaluation, and complete provenance.

## External Standards

### 1. Hybrid retrieval is table stakes

Modern RAG does not rely on vector search alone. It combines lexical exact matching, dense semantic retrieval, metadata filters, and rank fusion. Anthropic's contextual retrieval writeup recommends BM25 plus embeddings plus fusion, then reranking. Their experiments report that contextual embeddings plus contextual BM25 reduced top-20 retrieval failure by 49%, and adding reranking reduced failure by 67%: [Anthropic contextual retrieval](https://www.anthropic.com/engineering/contextual-retrieval).

Qdrant's hybrid query docs model the same pattern: multiple prefetches, dense/sparse vectors, reciprocal rank fusion, and multi-stage reranking: [Qdrant hybrid queries](https://qdrant.tech/documentation/search/hybrid-queries/).

LanceDB also treats hybrid as semantic search plus full-text search merged by a reranker, defaulting to reciprocal rank fusion: [LanceDB hybrid search](https://docs.lancedb.com/search/hybrid-search).

Fulcrum already has this for memory in `runV3Search`: FTS stage, vector stage, graph stage, RRF fusion, and reranker are present in [packages/memory/src/retrieval/v3-search.ts](packages/memory/src/retrieval/v3-search.ts:183). The gap: code search is still FTS/symbol/recency only in [packages/memory/src/retrieval/search-code.ts](packages/memory/src/retrieval/search-code.ts:64).

### 2. Multi-stage retrieval beats one heavy pass

Best systems use cheap broad retrieval first, then expensive reranking over a bounded candidate set. Vespa documents first-phase ranking, second-phase ranking, global-phase ranking, and ONNX/cross-encoder reranking with bounded rerank counts: [Vespa phased ranking](https://docs.vespa.ai/en/ranking/phased-ranking.html).

Qdrant documents the same idea for shorter vectors first, full vectors or ColBERT-style multi-vectors second: [Qdrant multi-stage queries](https://qdrant.tech/documentation/search/hybrid-queries/).

Fulcrum should make this explicit:

1. Candidate recall: FTS, path/symbol search, dense vector, sparse vector, graph neighbors.
2. Fusion: RRF or distribution-based fusion.
3. Diversification: MMR or file/path caps to avoid duplicate chunks.
4. Rerank: cross-encoder or late-interaction reranker on top 50-200.
5. Context pack: provenance-preserving, source-diverse top K.

### 3. Contextual chunking is now a quality lever

Chunk boundaries and missing surrounding context cause retrieval misses. Anthropic's method prepends short chunk-specific context before embedding and BM25 indexing: [Anthropic contextual retrieval](https://www.anthropic.com/engineering/contextual-retrieval).

Fulcrum already has a better base than many systems because L0/L1 provenance exists. Use that to produce contextualized index text without corrupting canonical source:

- Raw body stays unchanged.
- Chunk content stays unchanged.
- Index text becomes `context_prefix + chunk_body`.
- Recall returns the original chunk plus index context explanation.

This matters for code too. Example: a function chunk should be indexed with file path, package name, enclosing class/module, exported symbol, imports, and nearby docstring.

### 4. RAG eval must measure retrieval and grounding separately

LangSmith's RAG eval tutorial separates answer correctness, answer relevance, groundedness against retrieved docs, and retrieval relevance: [LangSmith RAG eval](https://docs.langchain.com/langsmith/evaluate-rag-tutorial).

Ragas tracks context precision, context recall, faithfulness, response relevancy, and factual correctness: [Ragas metrics](https://docs.ragas.io/en/stable/concepts/metrics/).

Fulcrum has a RAG lifecycle eval, but the default observer uses fixtures in [packages/memory/src/eval/rag-lifecycle/runner.ts](packages/memory/src/eval/rag-lifecycle/runner.ts:235). Current eval passes while live doctor says vectors and graph are empty. That means the eval is useful as a contract test, not enough as a real quality gate.

10/10 requires both:

- Fixture evals for deterministic contracts.
- Live corpus evals for actual recall quality after indexing.

### 5. Code RAG needs lexical code search plus code graph plus semantic retrieval

Sourcegraph Cody documents multiple context sources: Sourcegraph Search and Code Graph are first-class context providers, with Code Graph used to understand component relationships: [Sourcegraph Cody context](https://sourcegraph.com/docs/cody/core-concepts/context).

Zoekt is a mature fast trigram-based code search engine: [Zoekt](https://github.com/sourcegraph/zoekt). Tantivy is a Rust Lucene-inspired full-text engine with BM25, incremental indexing, multithreaded indexing, mmap, fast startup, and tokenizers: [Tantivy](https://github.com/quickwit-oss/tantivy).

Fulcrum has syntax-aware chunks for TypeScript and JavaScript through `web-tree-sitter`, but fallback chunking is regex/simple splitting. AST-supported languages are currently only TypeScript and JavaScript in [packages/memory/src/l2/code.ts](packages/memory/src/l2/code.ts:82). For 10/10 code RAG, expand this into a proper multi-language symbol/index engine.

### 6. GraphRAG is for relationship and holistic questions

Microsoft GraphRAG extracts entities, relationships, claims, community hierarchy, and community summaries, then offers global, local, DRIFT, and basic vector search modes: [Microsoft GraphRAG](https://microsoft.github.io/graphrag/).

Fulcrum has the right graph intent, but live graph coverage is currently zero. Graph must stop being optional decoration and become a rebuilt, queryable index:

- Session -> task -> decision -> file -> symbol -> error -> fix.
- File -> import -> file.
- Symbol -> calls -> symbol.
- Memory -> mentions -> entity.
- New decision -> supersedes/contradicts -> old decision.

### 7. Model/device truth must be explicit

ONNX Runtime CUDA provider configuration is explicit: sessions can be constructed with CUDA provider options and GPU device binding: [ONNX Runtime CUDA EP](https://onnxruntime.ai/docs/execution-providers/CUDA-ExecutionProvider.html).

Qwen3 Embedding model card shows the current default choice is reasonable: Qwen3-Embedding-0.6B is Apache-2.0, 0.6B params, 32k context, up to 1024 dimensions, MRL support, instruction-aware, and supports code retrieval: [Qwen3-Embedding-0.6B](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B).

BGE-M3 remains attractive because it supports dense, sparse, and multi-vector retrieval from one model, and its model card recommends hybrid retrieval plus reranking: [BGE-M3](https://huggingface.co/BAAI/bge-m3).

Fulcrum already tries CUDA, then WebGPU, then CPU for local embedding in [packages/core/src/embedding/local.ts](packages/core/src/embedding/local.ts:13), and reranker follows the same path in [packages/core/src/embedding/reranker.ts](packages/core/src/embedding/reranker.ts:43). The missing parts are operational:

- Exact provider/model must be recorded as actually used, not copied from requested fields.
- Explicit CUDA must fail closed.
- Auto mode may fall back, but recall and job reports must expose fallback reason.
- Ollama is an explicit provider choice only. It must never be hidden fallback.

## Fulcrum Current Strengths

### Architecture

Memory v3's L0/L1/L2 split is correct. The architecture doc defines L0 raw immutable dumps, L1 curated pages, and L2 vector indexes over L1/code: [docs/architecture/memory-v3.md](docs/architecture/memory-v3.md:1).

### Memory retrieval

`runV3Search` has the correct retrieval shape:

- FTS stage in [packages/memory/src/retrieval/v3-search.ts](packages/memory/src/retrieval/v3-search.ts:183)
- Vector stage in [packages/memory/src/retrieval/v3-search.ts](packages/memory/src/retrieval/v3-search.ts:213)
- Graph stage in [packages/memory/src/retrieval/v3-search.ts](packages/memory/src/retrieval/v3-search.ts:245)
- RRF fusion in [packages/memory/src/retrieval/v3-search.ts](packages/memory/src/retrieval/v3-search.ts:307)
- Reranker in [packages/memory/src/retrieval/v3-search.ts](packages/memory/src/retrieval/v3-search.ts:407)

### Code indexing

Code chunks track `file_path`, `file_id`, `start_line`, `end_line`, `symbol_path`, `language`, `content`, and `content_hash` in [packages/memory/src/l2/code.ts](packages/memory/src/l2/code.ts:21). This means code RAG can cite exact file and line ranges.

### Model defaults

Defaults are modern:

- Text embedding: `onnx-community/Qwen3-Embedding-0.6B-ONNX`
- Reranker: `onnx-community/bge-reranker-v2-m3-ONNX`

Configured in [packages/core/src/config.ts](packages/core/src/config.ts:159).

### Durable job schema exists

`embedding_jobs`, `embedding_job_items`, `rag_job_events`, and `vector_metadata` already exist in schema: [packages/core/src/db/schema.ts](packages/core/src/db/schema.ts:1177).

This is good. The next step is making every embedding path use this job system and making jobs actually run through CLI/operator flows.

## Current Gaps Blocking 10/10

### G0. Recall surfaces are split between memory and code

`recall_knowledge` calls `runV3Search` and returns L1 memory hits only: [packages/cli/src/commands/memory-recall.ts](packages/cli/src/commands/memory-recall.ts:54). Code retrieval is a separate `searchCode` path: [packages/memory/src/retrieval/search-code.ts](packages/memory/src/retrieval/search-code.ts:64).

Impact:

- A single "what do we know about X?" query cannot retrieve the best combined memory, file, and code evidence.
- Agents must know when to call `recall_knowledge` vs `search_code`, which leaks retrieval internals into agent behavior.
- Memory answers can miss source-code facts even when code chunks contain the answer.

Required fix:

- Add a unified retrieval planner that can query memory, files, and code in one request.
- Keep `recall_knowledge` and `search_code` as focused compatibility tools, but add a higher-level `search_context` or `recall_context` surface.
- Return typed hits: `memory`, `code_chunk`, `file_chunk`, `graph_entity`, `task`, with provenance and line ranges where applicable.

### G1. Live vector coverage is zero

Doctor reports `vectors.current = 0` and `missing_metadata = 60348`. A RAG design with no current vectors is not vector RAG in practice.

Required fix:

- One command should create and run embedding jobs, not only create them.
- All vector writes must write vector metadata.
- Doctor must fail if vector table rows and metadata disagree.

### G2. `fulcrum memory embed --scope` creates jobs but does not run them

The CLI dispatch creates a job in [packages/cli/src/index.ts](packages/cli/src/index.ts:400), and `startEmbeddingJobCommand` returns job status in [packages/cli/src/commands/memory-embedding-jobs.ts](packages/cli/src/commands/memory-embedding-jobs.ts:119). It does not run the job in that path.

Required fix:

- `fulcrum memory embed --scope code --json` should either run synchronously to completion by default or print "created only" only when `--no-run` is passed.
- Add `fulcrum jobs run <job_id>`, `fulcrum jobs status <job_id>`, `fulcrum jobs logs <job_id>`, `fulcrum jobs retry <job_id> --failed`.

### G3. Job provider/model truth is not strong enough

`runEmbeddingJob` uses `providerForDomain(job.source_domain)` unless an embedder is injected in [packages/memory/src/l2/embedding-jobs.ts](packages/memory/src/l2/embedding-jobs.ts:637). Item completion sets `actual_provider = requested_provider` and `actual_model = requested_model` in [packages/memory/src/l2/embedding-jobs.ts](packages/memory/src/l2/embedding-jobs.ts:465).

Required fix:

- Instantiate provider from job requested provider/model/device/dimensions.
- Record actual provider/model/device from runtime object.
- If requested provider/model differs from actual, mark fallback or fail according to policy.

### G4. Code search ignores `vec_chunks`

`searchCode` ranks by FTS and symbol, then falls back to recency. It does not query `vec_chunks`: [packages/memory/src/retrieval/search-code.ts](packages/memory/src/retrieval/search-code.ts:64).

Required fix:

- Add `vec_chunks` dense retrieval.
- Add optional code embedder provider, separate from text embedder.
- Fuse FTS, symbol/path, dense code vector, import graph, recency.
- Rerank code chunks with code-aware reranker or general cross-encoder.

### G5. Code embeddings use text embedder

`storeChunkEmbedding` calls `getTextEmbedder()` in [packages/memory/src/l2/code.ts](packages/memory/src/l2/code.ts:549). This is acceptable as baseline but not 10/10.

Required fix:

- Add `getCodeEmbedder()` with configurable model.
- Default can stay Qwen3-Embedding-0.6B for simplicity.
- Optional best quality profile can use a code-specialized model when available.

### G6. AST chunking is too narrow

Only TypeScript and JavaScript are AST-supported: [packages/memory/src/l2/code.ts](packages/memory/src/l2/code.ts:89). Everything else falls back to regex or prose splitting.

Required fix:

- Add tree-sitter grammars for Python, Rust, Go, Java, C/C++, Markdown, JSON/YAML/TOML.
- Extract symbols, definitions, references, imports, exports, classes, functions, methods, types.
- Generate stable symbol IDs and file-level symbol maps.

### G7. Graph exists but live graph is empty

Doctor reports `entities = 0`, `edges = 0`, coverage gaps for memory and code.

Required fix:

- Graph rebuild must be part of normal rebuild.
- Code graph edges should be built from AST/import/call relations.
- Memory graph edges should be built from L1 entities and L0 provenance.
- Recall must expose graph contribution in explain mode.

### G8. Eval passes while live RAG is degraded

`fulcrum memory eval --suite rag-lifecycle --json` passes all fixture cases, but doctor says vectors and graph are empty.

Required fix:

- Keep fixture evals.
- Add live corpus evals with known queries and expected source IDs.
- Gate reset/rebuild completion on live eval pass.

### G9. L2 reindex can over-report success

`memory-reindex-l2` increments `embedded++` after awaiting `storeEmbeddingInVec` or `storeChunkEmbedding`: [packages/cli/src/commands/memory-reindex-l2.ts](packages/cli/src/commands/memory-reindex-l2.ts:45). Both storage functions catch errors internally and return `void`: [packages/memory/src/l2/embed.ts](packages/memory/src/l2/embed.ts:67) and [packages/memory/src/l2/code.ts](packages/memory/src/l2/code.ts:549).

Impact:

- Missing sqlite-vec, dimension mismatch, GPU/runtime failure, disk failure, or write failure can be logged but still counted as embedded.
- Operator reports can say success while vector rows are absent or stale.
- This directly explains how rebuild/reindex status can look "oddly fast" or successful while doctor still reports missing vector metadata.

Required fix:

- Change vector write functions to return a structured result: `{ ok, source_id, vector_written, metadata_written, error? }`.
- For compatibility wrappers, throw on write failure unless caller explicitly asks for best-effort mode.
- Reindex summaries must verify vector row existence and `vector_metadata.status = 'current'` after each write or batch.
- Count `embedded` only after verification, not after function return.
- Persist failures into `vector_metadata` and `rag_job_events`, not only stderr.

### G10. Live dev profile repair is a prerequisite

Current doctor output is degraded even though fixture eval passes:

- L1 has 7 files and 0 rows, with 7 orphan files.
- Code has 1873 files and 28504 chunks, but 5 legacy chunks.
- Vectors have 0 current rows and 60348 missing metadata rows.
- Graph has 0 entities and 0 edges.

Impact:

- Current RAG is mostly FTS/code-index, not full vector + graph RAG.
- Any quality rating above "architecture potential" is misleading until doctor is healthy.
- Agents will keep seeing `no_match` or lexical-only behavior even if the design says hybrid.

Required fix:

- Add a deterministic repair sequence: L1 orphan repair, legacy code chunk normalization, vector metadata rebuild, vector re-embed, graph rebuild, live eval.
- Make `fulcrum memory doctor --repair-plan --json` emit exact executable commands and expected counts.
- Make `fulcrum memory rebuild --all --execute --verify --json` fail if doctor would remain degraded after rebuild.
- Add an operator acceptance gate: doctor healthy + live RAG eval passed + recall smoke test returned expected memory/code/graph hits.

## Definition Of 10/10

A 10/10 Fulcrum RAG system must satisfy these invariants:

1. Raw source invariant: L0 raw/source files are canonical. Derived state can be deleted and rebuilt without losing knowledge.
2. Coverage invariant: every searchable memory, file chunk, and code chunk knows whether it should be embedded, whether it is embedded, with which model/device/dimensions, and whether it is current.
3. Hybrid invariant: every major recall path uses lexical, dense, metadata, and graph signals when available.
4. Code invariant: code search is line-accurate, symbol-aware, dependency-aware, and semantic.
5. Provenance invariant: every returned claim can trace to raw source, curated page, file path and line range, or a declared legacy/unbacked class.
6. Device invariant: explicit GPU means GPU or failure. Auto means GPU first, then configured fallback, always reported.
7. Eval invariant: no reindex/rebuild is "done" until recall quality, provenance, and coverage evals pass.
8. Explain invariant: every result can show stage ranks, stage scores, provider/model/device, latency, source provenance, freshness, and graph contribution.
9. Operator invariant: destructive/expensive commands have plan, dry-run, execute, report, job status, logs, cancel, resume, retry.
10. Agent invariant: all operator actions are available through CLI and MCP/action tools with machine-readable JSON.

## High-ROI Wins

### P0 - Fix current system before refactor

These get the biggest score increase fastest.

1. Make `fulcrum memory embed --scope` run jobs by default.
2. Add `--create-only` or `--no-run` for job creation without execution.
3. Make embedding jobs instantiate provider/model/device from job config.
4. Record actual provider/model/device truth from runtime.
5. Make L2 vector write functions return structured success/failure and verify rows before incrementing success counters.
6. Add `getCodeEmbedder()` and use it from code embedding path.
7. Add `vec_chunks` retrieval to `searchCode`.
8. Add live vector coverage tests: if `vec_chunks` has rows, code query must retrieve from vector stage.
9. Add unified `search_context` or `recall_context` over memory, files, and code.
10. Repair current dev profile to doctor-healthy: L1 rows, no legacy chunks, current vector metadata, non-empty graph.
11. Add graph rebuild to `memory rebuild --all`.
12. Add live corpus eval command: `fulcrum memory eval --suite live-rag --json`.
13. Make doctor recommended actions executable: `fulcrum memory doctor --repair-plan --json`.

Expected uplift: 6.5/10 -> 8/10.

### P1 - Unify retrieval across memories, files, and code

Create one retrieval planner with domain-specific stages:

```text
query
  -> query analysis: intent, entities, symbols, path hints, time hints
  -> candidate stages:
       memory_fts, memory_vec, memory_graph
       code_fts, code_symbol, code_vec, code_graph
       file_fts, file_vec
  -> fusion: RRF/DBSF
  -> diversification: per-file/per-source caps
  -> rerank: cross-encoder or late-interaction model
  -> context pack: citeable snippets with provenance
  -> explain trace
```

Do not force memory and code through the exact same index. Use one planner, many stages.

Expected uplift: 8/10 -> 8.7/10.

### P2 - Contextual index text

For every chunk, store:

- `raw_content`: exact original chunk.
- `index_content`: contextualized text used for BM25/vector.
- `context_prefix`: generated or deterministic context.
- `context_version`: prompt/template hash.
- `source_hash`: raw content hash.

Memory context prefix:

- Workspace/project.
- Source type.
- Session/task/run.
- Curated entity/page title.
- Source date.

Code context prefix:

- Repo/project.
- File path.
- Language.
- Package/module.
- Enclosing symbol.
- Imports/exports.
- Nearby docstring/comment.

Expected uplift: 8.7/10 -> 9.1/10.

### P3 - Code RAG as first-class subsystem

Target code index tables:

- `code_files`
- `code_symbols`
- `code_references`
- `code_imports`
- `code_chunks`
- `code_edges`
- `vec_code_chunks`
- `code_index_runs`

Retrieval stages:

- Exact path search.
- Symbol exact/prefix/fuzzy.
- BM25/trigram code search.
- Dense NL-to-code vector.
- Code-to-code vector.
- Import/call graph expansion.
- Recency and open-file boost.
- Reranker.

Use line ranges everywhere. Current code already has line fields; preserve that.

Expected uplift: 9.1/10 -> 9.4/10.

### P4 - Real GraphRAG

Add query modes:

- `basic`: top K lexical/vector chunks.
- `local`: entity-centered neighborhood plus relevant raw chunks.
- `global`: community summary search.
- `drift`: local search seeded by community context.

Graph build:

- Extract entities/relations/claims from L1 pages.
- Extract file/symbol/import/call edges from code.
- Link memories to files/symbols/tasks/sessions.
- Generate community summaries with source IDs.
- Store graph in Kuzu or a graph sidecar.

Expected uplift: 9.4/10 -> 9.7/10.

### P5 - Evals and observability

Metrics to track:

- Retrieval recall@K.
- MRR and nDCG.
- Context precision.
- Context recall.
- Faithfulness/groundedness.
- Answer correctness.
- Citation accuracy.
- Latency p50/p95.
- GPU/device used.
- Vector freshness.
- Graph coverage.
- Index rebuild reproducibility.

Artifacts:

- `rag_eval_runs`
- `rag_eval_cases`
- `rag_eval_results`
- `rag_query_traces`
- `rag_stage_traces`

Every recall with `explain` should show:

- Query analysis.
- Candidate counts per stage.
- Stage rank/score per result.
- Fusion score.
- Reranker score.
- Provider/model/device/latency.
- Provenance class.
- Source IDs/paths/line ranges.
- Freshness and content hash.

Expected uplift: 9.7/10 -> 10/10 operational confidence.

## Language And Runtime Moves

### Keep TypeScript for control plane

Do not rewrite Fulcrum core in Rust or Go. TypeScript is fine for:

- CLI.
- MCP/action tools.
- Policy.
- Task/run state.
- Installers.
- Workflow orchestration.
- Config and operator UX.

Rewriting the control plane would burn time without directly improving recall quality.

### Move hot indexing/search path to Rust if chasing 10/10

Recommended new component:

```text
fulcrum-rag-engine
  language: Rust
  interface: JSON-RPC over stdio first; optional Node native later
  owns:
    - multi-language tree-sitter parsing
    - symbol/reference/import extraction
    - Tantivy or trigram/BM25 index
    - snippet assembly
    - incremental index commits
    - candidate retrieval for code/files
```

Why Rust:

- Mature `tree-sitter` ecosystem.
- Tantivy is Rust-native and high-performance.
- Safe parallel indexing with Rayon.
- Easy single binary distribution.
- Better suited than TypeScript for CPU-heavy parsing/indexing.

Use Rust especially if code corpus grows, if many repos are indexed, or if current FTS5/tokenizer limits become quality blockers.

### Add Python ML sidecar for model serving and evals

Recommended new component:

```text
fulcrum-ml
  language: Python
  interface: local HTTP or JSON-RPC over stdio
  owns:
    - embedding batches
    - reranking
    - sparse/multi-vector encoders
    - RAGAS/live evals
    - optional GraphRAG extraction/community detection
```

Why Python:

- Best ecosystem for sentence-transformers, FlagEmbedding, RAGAS, PyTorch, ONNX Runtime GPU, TEI/vLLM integration.
- Easier BGE-M3 dense+sparse+ColBERT use.
- Easier adaptive GPU batching and fallback instrumentation.
- Mature eval libraries.

Do not make Python own Fulcrum state. Make it a compute service. Fulcrum remains source of truth.

### Go is not the best move here

Go would be good for a daemon supervisor, but less useful for mature RAG dependencies. For maximum RAG quality:

- Rust beats Go for local text/code indexing.
- Python beats Go for ML/model/eval stack.
- TypeScript remains good for orchestration.

### Vector store options

| Option | Fit | Rating | Recommendation |
|---|---|---:|---|
| SQLite + sqlite-vec | Single-file, local, simple | 7/10 | Keep short-term; good minimal baseline. |
| LanceDB | Embedded local vector+FTS+rerank workflow | 8.5/10 | Best low-ops upgrade if you avoid a server. |
| Qdrant local | Hybrid dense/sparse/multi-vector, payload filters, strong APIs | 9.5/10 | Best quality/performance option for one-user local service. |
| Vespa | Full search/ranking platform, phased ranking, ONNX, scale | 10/10 but heavy | Only if you want search-engine-grade system and accept ops weight. |

Recommended path:

1. Short term: fix sqlite-vec coverage and metadata.
2. Medium term: add adapter boundary for vector store.
3. Best target for you: Qdrant local for vectors/hybrid and Rust/Tantivy for code/file lexical search.
4. Keep LanceDB as fallback if you reject running a local service.

## Target Architecture

```text
Fulcrum TypeScript control plane
  - SQLite state
  - vault L0/L1
  - task/run/policy/workflow
  - CLI/MCP/action tools
  - job ledger
  - query planner

Rust rag-engine
  - code/file parsing
  - tree-sitter symbols
  - Tantivy BM25/trigram
  - snippet line ranges
  - code/file candidate retrieval

Python fulcrum-ml
  - embeddings
  - rerankers
  - sparse/multi-vector encoders
  - adaptive GPU batching
  - live evals
  - optional GraphRAG extraction

Vector store
  - now: sqlite-vec
  - target: Qdrant local or LanceDB embedded

Graph store
  - now: Kuzu
  - target: keep Kuzu, but rebuild and query it through planner
```

## Recommended Implementation Sequence

### Week 1: Make current system true

- Fix `memory embed --scope` to run jobs.
- Make actual provider/model/device truthful.
- Make vector write failures propagate into reindex/job status.
- Repair current L1 orphan files and legacy code chunks as part of rebuild verification.
- Embed code chunks and L1 pages through one durable job path.
- Make doctor report vector table counts and metadata counts separately.
- Add live eval that fails when vectors are empty.

### Week 2: Make code retrieval hybrid

- Add vector stage to `searchCode`.
- Add code rerank path.
- Add `getCodeEmbedder`.
- Add stage scores/explain output for code search.
- Add code recall eval with expected file/line hits.

### Week 3: Rebuild graph and provenance

- Make graph rebuild part of `memory rebuild --all`.
- Add graph coverage eval.
- Add provenance class to every memory/code/file result.
- Add broken source/wikilink failure gates.

### Month 1: Rust code/file indexer

- Build `fulcrum-rag-engine` binary.
- Move multi-language tree-sitter parsing there.
- Add Tantivy index for files/code.
- Keep TS wrapper APIs stable.
- Compare SQLite FTS5 vs Tantivy in eval before switching default.

### Month 2: Python ML sidecar

- Add model registry and provider adapters.
- Add BGE-M3 dense+sparse/multi-vector experiment.
- Add adaptive GPU batching.
- Add RAGAS/LLM-judge live eval suite.
- Add optional Qdrant or LanceDB vector backend.

## What Not To Do

- Do not use only vector search.
- Do not use Ollama as hidden fallback. It is explicit provider choice only.
- Do not embed raw L0 dumps directly as primary recall corpus. L0 is evidence; L1/code/file chunks are retrievable units.
- Do not hide truncation. If content is too large, split with provenance.
- Do not rewrite the whole control plane in Rust/Go.
- Do not declare success from fixture evals while live vector/graph coverage is empty.
- Do not add more reset commands. Make one authoritative rebuild/reset/job lifecycle.

## Final Recommendation

Best route to 10/10:

1. Stabilize current TypeScript implementation first. Fix job execution, vector coverage, metadata truth, code vector retrieval, graph rebuild, and live evals.
2. Add a retrieval planner that treats memory, files, and code as different sources under one explainable ranking contract.
3. Move high-throughput indexing/search to Rust only after quality gates exist, so the rewrite can prove improvement.
4. Add Python ML sidecar for embeddings/reranking/evals if local GPU performance and model ecosystem maturity matter more than single-language purity.
5. Use Qdrant local or LanceDB behind an adapter when sqlite-vec becomes the bottleneck. Prefer Qdrant for highest ceiling; prefer LanceDB for simplest embedded upgrade.

If only one big refactor is allowed, choose Python ML sidecar first. It unlocks mature embeddings, rerankers, sparse/multi-vector models, adaptive GPU batching, and RAG evals. If two big refactors are allowed, add Rust rag-engine second for code/file indexing and Tantivy search.

## Source Index

- [Anthropic contextual retrieval](https://www.anthropic.com/engineering/contextual-retrieval)
- [Qdrant hybrid queries](https://qdrant.tech/documentation/search/hybrid-queries/)
- [LanceDB hybrid search](https://docs.lancedb.com/search/hybrid-search)
- [Vespa phased ranking](https://docs.vespa.ai/en/ranking/phased-ranking.html)
- [LangSmith RAG eval](https://docs.langchain.com/langsmith/evaluate-rag-tutorial)
- [Ragas metrics](https://docs.ragas.io/en/stable/concepts/metrics/)
- [Microsoft GraphRAG](https://microsoft.github.io/graphrag/)
- [Sourcegraph Cody context](https://sourcegraph.com/docs/cody/core-concepts/context)
- [Zoekt](https://github.com/sourcegraph/zoekt)
- [Tantivy](https://github.com/quickwit-oss/tantivy)
- [ONNX Runtime CUDA EP](https://onnxruntime.ai/docs/execution-providers/CUDA-ExecutionProvider.html)
- [Qwen3-Embedding-0.6B](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B)
- [BGE-M3](https://huggingface.co/BAAI/bge-m3)
