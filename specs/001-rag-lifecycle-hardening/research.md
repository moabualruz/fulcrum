# Research: Fulcrum RAG Lifecycle Hardening

**Date**: 2026-04-22  
**Feature**: `001-rag-lifecycle-hardening`  
**Purpose**: Enrich the feature specification with current source-backed guidance before planning.

## Source Collection

- Tavily research was attempted first, but the local `tvly` CLI has no configured Tavily API key. Continued with browser-backed official sources and Context7.
- Kuzu docs were fetched through Context7 using `/kuzudb/docs`.
- ONNX Runtime docs were fetched through Context7 using `/websites/onnxruntime_ai`.

## Decisions

### Decision: Treat full rebuild as a derived-state contract, not a convenience command

**Rationale**: SQLite FTS5 explicitly supports integrity checks and rebuilds for keeping a full-text index consistent with its content table. Fulcrum's reset/rebuild workflow should similarly verify keyword index consistency instead of only recreating rows.

**Spec impact**:
- Add text-search integrity verification to reset/rebuild and health reporting.
- Require report fields for checked indexes, failures, and repair recommendation.

**Sources**:
- SQLite FTS5 integrity-check verifies index consistency and fails on discrepancies: https://www.sqlite.org/fts5.html
- SQLite FTS5 rebuild discards and rebuilds the full-text index from the content table: https://www.sqlite.org/fts5.html

### Decision: Vector lifecycle needs sidecar metadata independent from vector blobs

**Rationale**: Local vector extensions expose vector search primitives, but operational correctness requires Fulcrum-specific metadata: source identity, content hash, dimensions, model, provider, device, freshness, and error state. SQLite Vec1 documentation confirms vector search is extension-backed and ANN-oriented, while Fulcrum must own durability and freshness semantics above that layer.

**Spec impact**:
- Keep vector coverage and freshness requirements.
- Add health/eval checks that prove no mixed-model or stale vector set is presented as healthy.

**Sources**:
- SQLite Vec1 overview: https://sqlite.org/vec1
- Existing audit report: `docs/audit/2026-04-22-fulcrum-rag-capability-report.md`

### Decision: Accelerator use must be reported as actual runtime state

**Rationale**: ONNX Runtime execution providers depend on CUDA/cuDNN compatibility and explicit provider configuration. WebGPU also requires explicit runtime selection. Fulcrum should distinguish "requested device" from "actual device" and expose fallback reasons when auto mode selects another provider.

**Spec impact**:
- Keep fail-closed behavior for explicit device configuration.
- Add compatibility/fallback details to job, recall explain, and health surfaces.

**Sources**:
- ONNX Runtime CUDA Execution Provider requirements and provider options: https://onnxruntime.ai/docs/execution-providers/CUDA-ExecutionProvider.html
- ONNX Runtime WebGPU explicit execution provider selection: https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html
- Context7 ONNX Runtime docs for provider fallback behavior: `/websites/onnxruntime_ai`

### Decision: Graph rebuild must materialize typed nodes and relationships that recall can explain

**Rationale**: Kuzu's Node.js API supports Cypher query execution and `getAll()` result retrieval, and graph modeling is based on explicit node and relationship tables. Fulcrum graph recall should therefore be tested as materialized domain relationships, not inferred side effects.

**Spec impact**:
- Keep graph coverage in reset/rebuild and doctor.
- Require graph contribution in explain output when graph expansion changes results.
- Plan graph tables around domain relationships: code imports, symbols, tasks, decisions, errors, and supersession.

**Sources**:
- Kuzu Node.js API and `getAll()` usage: https://docs.kuzudb.com/client-apis/nodejs/
- Context7 Kuzu docs: `/kuzudb/docs`

### Decision: Golden RAG evals should cover retrieval, answer, grounding, and operational parity separately

**Rationale**: RAG quality fails in different stages. LangSmith's RAG eval guidance separates correctness, relevance, groundedness, and retrieval relevance. OpenAI eval guidance warns against vibe-based evaluation and recommends task-specific, continuous evals with datasets and metrics.

**Spec impact**:
- Add eval categories for retrieval relevance, answer correctness, groundedness/provenance, ranking regression, and rebuild parity.
- Require fixture-backed local evals before and after full rebuilds.

**Sources**:
- LangSmith RAG evaluation categories: https://docs.langchain.com/langsmith/evaluate-rag-tutorial
- OpenAI evaluation best practices: https://developers.openai.com/api/docs/guides/evaluation-best-practices

### Decision: Destructive rebuild work must run inside explicit runtime data profiles

**Rationale**: Full rebuild, review, and test flows need different blast radii. Installed/operator data must remain durable. Dev/review data must be resettable for controlled validation. Test data must be disposable and isolated from both. Without a first-class profile boundary, a correct rebuild implementation can still corrupt the wrong DB or vault.

**Spec impact**:
- Add install/dev/test runtime data profiles with separate DB, vault, graph, vector, and artifact roots.
- Require path manifests and fail-closed unsafe-path checks before destructive maintenance.
- Require installed/operator profile confirmation and backup before destructive execution.
- Treat normal rebuild clearing as allowlisted derived-state reset, not full DB/vault wipe.

**Sources**:
- Operator incident context from 2026-04-22 local resource/run cleanup.
- Existing project config surfaces: `$FULCRUM_DATA_DIR`, `$FULCRUM_VAULT_PATH`, CLI `--vault`, and repo test tmpdir usage.

## Alternatives Considered

- **Single generic "RAG works" eval**: Rejected because it hides which stage failed and matches the audit's warning that "it indexed" can be mistaken for "it retrieves correctly."
- **Embedding metadata embedded only in vector rows**: Rejected because stale/mixed-model detection and failed-item retry need queryable operational state even when vector insertion fails.
- **Graph as optional optimization only**: Rejected for this feature's lifecycle scope because graph coverage and explanation are required to make relationship recall trustworthy.
- **Silent accelerator fallback in auto mode**: Rejected because operators need to know if GPU-first actually used GPU.
- **One shared DB/vault for install, review, and tests**: Rejected because tests and review rebuilds need reset freedom without risking installed/operator data.
- **Full database wipe as normal rebuild behavior**: Rejected because canonical task/run/audit and vault source state should survive normal derived-state rebuilds; full wipe needs separate backup-confirmed scope.

## Open Questions For Planning

- Exact command naming can remain flexible, but plan should preserve separate modes: plan, dry-run, execute, status/report.
- Exact JSON schemas should be defined in contracts during planning.
- Eval fixture size should be small enough for default CI while embedding/model-heavy evals remain opt-in.
