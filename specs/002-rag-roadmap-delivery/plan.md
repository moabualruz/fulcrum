# Implementation Plan: Fulcrum RAG Roadmap Delivery

**Branch**: `codex/002-rag-roadmap-delivery` | **Date**: 2026-04-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/002-rag-roadmap-delivery/spec.md`

## Summary

Fulcrum needs to move from "RAG pieces exist" to "RAG can be repaired, trusted, queried through one surface, evaluated against live state, and improved safely." This feature delivers the roadmap in incremental slices over the existing RAG lifecycle foundation from [001-rag-lifecycle-hardening](../001-rag-lifecycle-hardening/plan.md): targeted repair and coverage closure first, then unified context search, first-class code RAG, graph coverage and graph-aware retrieval, live evals/query traces, and gated optional runtime experiments.

Primary technical approach:
- Treat L0 vault, L1 curated pages, project files, tasks/runs, and explicit config as canonical.
- Treat FTS, sqlite-vec, code chunks, graph state, contextual index text, eval reports, and query traces as derived or operational state.
- Default repair to verify-and-fix differences from canonical sources; clean-slate rebuild remains an explicit scoped workflow only.
- Extend existing lifecycle surfaces (`memory rebuild`, `memory doctor`, embedding jobs, `search_code`, MCP/action tools) instead of introducing a parallel RAG stack.
- Add one agent-preferred `search_context` surface that orchestrates memory, file, code, graph, task, and decision evidence while preserving focused compatibility tools.
- Use multi-stage hybrid retrieval: lexical + semantic + metadata/freshness + graph candidates, bounded fusion/diversification/reranking, and source-diverse context packing.
- Persist runtime truth, query traces, eval cases/results, and coverage states so health and quality gates can detect degraded live RAG state.
- Keep optional vector store, graph store, indexer, and model-serving upgrades behind adapter boundaries and comparison gates until the local baseline proves insufficient.

## Technical Context

**Language/Version**: TypeScript ESM on Node 24.14.1 in this workspace; package TypeScript settings remain repo-defined.
**Primary Dependencies**: pnpm 10.33.0 workspace packages; `better-sqlite3`, SQLite FTS5, `sqlite-vec`, `@huggingface/transformers`, `web-tree-sitter`, optional `kuzu`, Hono monitor, Vitest.
**Storage**: SQLite core DB, FTS5 virtual tables, sqlite-vec `vec_memories` and `vec_chunks`, vault L0/L1 markdown files, optional Kuzu graph store, JSON artifacts, and persisted trace/eval/report rows.
**Testing**: Vitest with real in-memory SQLite; package tests under `packages/<pkg>/src/tests/`; targeted package tests before root `pnpm test`; model/accelerator evals opt in.
**Target Platform**: Local-first Fulcrum CLI, MCP/action tools, and monitor on developer/operator machines and agent hosts.
**Project Type**: TypeScript pnpm monorepo with CLI, MCP, local monitor, memory subsystem, worker adapters, and integration artifacts.
**Performance Goals**: Health/repair plan and explain preflight are bounded and read-only; unified context search keeps expensive expansion/rerank stages behind documented candidate limits; live evals report p50/p95 latency; long-running repair and embedding work stays resumable/cancellable.
**Constraints**: No implicit network calls in core/memory/policy/planning; no synchronous embedding/LLM calls on memory write path; ESM relative imports need `.js`; first-class IDs use `newId(<type>)`; persisted enum unions require SQLite `CHECK`; role checks use capability helpers; profile isolation and redaction rules from 001 remain hard gates.
**Scale/Scope**: Workspace-scale local RAG over vault content, project files, code chunks, graph relationships, tasks, decisions, and live eval cases. P1 closes trust and retrieval quality on the current local baseline; P2/P3 broaden graph modes and optional runtime experiments.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Control Plane First**: PASS. Work strengthens local state, repair, retrieval contracts, CLI/MCP/action surfaces, and quality gates. Optional external stores/runtimes stay behind adapters and cannot own canonical data.
- **Durable Invariants Over Intent**: PASS WITH REQUIREMENTS. New statuses and persisted eval/trace/coverage records require shared TS unions, SQLite `CHECK` constraints, guard-test updates, and `newId(<type>)` registration.
- **Memory Is Source-Controlled Knowledge**: PASS. L0/L1 remain canonical. Contextual index text is retrieval-only and must carry source hashes/context version.
- **Agent-Native Parity With Safe Tools**: PASS WITH REQUIREMENTS. `search_context`, RAG eval, repair status/report, and query trace surfaces need CLI plus MCP/action parity where agents need them. Mutating repair remains audited and capability-gated.
- **Test-First, Real Boundaries**: PASS. Migrations, search behavior, eval gates, and repair verification use real in-memory SQLite/Kuzu-compatible seams; no DB mocks.
- **Profile Isolation**: PASS. Absolute paths appear only in explicit operator preflight/report output; agent-facing traces/evals/memory use fingerprints and stable source references.
- **Security And Policy Are Default Gates**: PASS WITH REQUIREMENTS. Reports/traces/evals must redact secrets, provider config, raw env values, and private paths outside operator surfaces.
- **Observable And Recoverable Execution**: PASS. Repair reports, embedding/job events, query traces, eval runs, and monitor readouts make every long or quality-sensitive operation inspectable.
- **Simple, Typed, ESM-Publishable Code**: PASS. Reuse existing package ownership and lifecycle primitives; add abstractions only at the retrieval planner/adapter boundary where multiple domains need the same contract.

Post-design re-check: PASS if the contracts and data model below are followed. No constitution violation requires complexity tracking.

## Project Structure

### Documentation (this feature)

```text
specs/002-rag-roadmap-delivery/
├── plan.md
├── research.md
├── review.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── rag-roadmap-contracts.md
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
packages/core/src/
├── db/schema.ts
├── ids.ts
├── types.ts
├── config.ts
├── embedding/registry.ts
├── telemetry/spans.ts
└── tests/
    ├── check-constraints.test.ts
    ├── ids.test.ts
    ├── rag-lifecycle-schema.test.ts
    ├── rag-roadmap-schema.test.ts
    └── telemetry.test.ts

packages/memory/src/
├── setup/rag-health.ts
├── setup/rag-lifecycle.ts
├── setup/rag-repair.ts
├── setup/rag-coverage.ts
├── l2/code.ts
├── l2/embedding-jobs.ts
├── l2/vector-metadata.ts
├── retrieval/v3-search.ts
├── retrieval/search-code.ts
├── retrieval/search-context.ts
├── retrieval/context-pack.ts
├── retrieval/query-trace.ts
├── graph/
├── eval/
│   ├── rag-lifecycle/
│   └── live-rag/
└── tests/

packages/cli/src/
├── index.ts
├── tool-registry.ts
├── mcp-tools.ts
├── commands/memory-rag-health.ts
├── commands/memory-rag-lifecycle.ts
├── commands/memory-rag-eval.ts
├── commands/memory-reindex-l2.ts
├── commands/memory-search-context.ts
├── commands/memory-query-trace.ts
└── tests/

packages/monitor/src/
├── server.ts
└── tests/

docs/audit/
└── 2026-04-23-fulcrum-rag-10-roadmap-research.md
```

**Structure Decision**: Use the existing package ownership model. `core` owns shared types, IDs, migrations, config, and trace storage. `memory` owns repair, coverage, indexing, retrieval, graph, eval, and trace domain primitives. `cli` owns human and MCP/action surfaces. `monitor` owns read-only health/eval/trace visibility.

## Phase 0: Research Output

Research is captured in [research.md](./research.md). Resolved decisions:
- Stabilize the current local RAG baseline before optional runtime/store adoption.
- Use hybrid, multi-stage retrieval as the quality contract.
- Keep contextual index text separate from canonical source content.
- Treat code RAG as a distinct evidence subsystem under one unified planner.
- Rebuild, measure, and explain graph evidence; do not silently skip graph gaps.
- Separate retrieval, grounding/provenance, answer quality, latency, freshness, and coverage eval dimensions.
- Record requested and actual provider/model/device/dimensions separately and fail closed on explicit runtime mismatches.
- Require baseline comparison, rollback proof, local-first operation, and agent/tool parity before optional runtime/store defaults.

## Phase 1: Design Output

Design artifacts:
- [data-model.md](./data-model.md)
- [contracts/rag-roadmap-contracts.md](./contracts/rag-roadmap-contracts.md)
- [quickstart.md](./quickstart.md)

## Implementation Strategy

### Slice 0: Baseline Lock And Roadmap Gap Tests

Create failing tests that encode the roadmap gaps before changing behavior:
- Health status supports `out_of_scope` and required degraded domains never collapse to healthy.
- `memory doctor --json` exposes vector/code/graph/provenance/eval-readiness coverage states with next actions.
- `memory embed --scope code --json` either runs to terminal status or returns a job plus exact resume/run instruction; status cannot imply completed work when items are only queued.
- `search_code` fixture with semantic-only code intent fails before vec_chunks are used.
- Unified context search contract test fails until memory, code, file, graph, task, and decision result types are represented.
- Live eval suite fails when required vector or graph coverage is empty or when expected cases are missing.

### Slice 1: Repair Plan And Health Closure

Extend the existing RAG lifecycle foundation:
- Add `out_of_scope` to `RagHealthStatus` and matching DB guard coverage wherever persisted.
- Add a non-mutating repair planner in `@fulcrum/memory` that consumes `buildRagHealthReport`, vector metadata, code index state, graph coverage, eval readiness, and profile manifest.
- Expose repair planning through `fulcrum memory doctor --repair-plan --json` and MCP/action parity (`get_rag_repair_plan` or compatible extension of `get_rag_health`).
- Keep normal repair on targeted verify/fix operations: no DB/vault wipe unless `memory rebuild` is explicitly scoped and preflighted.
- Extend `fulcrum memory rebuild --all|--domain ... --mode plan|dry-run|execute --profile ... --confirm-profile ... --json` reports with repair-plan references, final health verification, and degraded-domain retry actions.
- Verify vector rows and metadata by source identity, content hash, model, provider, actual device, dimensions, freshness, and status.
- Verify graph coverage by memory/task/decision/file/symbol/error/fix domains. In P1, coverage rebuild/reporting is required; relationship query modes can remain P2.

### Slice 2: Runtime Truth And Embedding Job Execution

Close operational truth gaps before broader retrieval quality work:
- Ensure embedding jobs record requested and actual provider/model/device/dimensions on every item, vector metadata row, health report, trace, and eval artifact.
- Fail closed when provider/model/device is explicitly required and unavailable.
- Allow automatic fallback only when configuration permits it, and record fallback reason in job events, metadata, traces, and reports.
- Make `storeChunkEmbedding` use `getCodeEmbedder()` and return structured success/failure instead of swallowing write failures.
- Fix reindex counters so "embedded" increments only after vector row and metadata verification.
- Add an explicit job execution surface if needed: either `fulcrum memory embed --scope <...> --run --json` or `fulcrum jobs resume <job_id> --json` as the documented default path. The contract must not leave users with a "started" job that never runs without a visible next action.

### Slice 3: Unified Context Search Surface

Add `@fulcrum/memory` `searchContext()` and CLI/action surfaces:
- Inputs: query, workspace/project scope, source filters, top K, context budget, explain flag, allow graph, allow rerank, and optional runtime profile.
- Candidate sources: memory recall (`v3-search`), code search, file/prose chunks, graph entities/edges, tasks/runs/decisions, and compatibility legacy evidence.
- Ranking: lexical, semantic, metadata/freshness, and graph signals fused by reciprocal rank or documented weighted fusion.
- Diversification: cap repeated sources unless the query explicitly targets a file, page, task, or symbol.
- Output: typed results, source references, provenance class, freshness, stage contributions, skipped/degraded stage reasons, and optional packed context.
- Backward compatibility: focused `recall_knowledge` and `search_code` remain available; agents are steered to `search_context` for general context gathering.

### Slice 4: First-Class Code RAG

Upgrade code evidence while preserving code-specific contracts:
- Add semantic `vec_chunks` retrieval to `searchCode()` using current code vector coverage.
- Add code-specific candidate stages: path, exact symbol, FTS/lexical, dense code vector, dependency/import, graph expansion, recency, and changed-file hints.
- Persist code parse/index states per file and chunk: indexed, skipped, failed, stale, and current vector coverage.
- Ensure batch and incremental indexing share one file-level primitive for chunk identity, content hash, language, symbol context, line attribution, failure state, and freshness.
- Include line ranges, symbol path, package/module, parse status, vector status, provenance class, and source freshness on every code result.
- Add fixture tests for natural-language, symbol, path, dependency, stale file, moved file, and parse failure cases.

### Slice 5: Contextual Index Text

Improve retrieval quality without corrupting canonical evidence:
- Add contextual index text records for memory pages, file chunks, and code chunks.
- Store context version, source identity, canonical content hash, context prompt/template version, and generated index text hash.
- Index contextual text in FTS/vector stages while returning canonical snippets and citations.
- Mark contextual index text stale when canonical content, surrounding document metadata, symbol context, or context template version changes.
- Keep contextualization offline/local by default; any model-backed generation must use explicit configuration and fail closed without credentials.

### Slice 6: Graph Coverage And Relationship Retrieval

Deliver graph in two phases:
- P1: graph rebuild/coverage reporting from memory entities, tasks, decisions, errors, fixes, files, symbols, imports/calls where available; health fails or degrades when required graph coverage is empty/stale.
- P2: relationship query modes for local neighborhood, global summary, and drift-style expansion. Modes are enabled only when graph assets exist and explain output can cite contributing entities/edges.
- Extend graph evidence records with domain, relationship type, confidence, source refs, freshness, and optional summary IDs.
- Include graph contribution in unified search explanations when graph expansion changes candidates, ranking, or packed context.

### Slice 7: Live Evals, Query Traces, And Gates

Make quality gates prove live health, not only fixture behavior:
- Add `live-rag` eval suite beside `rag-lifecycle`.
- Persist eval cases and results so fixture and live suites can share reporting while keeping live cases workspace-bound.
- Fail live eval readiness when a required domain has zero expected cases.
- Add query trace persistence for explain-enabled searches: stage candidate counts, ranks/scores, fusion/rerank data, latency, runtime truth, freshness, source diversity decisions, provenance, and skipped-stage reasons.
- Extend `fulcrum memory eval --suite ... --json` for `rag-lifecycle`, `live-rag`, `code-rag`, and `unified-context` as suites are added.
- Update RAG gate path patterns so changes touching memory retrieval, code search, embeddings, graph, eval fixtures, trace contracts, CLI/MCP surfaces, or specs/002 trigger the relevant eval/health gates.
- Add read-only monitor endpoints/cards for health, eval runs, degraded domains, job status, and query traces.

### Slice 8: Optional Runtime/Store Adapter Experiments

Prepare future upgrades without changing defaults:
- Define adapter interfaces for vector store, graph store, code indexer, and model-serving runtime behind current local interfaces.
- Add experiment records with baseline run ID, candidate adapter, quality metrics, latency p50/p95, resource use, rollback proof, local-first capability, agent/tool parity, and risk notes.
- Keep optional adapters disabled by default and unavailable paths reported as out of scope or disabled.
- Block default adoption unless comparison gates pass and rollback has been tested.

## Risk And Mitigation

- **Scope creep from roadmap size**: Deliver in slices with P1/P2/P3 gates. Optional runtime adoption cannot block P1.
- **Repair corrupts canonical data**: Default repair touches allowlisted derived state only; clean-slate and destructive paths require explicit scope, profile preflight, confirmation, and audit.
- **False healthy status**: Health requires domain-level coverage, freshness, provenance, eval readiness, and failed/skipped/out-of-scope reasons.
- **Silent model/runtime fallback**: Requested and actual runtime fields are separate everywhere; explicit requests fail closed.
- **Search latency growth**: Expensive stages have candidate limits, trace latency, and skip/degrade explanations.
- **Contextual text provenance drift**: Store canonical hashes and context versions; return canonical snippets, not generated context, as evidence.
- **Graph complexity**: P1 ships rebuild/coverage first. Relationship modes require explicit assets and explainability.
- **Eval false confidence**: Live suites include coverage gates and fail when expected cases are missing.
- **Secret/path leakage**: Redaction layer covers logs, events, reports, traces, eval artifacts, and memory. Absolute paths stay operator-only.

## Test Plan

Targeted tests:
- `packages/core`: schema migrations for new tables/columns, enum guard tests, ID prefix tests, runtime profile/path redaction tests, trace storage tests.
- `packages/memory`: repair plan/report tests, health out-of-scope/degraded tests, vector metadata reconciliation tests, embedding runtime truth tests, code embedder/vector-stage tests, contextual index staleness tests, graph coverage tests, `searchContext()` ranking/diversity/explain tests, live eval runner tests, query trace tests.
- `packages/cli`: command parsing and JSON contracts for repair, rebuild, embed/job execution, search context, eval suites, traces, and MCP/tool registry parity.
- `packages/monitor`: read-only health/eval/job/trace readout tests.
- Gate tests: path pattern tests proving RAG changes trigger health/eval gates and unrelated changes can skip default RAG gates.

Broader verification:
- `pnpm --filter fulcrum-agent-core test`
- `pnpm --filter fulcrum-memory test`
- `pnpm --filter fulcrum-cli test`
- `pnpm test`
- `pnpm build`
- `pnpm run check:cycles`

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | No exception needed | No simpler alternative rejected |
