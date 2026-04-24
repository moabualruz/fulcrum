# Tasks: Fulcrum RAG Roadmap Delivery

**Input**: Design documents from `/specs/002-rag-roadmap-delivery/`  
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/rag-roadmap-contracts.md, quickstart.md

**Tests**: Required by project rules and this feature risk profile. Write tests first; each test task should fail before its paired implementation task lands.

**Organization**: Tasks are grouped by user story so each story can be implemented and verified independently after the foundational phase.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it touches different files or independent checks.
- **[Story]**: User story label for story phases only.
- Every task references concrete file paths.

## Specialist Enrichment Applied

- **Data integrity**: additive migrations, enum `CHECK` constraints, workspace scoping, vector metadata reconciliation, trace/eval persistence.
- **Security hardening**: capability gates, profile-safe mutation, redaction, operator-only absolute paths, structured errors.
- **API/interface design**: stable CLI/MCP/action contracts, backward compatibility for `search_code` and focused memory recall.
- **Agent-native architecture**: one agent-preferred context surface, machine-readable outputs, read-only vs mutating capability metadata.
- **Test-driven development**: failing contract, integration, and regression tests before implementation in each slice.
- **Integration utilization**: producer/consumer wiring across core, memory, CLI, MCP, monitor, and eval gates.
- **Performance/reliability**: bounded rerank/graph expansion, resumable jobs, query traces, latency metrics, degraded terminal states.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add feature scaffolding, fixture locations, and package exports without changing runtime behavior.

- [x] T001 [P] Create RAG roadmap fixture README in packages/memory/src/tests/fixtures/rag-roadmap/README.md
- [x] T002 [P] Create live RAG eval suite README in packages/memory/src/eval/live-rag/README.md
- [x] T003 [P] Add repair module scaffold in packages/memory/src/setup/rag-repair.ts
- [x] T004 [P] Add coverage module scaffold in packages/memory/src/setup/rag-coverage.ts
- [x] T005 [P] Add unified retrieval module scaffold in packages/memory/src/retrieval/search-context.ts
- [x] T006 [P] Add context pack module scaffold in packages/memory/src/retrieval/context-pack.ts
- [x] T007 [P] Add query trace module scaffold in packages/memory/src/retrieval/query-trace.ts
- [x] T008 [P] Add contextual index module scaffold in packages/memory/src/retrieval/contextual-index.ts
- [x] T009 [P] Add CLI search context command scaffold in packages/cli/src/commands/memory-search-context.ts
- [x] T010 [P] Add CLI query trace command scaffold in packages/cli/src/commands/memory-query-trace.ts
- [x] T011 [P] Add RAG roadmap schema test scaffold in packages/core/src/tests/rag-roadmap-schema.test.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared schema, type, ID, redaction, and contract work required before user stories.

**Critical**: No user story implementation begins until this phase is complete.

### Tests

- [x] T012 [P] Add failing ID prefix tests for repair plan/run, coverage, contextual index, eval case/result, query trace, context pack, and runtime experiment IDs in packages/core/src/tests/ids.test.ts
- [x] T013 [P] Add failing persisted enum `CHECK` tests for health `out_of_scope`, repair run status, coverage status, context result type, eval suite/case/result status, contextual index status, and runtime experiment status in packages/core/src/tests/check-constraints.test.ts
- [x] T014 [P] Add failing additive migration tests for repair, coverage, contextual index, eval case/result, query trace, and runtime experiment tables in packages/core/src/tests/rag-roadmap-schema.test.ts
- [x] T015 [P] Add failing workspace/project scoping tests for repair, coverage, trace, eval, and runtime experiment lookups in packages/core/src/tests/rag-roadmap-scope.test.ts
- [x] T016 [P] Add failing redaction/path exposure tests for repair plans, traces, eval artifacts, and context search results in packages/memory/src/tests/rag-roadmap-redaction.test.ts
- [x] T017 [P] Add failing CLI/MCP capability lint tests for `get_rag_repair_plan`, `search_context`, `run_rag_eval`, and `get_rag_query_trace` in packages/cli/src/tests/rag-roadmap-mcp-tools.test.ts
- [x] T018 [P] Add failing integration utilization tests proving new memory primitives are consumed by CLI registry and MCP tools in packages/cli/src/tests/rag-roadmap-utilization.test.ts

### Implementation

- [x] T019 Add RAG roadmap shared unions and output interfaces in packages/core/src/types.ts
- [x] T020 Register RAG roadmap ID prefixes in packages/core/src/ids.ts
- [x] T021 Implement additive RAG roadmap migrations with `CHECK` constraints and workspace/project indexes in packages/core/src/db/schema.ts
- [x] T022 Update schema guard lists for new persisted enums in packages/core/src/tests/check-constraints.test.ts
- [x] T023 Export shared RAG roadmap types through packages/core/src/index.ts
- [x] T024 Export RAG roadmap memory primitives through packages/memory/src/index.ts
- [x] T025 Implement shared redaction and path-fingerprint helpers for roadmap artifacts in packages/memory/src/setup/rag-redaction.ts
- [x] T026 Register MCP schemas for repair plan, search context, eval, and query trace tools in packages/cli/src/mcp-tools.ts
- [x] T027 Register registry-backed handlers with read-only/destructive capability metadata in packages/cli/src/tool-registry.ts

**Checkpoint**: Foundation ready; user story work can start.

---

## Phase 3: User Story 1 - Make RAG Health Repairable (Priority: P1)

**Goal**: One repair path that makes memory, code, vector, graph, and provenance indexes healthy from canonical sources or reports exact degraded domains and retry actions.

**Independent Test**: Start with degraded derived state, request a repair plan, execute targeted repair, and verify final health is healthy or every failed domain has explicit evidence and retry guidance.

### Tests for User Story 1

- [x] T028 [P] [US1] Add failing `out_of_scope` health status and required-domain degradation tests in packages/memory/src/tests/rag-health-roadmap.test.ts
- [x] T029 [P] [US1] Add failing non-mutating repair-plan tests for `fulcrum memory doctor --repair-plan --json` in packages/memory/src/tests/rag-repair-plan.test.ts
- [x] T030 [P] [US1] Add failing vector row/metadata reconciliation tests for source identity, hash, provider, model, actual device, dimensions, and freshness in packages/memory/src/tests/vector-metadata-reconcile.test.ts
- [x] T031 [P] [US1] Add failing graph coverage health tests for memory, task, decision, file, symbol, error, and fix domains in packages/memory/src/tests/rag-graph-coverage-health.test.ts
- [x] T032 [P] [US1] Add failing targeted repair execution tests proving normal repair does not wipe DB/vault or canonical sources in packages/memory/src/tests/rag-repair-execute.test.ts
- [x] T033 [P] [US1] Add failing CLI contract tests for `memory doctor --repair-plan`, final health verification, and retry action output in packages/cli/src/tests/rag-repair-contract.test.ts
- [x] T034 [P] [US1] Add failing MCP/action contract tests for `get_rag_repair_plan` and extended `get_rag_health` in packages/cli/src/tests/rag-repair-tools.test.ts
- [x] T035 [P] [US1] Add failing embedding runtime truth tests for requested vs actual provider/model/device/dimensions and explicit fail-closed mismatches in packages/memory/src/tests/embedding-runtime-truth-roadmap.test.ts
- [x] T036 [P] [US1] Add failing CLI contract tests requiring `memory embed --scope <scope> --json` to return terminal status or exact `next_action` resume command in packages/cli/src/tests/rag-embedding-next-action.test.ts

### Implementation for User Story 1

- [x] T037 [US1] Add `out_of_scope` to `RagHealthStatus` and update health mappers in packages/core/src/types.ts and packages/memory/src/setup/rag-health.ts
- [x] T038 [US1] Implement repair-plan domain analyzer using `buildRagHealthReport` in packages/memory/src/setup/rag-repair.ts
- [x] T039 [US1] Implement vector metadata reconciliation and coverage summaries in packages/memory/src/setup/rag-coverage.ts
- [x] T040 [US1] Extend graph coverage aggregation for memory/task/decision/file/symbol/error/fix domains in packages/memory/src/setup/rag-health.ts
- [x] T041 [US1] Extend rebuild report output with repair-plan linkage, final health status, verification summary, and retry actions in packages/memory/src/setup/rebuild-report.ts
- [x] T042 [US1] Wire targeted repair execution to existing rebuild domains without clean-slate mutation in packages/memory/src/setup/rag-lifecycle.ts
- [x] T043 [US1] Wire `fulcrum memory doctor --repair-plan --json` in packages/cli/src/index.ts and packages/cli/src/commands/memory-rag-health.ts
- [x] T044 [US1] Implement `get_rag_repair_plan` handler in packages/cli/src/tool-registry.ts
- [x] T045 [US1] Update CLI/MCP schemas for `out_of_scope`, degraded reasons, and next actions in packages/cli/src/mcp-tools.ts
- [x] T046 [US1] Persist actual provider/model/device/dimensions on embedding job items and vector metadata in packages/memory/src/l2/embedding-jobs.ts and packages/memory/src/l2/vector-metadata.ts
- [x] T047 [US1] Enforce explicit provider/model/device fail-closed behavior and visible fallback reasons in packages/memory/src/l2/embedding-jobs.ts
- [x] T048 [US1] Return exact `next_action` resume commands from queued embedding job starts in packages/cli/src/commands/memory-embedding-jobs.ts

**Checkpoint**: US1 repair workflow is independently functional and safe.

---

## Phase 4: User Story 2 - Search One Context Surface (Priority: P1)

**Goal**: One agent-preferred search surface over memory, file, code, graph, task, and decision evidence with typed results, source diversity, and explain output.

**Independent Test**: Run one query whose evidence spans memory, code, file, graph, and task/decision records; verify top results include typed source-diverse evidence and explanations.

### Tests for User Story 2

- [x] T049 [P] [US2] Add failing `searchContext()` contract tests for typed result records and required source refs in packages/memory/src/tests/search-context-contract.test.ts
- [x] T050 [P] [US2] Add failing hybrid fusion tests for lexical, semantic, metadata/freshness, and graph stage contribution in packages/memory/src/tests/search-context-ranking.test.ts
- [x] T051 [P] [US2] Add failing source-diversity and deduplication tests for context packing in packages/memory/src/tests/context-pack.test.ts
- [x] T052 [P] [US2] Add failing skipped/degraded stage explanation tests in packages/memory/src/tests/search-context-explain.test.ts
- [x] T053 [P] [US2] Add failing CLI/action contract tests for `fulcrum search context ... --explain --json` and `search_context` in packages/cli/src/tests/search-context-contract.test.ts
- [x] T054 [P] [US2] Add failing backward compatibility tests proving `recall_knowledge` and `search_code` still work in packages/cli/src/tests/search-context-compat.test.ts
- [x] T055 [P] [US2] Add failing contextual index canonical-snippet tests proving contextual text affects ranking but returned evidence remains canonical in packages/memory/src/tests/contextual-index.test.ts
- [x] T056 [P] [US2] Add failing contextual index staleness tests for canonical hash, symbol/document context, and template version changes in packages/memory/src/tests/contextual-index-staleness.test.ts

### Implementation for User Story 2

- [x] T057 [US2] Implement `TypedContextResult`, source reference, stage contribution, and context pack mappers in packages/memory/src/retrieval/search-context.ts
- [x] T058 [US2] Implement candidate collection from memory recall, code search, file/prose chunks, graph units, tasks, and decisions in packages/memory/src/retrieval/search-context.ts
- [x] T059 [US2] Implement hybrid fusion with documented candidate limits in packages/memory/src/retrieval/search-context.ts
- [x] T060 [US2] Implement source diversity, duplicate suppression, and context budget packing in packages/memory/src/retrieval/context-pack.ts
- [x] T061 [US2] Implement skipped/degraded stage explanations and unavailable-stage reasons in packages/memory/src/retrieval/search-context.ts
- [x] T062 [US2] Wire `fulcrum search context` command in packages/cli/src/index.ts and packages/cli/src/commands/memory-search-context.ts
- [x] T063 [US2] Implement `search_context` MCP/action handler and schema in packages/cli/src/tool-registry.ts and packages/cli/src/mcp-tools.ts
- [x] T064 [US2] Add agent-preferred guidance for unified context search in docs/guides/cli-reference.md
- [x] T065 [US2] Implement contextual index record writer/reader with source hash and template version tracking in packages/memory/src/retrieval/contextual-index.ts
- [x] T066 [US2] Use contextual index text in memory, file, and code candidate stages while returning canonical snippets in packages/memory/src/retrieval/search-context.ts
- [x] T067 [US2] Mark contextual index records stale when canonical content, context metadata, or template versions change in packages/memory/src/retrieval/contextual-index.ts

**Checkpoint**: US2 unified context search is independently usable while focused tools remain compatible.

---

## Phase 5: User Story 3 - Upgrade Code RAG To First-Class Evidence (Priority: P1)

**Goal**: Code retrieval understands paths, symbols, dependencies, semantic intent, line ranges, freshness, and parse/index failures.

**Independent Test**: Ask natural-language, symbol, path, and dependency questions; verify expected file and line-range evidence appears in top results with stage explanations.

### Tests for User Story 3

- [x] T068 [P] [US3] Add failing semantic code vector retrieval tests for `vec_chunks` in packages/memory/src/tests/search-code-vector.test.ts
- [x] T069 [P] [US3] Add failing code embedder usage tests proving code chunks use `getCodeEmbedder()` in packages/memory/src/tests/code-embedder.test.ts
- [x] T070 [P] [US3] Add failing path, symbol, package/module, dependency, and recency ranking tests in packages/memory/src/tests/search-code-ranking.test.ts
- [x] T071 [P] [US3] Add failing parse/index failure state tests exposed through health and search explanations in packages/memory/src/tests/code-index-failures-roadmap.test.ts
- [x] T072 [P] [US3] Add failing batch/incremental parity tests for file identity, chunk identity, line attribution, failure state, and freshness in packages/memory/src/tests/code-index-roadmap-parity.test.ts
- [x] T073 [P] [US3] Add failing CLI/action `search_code` compatibility and enhanced explain tests in packages/cli/src/tests/search-code-roadmap-contract.test.ts

### Implementation for User Story 3

- [x] T074 [US3] Change code chunk embedding writes to use `getCodeEmbedder()` and structured write results in packages/memory/src/l2/code.ts
- [x] T075 [US3] Fix L2 reindex counters to increment only after vector row and metadata verification in packages/cli/src/commands/memory-reindex-l2.ts
- [x] T076 [US3] Add `vec_chunks` semantic candidate stage to `searchCode()` in packages/memory/src/retrieval/search-code.ts
- [x] T077 [US3] Add path, symbol, package/module, dependency, recency, and changed-file hint weighting to packages/memory/src/retrieval/search-code.ts
- [x] T078 [US3] Persist and expose code parse/index/vector status per file and chunk in packages/memory/src/l2/code.ts
- [x] T079 [US3] Ensure batch and PCI code indexing share one file-level primitive in packages/memory/src/setup/backfill-code-files.ts and packages/memory/src/pci/syncer.ts
- [x] T080 [US3] Extend `search_code` results with line range, symbol path, vector status, parse status, stage scores, and freshness in packages/memory/src/retrieval/search-code.ts
- [x] T081 [US3] Update CLI/MCP `search_code` schemas for enhanced result fields without breaking existing callers in packages/cli/src/mcp-tools.ts

**Checkpoint**: US3 code RAG returns semantic and structured code evidence with trustworthy attribution.

---

## Phase 6: User Story 4 - Make Graph Evidence Operational (Priority: P2)

**Goal**: Rebuild, measure, and query relationship evidence over tasks, decisions, files, symbols, errors, fixes, and memory entities.

**Independent Test**: Rebuild graph coverage from fixture/live sources, run a relationship query, and verify graph entities/edges, source references, and explain contribution.

### Tests for User Story 4

- [x] T082 [P] [US4] Add failing graph rebuild coverage tests for tasks, decisions, files, symbols, errors, fixes, and memory entities in packages/memory/src/tests/graph-coverage-roadmap.test.ts
- [x] T083 [P] [US4] Add failing graph entity/edge source reference and freshness tests in packages/memory/src/tests/graph-evidence-units.test.ts
- [x] T084 [P] [US4] Add failing local-neighborhood relationship query tests in packages/memory/src/tests/search-context-graph-local.test.ts
- [x] T085 [P] [US4] Add failing global-summary and drift-style expansion gating tests in packages/memory/src/tests/search-context-graph-modes.test.ts
- [x] T086 [P] [US4] Add failing graph contribution explain tests in packages/memory/src/tests/search-context-graph-explain.test.ts

### Implementation for User Story 4

- [x] T087 [US4] Implement graph coverage producer for memory/task/decision/error/fix/file/symbol/import/call domains in packages/memory/src/graph/coverage.ts
- [x] T088 [US4] Persist graph evidence units with source refs, confidence, freshness, domain, and relationship type in packages/memory/src/graph/evidence.ts
- [x] T089 [US4] Include graph coverage in repair plans and health reports in packages/memory/src/setup/rag-repair.ts and packages/memory/src/setup/rag-health.ts
- [x] T090 [US4] Add local-neighborhood graph expansion to unified search in packages/memory/src/retrieval/search-context.ts
- [x] T091 [US4] Add global-summary and drift-style graph modes gated by available assets in packages/memory/src/retrieval/search-context.ts
- [x] T092 [US4] Add graph contribution details to query trace and search explanations in packages/memory/src/retrieval/query-trace.ts
- [x] T093 [US4] Update graph rebuild CLI/report guidance in packages/cli/src/commands/memory-rag-lifecycle.ts

**Checkpoint**: US4 graph evidence is rebuildable, measurable, and explainable.

---

## Phase 7: User Story 5 - Gate Quality With Live Evals And Observability (Priority: P2)

**Goal**: Fixture and live evals plus query traces prove coverage, retrieval quality, provenance, latency, and runtime truth.

**Independent Test**: Run fixture and live evals, intentionally remove vector or graph coverage, and verify eval gates fail with trace-backed reasons.

### Tests for User Story 5

- [x] T094 [P] [US5] Add failing `live-rag` eval fixture and runner tests in packages/memory/src/eval/live-rag/runner.test.ts
- [x] T095 [P] [US5] Add failing eval readiness tests for required domains with zero expected cases in packages/memory/src/tests/rag-eval-readiness.test.ts
- [x] T096 [P] [US5] Add failing query trace persistence tests for stage counts, ranks, scores, fusion/rerank, latency, runtime truth, freshness, and provenance in packages/memory/src/tests/query-trace.test.ts
- [x] T097 [P] [US5] Add failing eval metrics tests for recall@K, MRR, nDCG, context precision/recall, groundedness, provenance, citation accuracy, and latency in packages/memory/src/tests/rag-eval-metrics-roadmap.test.ts
- [x] T098 [P] [US5] Add failing RAG gate path-pattern tests for memory, code search, embeddings, graph, eval fixtures, traces, CLI/MCP, and specs/002 in packages/cli/src/tests/rag-roadmap-gate.test.ts
- [x] T099 [P] [US5] Add failing monitor read-only tests for health, eval runs, degraded domains, jobs, and traces in packages/monitor/src/tests/rag-roadmap-readouts.test.ts
- [x] T100 [P] [US5] Add failing opt-in gating tests for model-heavy and accelerator-heavy cases in new eval suites in packages/memory/src/tests/rag-eval-opt-in-roadmap.test.ts

### Implementation for User Story 5

- [x] T101 [US5] Implement persisted eval cases/results and suite selection for `live-rag`, `code-rag`, and `unified-context` in packages/memory/src/eval/index.ts
- [x] T102 [US5] Implement `live-rag` runner with coverage gates and missing-expected-case degraded readiness in packages/memory/src/eval/live-rag/runner.ts
- [x] T103 [US5] Implement query trace persistence and redaction in packages/memory/src/retrieval/query-trace.ts
- [x] T104 [US5] Wire explain-enabled `searchContext()` and `searchCode()` calls to persist query traces in packages/memory/src/retrieval/search-context.ts and packages/memory/src/retrieval/search-code.ts
- [x] T105 [US5] Extend `fulcrum memory eval --suite ... --json` for new suites in packages/cli/src/commands/memory-rag-eval.ts and packages/cli/src/index.ts
- [x] T106 [US5] Implement `run_rag_eval` and `get_rag_query_trace` MCP/action handlers in packages/cli/src/tool-registry.ts
- [x] T107 [US5] Update RAG gate path patterns for roadmap surfaces in packages/cli/src/commands/memory-rag-eval.ts
- [x] T108 [US5] Add monitor read-only endpoints/cards for RAG health, eval runs, degraded domains, jobs, and query traces in packages/monitor/src/server.ts
- [x] T109 [US5] Enforce opt-in model-heavy and accelerator-heavy eval execution for all new suites in packages/memory/src/eval/index.ts and packages/cli/src/commands/memory-rag-eval.ts

**Checkpoint**: US5 eval and trace gates catch degraded live RAG state.

---

## Phase 8: User Story 6 - Choose Future Runtime Upgrades Safely (Priority: P3)

**Goal**: Optional indexer, model-serving, vector-store, and graph-store experiments are comparable, reversible, local-first, and never default without proof.

**Independent Test**: Register a disabled or stub optional adapter experiment, run baseline/candidate comparison, and verify adoption cannot become default without all gates passing.

### Tests for User Story 6

- [x] T110 [P] [US6] Add failing optional runtime adapter boundary tests in packages/memory/src/tests/rag-runtime-adapters.test.ts
- [x] T111 [P] [US6] Add failing runtime experiment persistence and status transition tests in packages/core/src/tests/rag-runtime-experiment.test.ts
- [x] T112 [P] [US6] Add failing baseline-vs-candidate comparison gate tests in packages/memory/src/tests/rag-runtime-comparison.test.ts
- [x] T113 [P] [US6] Add failing rollback/local-first/agent-parity adoption gate tests in packages/memory/src/tests/rag-runtime-adoption-gates.test.ts
- [x] T114 [P] [US6] Add failing CLI contract tests for listing and reporting optional runtime experiments in packages/cli/src/tests/rag-runtime-experiment-contract.test.ts

### Implementation for User Story 6

- [x] T115 [US6] Define vector store, graph store, code indexer, and model runtime adapter interfaces in packages/memory/src/runtime/adapters.ts
- [x] T116 [US6] Implement optional runtime experiment records and transitions in packages/memory/src/runtime/experiments.ts
- [x] T117 [US6] Implement baseline-vs-candidate comparison using eval run IDs and latency/resource summaries in packages/memory/src/runtime/comparison.ts
- [x] T118 [US6] Enforce adoption gates for quality, latency, rollback, local-first operation, agent/tool parity, and operational risk in packages/memory/src/runtime/experiments.ts
- [x] T119 [US6] Wire optional runtime experiment report commands in packages/cli/src/index.ts and packages/cli/src/commands/memory-runtime-experiments.ts
- [x] T120 [US6] Document optional runtime experiment gates in docs/guides/rag-runtime-experiments.md

**Checkpoint**: US6 optional upgrades are gated experiments, not accidental defaults.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Validation, docs, cleanup, and whole-feature proof.

- [x] T121 [P] Update roadmap implementation notes in docs/audit/2026-04-23-fulcrum-rag-10-roadmap-research.md with spec/task references
- [x] T122 [P] Update CLI reference for repair, unified search, eval, trace, and runtime experiment commands in docs/guides/cli-reference.md
- [x] T123 [P] Update MCP/action tool reference in docs/guides/mcp-tools.md
- [x] T124 [P] Add quickstart validation command transcript in specs/002-rag-roadmap-delivery/quickstart.md
- [x] T125 Run targeted package tests: `pnpm --filter fulcrum-agent-core test`, `pnpm --filter fulcrum-memory test`, and `pnpm --filter fulcrum-cli test`
- [x] T126 Run broad verification: `pnpm test`, `pnpm build`, `pnpm run check:cycles`, and `git diff --check`
- [x] T127 Review generated reports/traces/eval artifacts for secret, raw env, and unintended absolute path leakage

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup**: No dependencies.
- **Phase 2 Foundational**: Depends on Phase 1 and blocks all user stories.
- **US1 Repair (P1)**: Depends on Phase 2.
- **US2 Unified Search (P1)**: Depends on Phase 2; integrates best after US1 health states exist.
- **US3 Code RAG (P1)**: Depends on Phase 2; can run beside US2 after code/vector foundation is stable.
- **US4 Graph Evidence (P2)**: Depends on US1 health coverage and US2 unified search contracts.
- **US5 Evals/Observability (P2)**: Depends on US1, US2, and US3; graph-specific gates depend on US4.
- **US6 Optional Runtime Gates (P3)**: Depends on US5 eval comparison outputs.
- **Phase 9 Polish**: Depends on selected user stories being complete.

### MVP Definition

P1 MVP requires Phase 1, Phase 2, US1, US2, and US3:
- Repair plan/execution can return healthy or exact degraded status.
- Unified context search returns typed, source-diverse evidence.
- Code RAG includes semantic code vectors and line/symbol provenance.

### Parallel Opportunities

- T001-T011 can run in parallel.
- T012-T018 can run in parallel.
- T028-T036 can run in parallel before US1 implementation.
- T049-T056 can run in parallel before US2 implementation.
- T068-T073 can run in parallel before US3 implementation.
- T082-T086 can run in parallel before US4 implementation.
- T094-T100 can run in parallel before US5 implementation.
- T110-T114 can run in parallel before US6 implementation.
- Documentation tasks T121-T124 can run in parallel after corresponding surfaces land.

### Test-First Order

- For each story, complete story test tasks first and confirm they fail for the intended reason.
- Then implement story tasks in listed order.
- At each checkpoint, run targeted story tests before moving to the next priority slice.

## Notes

- Keep normal repair targeted; clean-slate rebuild requires explicit scoped task and preflight.
- Keep P1 graph work to rebuild/coverage/reporting unless implementing US4.
- Keep optional runtimes disabled by default until US6 gates pass.
- Do not expose secrets, raw env values, or unintended absolute paths in reports, traces, evals, events, or memory.
