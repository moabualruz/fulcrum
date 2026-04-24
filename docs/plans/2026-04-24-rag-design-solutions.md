# RAG Remaining Issues - Design Solutions

Date: 2026-04-24

This document designs fixes for the remaining Fulcrum RAG issues captured in
`docs/handover/2026-04-24-rag-remaining-issues.md`, plus follow-up issues found
from code review.

## Research Summary

- Hybrid retrieval should keep lexical/BM25 and dense vector lanes separate,
  then fuse ranks. RRF is robust, but weighted score fusion gives more control
  when exact keyword/identifier matches are more trustworthy than dense matches.
  Canonical's 2026 RAG article describes dense search as good for meaning,
  full-text search as good for exact product IDs/acronyms/rare technical terms,
  and RRF as rank-based fusion with the common `k=60` smoothing factor.
- Production RAG commonly retrieves a larger candidate set, then reranks the
  top 50-100 chunks with a model or deterministic domain-specific features.
  For Fulcrum code search, deterministic identifier-aware features are the best
  first step because they are local, testable, and low-latency.
- SQLite FTS5 supports BM25 ranking and external-content FTS tables with
  triggers. Fulcrum already has FTS tables, so the fix should improve query
  shaping and fusion rather than add a new storage engine.
- ONNX Runtime docs show session creation as a distinct setup step and recommend
  graph optimization/session options. Query/hook paths should not repeatedly
  create or warm sessions; long-lived daemon workers should own that cost.
- Tiktoken docs use `encoding_for_model(model)` and `len(enc.encode(text))` for
  model-aware token counts. Fulcrum should add a tokenizer abstraction with a
  deterministic fallback, not hardwire provider packages into core retrieval.
- Groundedness research and recent production reports point to claim-level
  citation verification. A retrieved source is not enough; each factual claim
  must map to a supporting cited span, or the answer/eval case should be marked
  ungrounded.

Sources:

- SQLite FTS5 docs via Context7:
  `https://context7.com/context7/www_sqlite_org-docs.html/llms.txt`
- ONNX Runtime docs via Context7:
  `https://context7.com/microsoft/onnxruntime/llms.txt`
- tiktoken docs via Context7:
  `https://github.com/openai/tiktoken/blob/main/README.md`
- Hybrid search and reranking:
  `https://canonical.com/blog/hybrid-search-and-reranking-a-deeper-look-at-rag`
- Production hybrid search/RRF identifier issue:
  `https://devtechtools.org/en/blog/production-rag-hybrid-search-bm25-vector-rrf`
- Claim-citation validation discussion:
  `https://www.reddit.com/r/AiAutomations/comments/1sidkud/rag_is_retrieving_the_right_docs_but_the_answer/`
- Recent claim-level verification papers: `FACTUM`, `MedRAGChecker`, and
  `Retromorphic Testing with Hierarchical Verification for Hallucination
  Detection in RAG`.

## 1. Code Vector Backlog

Problem: live vector coverage is incomplete. `search_code` and `search_context`
can work lexically, but semantic code recall is partial until `vec_chunks` and
`vector_metadata` reach current status for all current `code_chunks`.

Best solution: daemon-drained durable embedding jobs.

Design:

- Add an indexer daemon worker loop that periodically finds pending/stale
  `embedding_jobs` for watched projects and calls `runEmbeddingJob` with bounded
  slices: default `batch_size=16`, default `max_items=512`.
- Keep manual CLI commands as operator override:
  `./fulcrum jobs resume <job> --batch-size 16 --max-items 512`.
- Add one daemon setting:
  `FULCRUM_INDEXER_EMBEDDING_WORKER=1` default enabled when daemon runs, disabled
  in tests unless explicitly enabled.
- Worker loop rules:
  - One active embedding slice per workspace/project/source_domain.
  - Never spawn parallel ONNX-heavy work inside hook processes.
  - Stop cleanly on daemon shutdown.
  - Honor `cancel_requested_at` between batches.
  - Emit `rag_job_events` for slice start, slice progress, clamp, fallback,
    cancel, completion, and failure.
- Health rules:
  - `memory doctor` should report active job ID, remaining pending/stale count,
    and daemon worker status.
  - Vector coverage degraded while backlog exists, but not failed unless job
    items fail or no embedder is available.

Implementation points:

- `packages/memory/src/l2/embedding-jobs.ts`: keep as durable job executor.
- `packages/memory/src/indexer/handlers.ts`: expose worker status.
- `packages/memory/src/indexer/registry.ts`: start/stop per-project embedding
  worker with watcher lifecycle.
- `packages/cli/src/commands/memory-embedding-jobs.ts`: keep manual resume.

Tests:

- Worker drains pending code job in slices and leaves job `pending` until no
  items remain.
- Worker does not run two slices for same project concurrently.
- Cancel request stops after current batch.
- Missing embedder marks job failed with clear event.

## 2. Exact Code Search Ranking

Problem: current `search_code` uses weighted RRF with `code_vector` weight 1.35
and `fts` weight 1.0. Identifier queries can let semantically related docs rank
above exact implementation chunks. `ftsQuery()` treats camelCase identifiers as
one term and does not add split identifier terms.

Best solution: query intent classifier plus deterministic exact-match boosts
before optional vector fusion.

Design:

- Add `classifyCodeQuery(query)`:
  - `identifier`: single camelCase/PascalCase/snake_case/kebab_case/token with
    code punctuation or mixed case.
  - `path_like`: contains `/`, `.ts`, `.js`, package path, or filename suffix.
  - `natural_language`: multi-word prose.
  - `mixed`: prose plus identifier/path.
- Build code query terms:
  - Preserve original query as phrase.
  - Split camelCase/PascalCase with existing sparse tokenizer logic.
  - Split snake/kebab path segments.
  - Generate exact symbol suffix candidates.
- Add ranking features separate from RRF:
  - `exact_symbol`: `symbol_path === query` or suffix match.
  - `exact_identifier_in_symbol`: identifier appears in symbol basename.
  - `exact_identifier_in_content`: whole-token content match.
  - `path_exact_or_suffix`: normalized path equality/suffix.
  - `fts_bm25`: current FTS rank.
  - `semantic`: current vector rank.
- Fusion:
  - For `identifier` and `path_like`, use lexical floor:
    exact symbol/path hit score must exceed any semantic-only hit.
  - For `natural_language`, keep current hybrid behavior.
  - For `mixed`, keep semantic but require lexical candidates to survive top-k
    when any exact identifier match exists.
- Preserve explain output by listing classifier result and exact features in
  `stage_scores` / `stage_contributions`.

Implementation points:

- `packages/memory/src/retrieval/search-code-support.ts`: classifier, tokenizer,
  FTS query builder, exact feature helpers.
- `packages/memory/src/retrieval/search-code.ts`: feature-aware scoring.
- `packages/memory/src/sparse.ts`: reuse or export camel splitter instead of
  duplicating identifier parsing.

Tests:

- `refreshGraphCoverageForCodeFile` ranks implementation chunk first.
- `refresh graph coverage code file` still finds same implementation.
- `packages/memory/src/graph/coverage.ts refreshGraphCoverageForCodeFile`
  path+symbol query ranks path first.
- Semantic-only docs cannot outrank exact symbol for identifier queries.
- Natural-language query still benefits from vector lane.

## 3. Hook/Indexer Embedding Runtime Cost

Problem: hooks and event handlers can load/warm local ONNX embedding runtime too
often. Existing queue bounds concurrency inside a process, but each hook process
can still pay startup cost.

Best solution: hook performs cheap indexing only; daemon owns warm embedder and
durable embedding jobs.

Design:

- Hook/indexer fast path:
  - Read changed file.
  - Update `code_files`, `code_chunks`, FTS, symbol metadata, and graph evidence.
  - Mark affected chunks `vector_status='pending'` or `stale`.
  - Enqueue/attach chunks to a durable `embedding_job`.
  - Return without embedding.
- Daemon slow path:
  - Warm one code embedder per configured runtime.
  - Drain embedding jobs in bounded slices.
  - Reuse ONNX `InferenceSession` in the long-lived process.
- Add a small runtime metrics record:
  - `embedder_cold_start_ms`
  - `embedding_batch_ms`
  - `embedding_items_per_second`
  - `rss_before_mb`, `rss_after_mb`
- Keep current `enqueueEmbed` for memory writes that already run inside a
  long-lived process, but avoid using it from one-shot hook processes for code.

Implementation points:

- `packages/memory/src/pci/syncer.ts`
- `packages/memory/src/l2/code.ts`
- `packages/memory/src/l2/embedding-jobs.ts`
- `packages/cli/src/hooks.ts`

Tests:

- Hook path updates chunks without calling registered embedder.
- Daemon worker later writes `vec_chunks` and `vector_metadata`.
- Multiple file changes coalesce into one job or one job scope per project.

## 4. Indexer Daemon Status Counters

Problem: status counters can report zero or misleading counts. Code review found
status enrichment in `packages/memory/src/indexer/handlers.ts`; handover path
`packages/memory/src/pci/daemon.ts` is stale. SQL counts by `project_id` only.

Best solution: separate process-local watcher counters from durable SQLite
coverage counts and scope all durable counts by workspace and project.

Design:

- Response shape:
  - `watch`: process-local status: root, project, active, events seen, errors.
  - `coverage`: durable DB status: `code_files_count`, `code_chunks_count`,
    `memories_count`, `current_vectors_count`, `pending_vectors_count`.
- SQL must include `workspace_id = ? AND project_id = ?`.
- If DB is unavailable, return `coverage: null` with `coverage_reason`.
- Preserve old top-level `code_chunks_count` and `memories_count` for one
  compatibility release if callers depend on them, but populate from scoped
  durable counts.

Implementation points:

- `packages/memory/src/indexer/handlers.ts`
- `packages/memory/src/indexer/client.ts`
- CLI daemon status command schema/output.

Tests:

- Existing watched project with preindexed rows reports nonzero durable counts.
- Same `project_id` in different workspaces does not bleed counts.
- Bootstrap daemon with missing tables returns active watch and null coverage.

## 5. Search Context Semantic Lane Sparse Current Candidates

Problem: `search_context` uses `loadBaselineSemanticRanks`, but code semantic
candidates require current `vector_metadata` and `code_chunks.vector_status`.
While backlog exists, semantic can be skipped with no current candidates.

Best solution: make degraded semantic coverage explicit and use lexical/graph
fallback until backlog drains.

Design:

- Add semantic coverage summary to `search_context` response when `explain=true`:
  - current code vectors, pending/stale code vectors, current memory vectors.
  - skip reason: `vector_backlog`, `missing_embedder`, or `vec_table_unavailable`.
- If code vector coverage is below threshold, down-rank semantic lane confidence
  and surface `freshness='stale'` or `degraded=true` in trace.
- After backlog completion, run fixed verification query and store result in
  handover/status doc.
- Do not block search_context on vector backlog; it should continue lexical and
  graph retrieval.

Implementation points:

- `packages/memory/src/retrieval/planner/baseline-lane.ts`
- `packages/memory/src/retrieval/search-context.ts`
- `packages/memory/src/setup/rag-health.ts`

Tests:

- With no current vectors but many pending vectors, skipped reason is
  `vector_backlog`, not generic `no current semantic candidates`.
- With no embedder, skipped reason remains `missing_embedder`.
- After a current vector exists, semantic stage appears in trace.

## 6. Eval Groundedness

Problem: `defaultRetriever` marks an observation grounded if at least one
expected source appears in retrieved/cited sources. That measures source overlap,
not answer groundedness or citation accuracy.

Best solution: claim-level support model with deterministic span checks first,
optional verifier later.

Design:

- Extend eval case schema:
  - `expected_claims`: array of atomic claims.
  - `expected_citations`: source IDs and optional line/span selectors.
  - `forbidden_claims`: attractive but wrong statements.
- Add evaluator pipeline:
  1. Retrieve context.
  2. Build answer or accept supplied answer.
  3. Split answer into atomic claims.
  4. For each claim, find cited source span.
  5. Mark `supported`, `contradicted`, or `unsupported`.
  6. Grounded only if every material claim is supported and no forbidden claim
     appears.
- First implementation can be deterministic:
  - Exact/normalized substring and key-token overlap against cited snippets.
  - Line/span IDs for code sources.
  - Refuse unsupported claims.
- Later optional verifier:
  - Local NLI/STS or LLM judge behind explicit config.
  - Never required for default deterministic tests.

Implementation points:

- `packages/memory/src/eval/roadmap/support.ts`
- `packages/memory/src/eval/fixtures.ts`
- `packages/memory/src/tests/rag-eval-default-retriever.test.ts`

Tests:

- Retrieved expected source but unsupported claim -> `grounded=false`.
- Correct claim citing wrong source -> citation accuracy failure.
- Attractive wrong context appears in retrieval -> forbidden claim catches drift.
- Code eval requires line/source match, not only file path.

## 7. Tokenizer-Aware Context Pack

Problem: `estimateContextTokens()` uses a regex and `ceil(chars/4)`. This is
deterministic, but not model-aware. It can under/over-pack for production agent
contexts.

Best solution: small tokenizer abstraction with deterministic fallback and
optional provider-specific adapters.

Design:

- Add `TokenEstimator` interface:

```ts
export interface TokenEstimator {
  name: string
  model?: string
  count(text: string): number
  truncate(text: string, maxTokens: number): string
}
```

- Default estimator:
  - Keep current regex/char heuristic.
  - Deterministic and dependency-free.
- Optional tiktoken estimator:
  - Enabled by config/env only.
  - Uses model encoding when available.
  - Falls back to base encoding if model unknown.
  - If package missing or WASM load fails, log once and use default estimator.
- Context pack changes:
  - Accept `tokenizer?: 'heuristic' | 'tiktoken'` and `model?: string`.
  - Count serialized context payload, not only title+snippet.
  - Reserve fixed overhead for source metadata and separators.
  - Truncate long snippets at token boundary instead of dropping all oversized
    high-value results.

Implementation points:

- `packages/memory/src/retrieval/context-pack.ts`
- New `packages/memory/src/retrieval/token-estimator.ts`
- CLI/MCP schema for optional tokenizer/model knobs only if needed.

Tests:

- Heuristic fallback remains deterministic.
- Oversized single result is truncated and included.
- Multiple results never exceed budget.
- Optional tokenizer failure falls back cleanly.

## 8. Identifier-Aware FTS Query Shape

Problem: exact code search issue has two layers: scoring and candidate recall.
Even perfect scoring cannot rank a candidate that FTS did not return and vector
coverage has not embedded.

Best solution: generate broader code-aware FTS candidates while preserving exact
features for final ranking.

Design:

- For identifier query `refreshGraphCoverageForCodeFile`, generate FTS variants:
  - `"refreshGraphCoverageForCodeFile"`
  - `"refresh" AND "Graph" AND "Coverage" AND "For" AND "Code" AND "File"`
  - lower-case split terms.
- Run FTS in two modes:
  - phrase/exact mode for high-precision candidate set.
  - split-token mode for recall candidate set.
- Merge candidate IDs, tag stage as `fts_exact` and `fts_split`.
- Keep existing fetch limit clamp.

Tests:

- If exact token is absent from FTS, split-token FTS still recalls chunk.
- If exact token exists, exact FTS outranks split FTS.

## 9. Query-Time Embedder Cold Starts

Problem: read-only query paths can also instantiate or warm embedders inline.

Best solution: cache query embeddings and expose latency metrics; consider daemon
query embedding only after measurement.

Design:

- Add in-process LRU cache:
  - Key: `domain|provider|model|device|sha256(query)`.
  - Value: vector buffer plus created time.
  - Defaults: 256 entries, 10 minutes TTL.
- Add trace fields:
  - `query_embedding_cache_hit`
  - `query_embedding_ms`
  - `semantic_sql_ms`
- Avoid daemon RPC for first implementation because it complicates read paths.
  Add daemon-side query embedding only if metrics prove cold starts remain a
  material latency source.

Implementation points:

- `packages/memory/src/retrieval/search-code-support.ts`
- `packages/memory/src/retrieval/planner/baseline-lane.ts`
- `packages/memory/src/retrieval/query-trace.ts`

Tests:

- Same query only calls embedder once inside TTL.
- Different provider/model/device does not reuse vector.
- Cache disabled in tests when deterministic call counts are needed.

## Rollout Order

1. Fix daemon status scoping and stale docs path. Low risk, high diagnostic
   value.
2. Add identifier-aware `search_code` candidate recall and ranking tests. This
   fixes user-visible code retrieval while vector backlog remains.
3. Add daemon-drained embedding jobs and move hook code embedding out of the
   hook path.
4. Add semantic coverage explanations to `search_context`.
5. Add tokenizer abstraction and context pack truncation.
6. Replace eval groundedness with claim/span support checks.
7. Add query embedding cache and metrics if cold-start measurements justify it.

## Acceptance Criteria

- `memory doctor` reports vector coverage approaching 100% without repeated
  manual resume commands.
- Identifier query `refreshGraphCoverageForCodeFile` returns the implementation
  chunk first.
- Hook runs for changed files do not load ONNX runtime.
- Daemon status counts match doctor counts for watched project rows.
- `search_context` explains semantic degradation specifically when backlog
  exists.
- Eval groundedness fails when sources are retrieved but claims are unsupported.
- Context packs stay within configured token budget under heuristic fallback and
  optional tokenizer estimator.
