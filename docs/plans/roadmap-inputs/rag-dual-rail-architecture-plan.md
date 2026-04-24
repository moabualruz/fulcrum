# RAG Dual Rail Architecture Roadmap Input
- Source: /home/mkh/workspace/pi-stack-plan/docs/plans/2026-04-23-001-feat-rag-dual-rail-architecture-plan.md

## Must Carry Into Roadmap
- Fulcrum retrieval needs one planner-grade contract used by baseline local retrieval and optional challenger lanes.
- Keep focused compatibility tools such as `recall_knowledge` and `search_code`; roadmap should improve shared semantics without deleting existing surfaces.
- Retrieval must be read-only by default. Query traces, context packs, and observability writes become explicit opt-in or async side-channel behavior.
- Memory/context retrieval and code retrieval remain distinct surfaces, but both plug into the same planner, result, explain, and eval contract.
- Baseline local lane must become credible everyday path using lexical recall, semantic/vector candidates, freshness, graph evidence, fusion, rerank, and source-diverse packing.
- Optional Python ML and Rust search/index lanes are challengers, disabled by default, and cannot bypass baseline trust gates or mutate default behavior.
- Graph evidence must affect ranking when available and report skipped/degraded state when disabled or failed.
- Repair must become dependency-aware orchestration: targeted repair vs clean-slate rebuild, blocking conditions, ordered actions, and post-run verification.
- Eval/adoption gates must be unified across live and fixture evals, baseline and challenger lanes, CLI, MCP/action surfaces, and monitor readouts.
- Large RAG modules need decomposition across planner, lanes, fusion, observability, setup repair, eval gates, and runtime challengers before further growth.

## Milestone Impacts
- Retrieval contract milestone: add planner request/result/explain contract, lane selection, fusion, and observability split across `searchContext()` and `searchCode()`.
- Read/write semantics milestone: prove default searches do not create `rag_query_traces`, `rag_context_results`, or `context_packs` rows unless persistence is requested.
- Baseline quality milestone: replace semantic placeholder behavior with real local candidate generation and stage scoring; preserve deterministic degraded/skipped reporting.
- Setup/repair milestone: split health detection from repair orchestration and add dependency graph, repair actions, verification, and non-mutating plan inspection.
- Trust milestone: add lane identity, lane comparison, readiness reasons, degraded/rejected states, and shared gates for latency, quality, rollback proof, and coverage.
- Challenger milestone: define Python ML and Rust search/index adapters as stage providers under the common contract, visible for comparison while disabled by default.
- Parity milestone: align CLI commands, MCP tools, monitor endpoints, docs, and capability metadata for search, health, repair, eval, runtime experiments, and lane trust.
- Refactor milestone: shrink `search-context.ts`, `search-code.ts`, `rag-health.ts`, `rag-repair.ts`, and `eval/roadmap.ts` behind bounded modules with characterization tests.

## Acceptance Criteria
- Unified search returns typed results and explanation data without persistence by default.
- Explicit persist/explain mode writes redacted trace/result/context-pack rows with stable IDs and scoped workspace/project validation.
- Unified retrieval can return relevant memory and code evidence when lexical overlap is weak.
- Graph evidence can change ranking, and its contribution appears in explanation output.
- Missing vectors, disabled graph, or lane-internal failures degrade cleanly without leaking secrets or absolute paths.
- Source-diversity caps prevent one file or memory family from dominating packed context.
- Repair plans show ordered dependencies, targeted vs clean-slate reasoning, blocking conditions, canonical-source immutability, and verification steps.
- Post-repair success requires health and eval gates to pass.
- Baseline and challenger lanes run against same eval suite and produce comparable machine-readable trust/degradation/rejection reasons.
- Challenger lanes remain inert when disabled; adoption fails closed when required metadata, gates, rollback proof, or coverage are missing.
- CLI, MCP/action, monitor, and docs expose same semantics for read-only retrieval, repair plans, lane status, eval gates, and runtime experiments.
- Public behavior remains stable after module decomposition, with tests covering scoping, redaction, endpoint parity, and E2E RAG readouts.

## Risks / Open Questions
- Open question: exact quantitative thresholds for credible baseline quality across `live-rag`, `code-rag`, and `unified-context`.
- Open question: first-increment split between Python ML responsibilities and Rust search/index responsibilities.
- Open question: which planner-stage names stay public versus become internal aliases behind cleaner traces.
- Risk: planner extraction may break existing CLI/MCP contracts unless characterization tests land before behavior moves.
- Risk: read/write split can hide observability regressions unless explicit persistence modes and async sink behavior are tested.
- Risk: weak baseline could make optional sidecars de facto required; roadmap should block that by defining baseline acceptance before challenger adoption.
- Risk: challenger contract may become too abstract; keep it narrow around candidate generation, runtime truth, degradation, and gates.
- Risk: repair orchestration can become another monolith unless dependency graph, actions, verification, and contract split early.
- Setup implication: canonical L0/L1 sources stay immutable; only derived or operational RAG domains should be repaired/rebuilt.
- Setup implication: optional model/store/accelerator paths remain opt-in and must not poison baseline health when unavailable.

## Links To Preserve
- Origin requirements: `docs/brainstorms/2026-04-23-fulcrum-rag-10-dual-rail-requirements.md`
- Related specs: `specs/001-rag-lifecycle-hardening/`, `specs/002-rag-roadmap-delivery/`
- Related audit: `docs/audit/2026-04-23-fulcrum-rag-10-roadmap-research.md`
- Retrieval surfaces: `packages/memory/src/retrieval/search-context.ts`, `packages/memory/src/retrieval/search-code.ts`, `packages/memory/src/retrieval/query-trace.ts`
- Setup surfaces: `packages/memory/src/setup/rag-health.ts`, `packages/memory/src/setup/rag-repair.ts`, `packages/memory/src/setup/rag-lifecycle.ts`
- Eval/runtime surfaces: `packages/memory/src/eval/roadmap.ts`, `packages/memory/src/runtime/experiments.ts`, `packages/memory/src/runtime/adapters.ts`
- CLI/MCP/monitor parity: `packages/cli/src/tool-registry.ts`, `packages/cli/src/mcp-tools.ts`, `packages/monitor/src/server.ts`
- Proposed new modules: `packages/memory/src/retrieval/planner/*`, `packages/memory/src/setup/repair/*`, `packages/memory/src/eval/roadmap/*`, `packages/memory/src/runtime/challengers/*`
- Docs to update: `docs/guides/cli-reference.md`, `docs/guides/mcp-tools.md`, `docs/guides/rag-runtime-experiments.md`
