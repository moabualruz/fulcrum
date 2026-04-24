# RAG Design Solutions Roadmap Input
- Source: /home/mkh/workspace/pi-stack-plan/docs/plans/2026-04-24-rag-design-solutions.md

## Must Carry Into Roadmap
- Fulcrum RAG needs hybrid retrieval that keeps lexical/BM25 and dense vector lanes distinct, then fuses with identifier-aware deterministic boosts.
- Code retrieval must treat identifier/path queries differently from natural-language queries; exact symbol/path hits must outrank semantic-only matches.
- FTS query shaping must generate exact phrase and split identifier/path variants so candidate recall does not depend on vector coverage.
- Embedding work must move out of one-shot hooks. Hooks update files, chunks, FTS, symbol metadata, graph evidence, and enqueue durable embedding jobs only.
- Daemon/indexer must own long-lived embedders, ONNX session warmup, bounded embedding slices, cancellation, and job-event telemetry.
- Vector coverage degradation must be explicit in `memory doctor`, daemon status, and `search_context` explain traces.
- Daemon status must separate process-local watch state from scoped durable DB coverage counts, using `workspace_id` and `project_id`.
- Eval groundedness must move from source-overlap checks to claim-level support against cited spans, with forbidden-claim detection.
- Context packing needs tokenizer-aware counting/truncation with deterministic heuristic fallback and optional tiktoken/model estimator.
- Query-time embedding should add cache/metrics before any daemon RPC design; first step is in-process LRU keyed by domain/provider/model/device/query hash.

## Milestone Impacts
- Diagnostics milestone: fix daemon status scoping first, preserve compatibility fields for one release, and align `memory doctor` with durable coverage counts.
- Code search milestone: add `classifyCodeQuery`, split identifier/path FTS variants, exact feature scoring, explain-stage contributions, and regression tests for `refreshGraphCoverageForCodeFile`.
- Indexer milestone: implement daemon-drained embedding jobs with single active slice per workspace/project/source domain, bounded batch defaults, cancellation, event logs, and no ONNX work in hooks.
- Search context milestone: expose semantic coverage summaries and explicit skip reasons: `vector_backlog`, `missing_embedder`, `vec_table_unavailable`.
- Eval milestone: add `expected_claims`, `expected_citations`, `forbidden_claims`, claim splitting, cited-span checks, and deterministic support/contradiction/unsupported results.
- Context pack milestone: introduce `TokenEstimator`, count serialized payload plus metadata overhead, truncate long high-value snippets at token boundary, and keep dependency-free default.
- Performance milestone: add query embedding cache plus trace fields for cache hit, query embedding latency, and semantic SQL latency; consider daemon-side query embedding only after metrics.

## Acceptance Criteria
- `memory doctor` reports active embedding job, pending/stale counts, daemon worker status, and vector coverage approaching 100% without repeated manual resume commands.
- `search_code("refreshGraphCoverageForCodeFile")` returns implementation chunk first; natural-language code queries still benefit from vector lane.
- Exact symbol/path matches cannot be outranked by semantic-only hits for identifier/path queries.
- Identifier FTS split-token mode recalls chunks when exact token is absent; exact FTS outranks split FTS when both match.
- Hook path for changed files updates chunks/FTS/metadata/graph evidence without calling registered embedder or loading ONNX runtime.
- Daemon worker later writes `vec_chunks` and `vector_metadata`, avoids concurrent slices for same project, honors cancellation after current batch, and fails clearly when embedder missing.
- Daemon status durable counts match doctor counts and do not bleed rows between workspaces sharing same `project_id`.
- `search_context` keeps lexical/graph fallback working during vector backlog and explains degraded semantic coverage in trace.
- Eval returns `grounded=false` when expected source is retrieved but material claims are unsupported, citations point to wrong spans, or forbidden claims appear.
- Context packs stay within token budget under heuristic fallback and optional tokenizer; oversized single high-value result is truncated and retained.

## Risks / Open Questions
- ONNX/embedder lifecycle risk remains until daemon ownership is proven across hook, daemon, and query processes.
- Weighted fusion parameters may need tuning after identifier-aware features land; avoid overfitting to one regression query.
- Durable embedding job scope needs exact rule for coalescing multiple file changes: one project job, source-domain job, or chunk-set job.
- Query embedding cache can hide call-count expectations in tests; roadmap should require deterministic cache disable or injection.
- Optional tokenizer dependency can fail at install, WASM load, or unknown-model lookup; fallback and logging must be explicit.
- Claim splitting and deterministic span checks may miss paraphrases; optional verifier remains open and must not be required for default tests.
- Open question: what vector coverage threshold marks `search_context` semantic lane degraded versus healthy?
- Open question: which daemon status compatibility fields can be removed after one release?

## Links To Preserve
- Remaining issues handover: /home/mkh/workspace/pi-stack-plan/docs/handover/2026-04-24-rag-remaining-issues.md
- Embedding jobs: `packages/memory/src/l2/embedding-jobs.ts`
- Indexer daemon/status: `packages/memory/src/indexer/handlers.ts`, `packages/memory/src/indexer/registry.ts`, `packages/memory/src/indexer/client.ts`
- Hook/indexer paths: `packages/memory/src/pci/syncer.ts`, `packages/memory/src/l2/code.ts`, `packages/cli/src/hooks.ts`
- Code retrieval: `packages/memory/src/retrieval/search-code.ts`, `packages/memory/src/retrieval/search-code-support.ts`, `packages/memory/src/sparse.ts`
- Search context/planner health: `packages/memory/src/retrieval/search-context.ts`, `packages/memory/src/retrieval/planner/baseline-lane.ts`, `packages/memory/src/setup/rag-health.ts`
- Eval groundedness: `packages/memory/src/eval/roadmap/support.ts`, `packages/memory/src/eval/fixtures.ts`, `packages/memory/src/tests/rag-eval-default-retriever.test.ts`
- Context pack/tokenizer: `packages/memory/src/retrieval/context-pack.ts`, `packages/memory/src/retrieval/token-estimator.ts`
- Query trace/cache: `packages/memory/src/retrieval/query-trace.ts`
