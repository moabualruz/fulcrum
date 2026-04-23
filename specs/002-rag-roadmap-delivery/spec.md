# Feature Specification: Fulcrum RAG Roadmap Delivery

**Feature Branch**: `[codex/002-rag-roadmap-delivery]`
**Created**: 2026-04-23
**Status**: Draft
**Input**: User description: "Create a new Spec Kit workflow whose aim is to achieve the RAG roadmap in docs/audit/2026-04-23-fulcrum-rag-10-roadmap-research.md."

## Clarifications

### Session 2026-04-23

- Q: Should repair rebuild every index from a clean slate by default? -> A: Verify and repair diffs first; clean-slate only when explicitly scoped.
- Q: Does P1 block on full relationship GraphRAG modes? -> A: P1 must rebuild/report graph coverage; relationship query modes land in P2.
- Q: What should pass live evals when no expected cases exist for a required domain? -> A: Mark eval readiness degraded, never passing.
- Q: When can optional runtimes or stores become defaults? -> A: Only after baseline comparison, rollback proof, and local-first/agent parity gates pass.
- Q: How should paths appear in reports and traces? -> A: Absolute paths only on operator preflight/report surfaces; fingerprints elsewhere.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Make RAG Health Repairable (Priority: P1)

As a Fulcrum operator, I need one repair path that makes live memory, code, vector, graph, and provenance indexes healthy from canonical sources so that I can trust recall after drift, interruption, or model changes.

**Why this priority**: The roadmap identifies degraded live indexes as the main blocker to a 10/10 RAG system. Quality expansion is unreliable until derived state can be repaired and verified.

**Independent Test**: Can be tested by starting with a workspace whose derived indexes are missing, stale, or inconsistent, requesting a repair plan and execution, and confirming the final health report proves all required domains are current or explicitly out of scope.

**Acceptance Scenarios**:

1. **Given** a workspace with healthy canonical sources but degraded derived state, **When** an operator requests a repair plan, **Then** the system reports exact domains, counts, expected mutations, required approvals, and executable next actions without changing state.
2. **Given** the operator executes the repair, **When** repair completes, **Then** the system reports memory, code, vector, graph, and provenance coverage as healthy or returns a failed/degraded status with actionable failed domains and retry instructions.
3. **Given** any repair stage cannot prove coverage or freshness, **When** verification runs, **Then** the system does not declare the workspace healthy and preserves enough evidence to diagnose the failed stage.
4. **Given** a destructive or expensive repair is requested, **When** scope or runtime profile is missing or unsafe, **Then** the system fails before mutation and reports the profile and paths that must be corrected.

---

### User Story 2 - Search One Context Surface (Priority: P1)

As an agent or developer, I need one recall surface that searches memory, files, code, and graph evidence together so that I do not have to know which lower-level search tool contains the answer.

**Why this priority**: Split recall surfaces force agents to guess between memory recall and code search, causing missed evidence and inconsistent context.

**Independent Test**: Can be tested by asking one query whose best evidence spans a memory decision, a code symbol, and a file chunk, then confirming the response includes typed results, source diversity, and line/source provenance from every relevant domain.

**Acceptance Scenarios**:

1. **Given** a query with likely memory and code evidence, **When** unified context search runs, **Then** results include typed memory, code, file, graph, and task evidence when present.
2. **Given** the same query is answerable by both exact keywords and semantic matches, **When** results are ranked, **Then** lexical, semantic, metadata, freshness, and graph signals are combined without hiding which signals contributed.
3. **Given** duplicate or near-duplicate results come from the same source, **When** context is packed, **Then** the output preserves the strongest evidence while maintaining source diversity and line/source references.
4. **Given** a compatibility caller still uses focused memory or code search, **When** that focused search runs, **Then** the focused tool still works while the unified surface remains the recommended agent entry point.

---

### User Story 3 - Upgrade Code RAG To First-Class Evidence (Priority: P1)

As a developer, I need code retrieval that understands paths, symbols, dependencies, semantic intent, and exact line ranges so that code search can answer implementation questions instead of returning only keyword matches.

**Why this priority**: The roadmap finds code search still lacks dense retrieval and broader symbol/dependency awareness, which blocks high-quality code RAG.

**Independent Test**: Can be tested by asking natural-language and symbol-specific questions across changed code and confirming results include exact path, symbol, dependency, semantic, and line-range evidence.

**Acceptance Scenarios**:

1. **Given** a natural-language implementation question, **When** code RAG searches, **Then** it can return relevant code chunks even when the exact query words do not appear in the code.
2. **Given** a query names a symbol, file path, package, or dependency, **When** code RAG searches, **Then** those structured hints influence candidate selection and explanation.
3. **Given** code cannot be parsed or indexed, **When** health and search explanations are requested, **Then** the affected file is reported with an explicit failure state instead of silently reducing coverage.
4. **Given** a returned code result is used as evidence, **When** it is displayed to an agent or operator, **Then** it includes stable file identity, line range, symbol context, freshness, and provenance class.

---

### User Story 4 - Make Graph Evidence Operational (Priority: P2)

As a maintainer, I need relationship-aware recall over tasks, decisions, files, symbols, errors, fixes, and memory entities so that Fulcrum can answer "how is this connected?" questions with cited evidence.

**Why this priority**: Graph retrieval is part of the target architecture but current live graph coverage is empty. Relationship recall should be rebuilt, measured, and explainable.

**Independent Test**: Can be tested by rebuilding graph coverage from a fixture or live workspace, asking a relationship question, and confirming returned evidence includes graph entities, edges, source references, and graph contribution in the explanation.

**Acceptance Scenarios**:

1. **Given** memory, task, file, and symbol sources contain relationship evidence, **When** graph rebuild runs, **Then** graph coverage reports nodes and edges by domain and freshness.
2. **Given** a query asks for dependency, decision, or failure relationships, **When** graph-aware recall runs, **Then** the answerable context includes relevant connected evidence and source references.
3. **Given** graph coverage is missing or stale, **When** health or unified search runs, **Then** graph contribution is marked unavailable or stale rather than silently ignored.
4. **Given** graph expansion changes ranking, **When** explain output is requested, **Then** the output identifies the graph entities/edges that contributed.

---

### User Story 5 - Gate Quality With Live Evals And Observability (Priority: P2)

As a maintainer, I need deterministic fixture evals plus live corpus evals and query traces so that rebuilds and retrieval changes cannot be called successful while recall quality is degraded.

**Why this priority**: The roadmap shows fixture evals can pass while live vectors and graph are empty. 10/10 requires quality gates, coverage gates, and explainable traces.

**Independent Test**: Can be tested by running evals against fixture and live corpora, intentionally degrading one index domain, and confirming the relevant coverage or retrieval-quality gate fails with a clear reason.

**Acceptance Scenarios**:

1. **Given** fixture evals run, **When** expected evidence, ranking, grounding, provenance, or parity breaks, **Then** the eval suite fails deterministically.
2. **Given** live corpus evals run after rebuild, **When** live vector or graph coverage is empty or stale, **Then** the suite fails even if fixture evals pass.
3. **Given** a query is executed with explanation enabled, **When** trace output is requested, **Then** it includes candidate counts, stage ranks/scores, fusion/rerank details, latency, provider/model/device truth, freshness, and provenance.
4. **Given** a change touches RAG lifecycle, memory, code search, embeddings, graph, or eval fixtures, **When** quality gates run, **Then** the relevant RAG evals and health checks must pass before the change is accepted.

---

### User Story 6 - Choose Future Runtime Upgrades Safely (Priority: P3)

As a project maintainer, I need adapter boundaries and decision gates for future indexing, model-serving, vector-store, and graph upgrades so that Fulcrum can improve RAG quality without rewriting the control plane or losing local-first guarantees.

**Why this priority**: The roadmap recommends stabilizing the current system first, then considering specialized runtimes or stores only when quality gates prove they are needed.

**Independent Test**: Can be tested by reviewing the plan, contracts, and acceptance gates for an optional runtime/store experiment and confirming the experiment can be enabled, evaluated, rolled back, and compared without changing canonical data ownership.

**Acceptance Scenarios**:

1. **Given** an optional runtime or store is proposed, **When** the decision gate is evaluated, **Then** the system requires baseline quality metrics, rollback path, local-first operation, and agent/tool parity before adoption.
2. **Given** an optional runtime is unavailable, **When** core recall and repair run, **Then** the stable baseline remains usable and reports that the optional path is disabled.
3. **Given** an optional runtime changes quality or latency, **When** evals compare it to the baseline, **Then** the comparison records recall quality, grounding, provenance, latency, device use, and operational risk.

### Edge Cases

- Canonical sources exist but all derived indexes are empty.
- Canonical sources change during repair, rebuild, or eval.
- Vector rows exist without matching freshness or metadata records.
- Model, provider, device, or dimensions requested by a job differ from the actual runtime used.
- Explicit accelerator/device requirement cannot be satisfied.
- Automatic fallback occurs during embedding, reranking, or recall.
- Code file cannot be parsed, has moved, or has stale chunks with line ranges from an old version.
- A unified query returns too many results from one file, memory page, or repeated source.
- Graph rebuild succeeds for memory but fails for code relationships, or the reverse.
- Fixture evals pass but live corpus coverage is degraded.
- Live corpus evals have zero expected cases for a domain.
- A repair command is run in a test or review profile that resolves to installed/operator data.
- Optional runtime/store experiment fails, is unavailable, or produces worse quality than baseline.
- Search or eval output could expose secret-bearing config, raw environment values, or private paths beyond the intended operator surface.

### Scope Boundaries

- This feature delivers the roadmap as incremental Fulcrum RAG capability, not a control-plane rewrite.
- P1 delivery is limited to making the current local RAG system repairable, truthful, unified, and evaluable.
- Optional runtime/store work is limited to adapter boundaries, experiments, and adoption gates until baseline quality gates prove a need to switch defaults.
- Generated answer UI, hosted multi-tenant search, and remote managed services are out of scope unless later specs explicitly add them.
- Full database or vault wipe is not part of normal RAG repair; normal repair only touches allowlisted derived RAG state inside the active runtime profile.
- Normal RAG repair verifies and applies targeted improvements to derived state by default; clean-slate rebuild is available only when explicitly scoped and preflighted.

### Terminology

- **Hybrid retrieval**: Retrieval that combines lexical, semantic, metadata, freshness, and graph signals before final ranking.
- **Multi-stage retrieval**: Broad inexpensive candidate recall followed by bounded fusion, diversification, reranking, and context packing.
- **Contextual index text**: Retrieval-only text that adds source context to an evidence chunk without changing canonical raw content.
- **Live corpus eval**: Evaluation against actual workspace sources and derived indexes, distinct from deterministic fixture evals.
- **Runtime truth**: Requested and actual provider/model/device/dimensions plus fallback policy outcome.
- **Healthy RAG state**: Required domains are current, fresh, provenance-backed, and covered by passing eval readiness checks.

## Requirements *(mandatory)*

### Functional Requirements

#### Repair And Coverage

- **FR-001**: System MUST provide one operator-facing repair plan for memory, file, code, vector, graph, provenance, and eval-readiness domains.
- **FR-002**: System MUST provide dry-run, execute, verify, status, report, resume, cancel, and retry surfaces for long-running RAG repair and rebuild work.
- **FR-003**: System MUST show exact mutation scope and active runtime profile before any destructive or expensive repair begins.
- **FR-004**: System MUST fail closed before mutation when runtime profile, workspace scope, or profile path isolation is missing, ambiguous, or unsafe.
- **FR-005**: System MUST verify that every recallable memory, file chunk, and code chunk has explicit current, stale, skipped, failed, or intentionally-unembedded vector coverage state.
- **FR-006**: System MUST verify that vector rows and vector metadata agree by source identity, content hash, model, provider, device, dimensions, freshness, and status.
- **FR-007**: System MUST verify graph coverage by domain and report missing or stale nodes/edges before the workspace is marked RAG-healthy.
- **FR-008**: System MUST record repair and rebuild reports with counts, timings, warnings, failures, retryability, profile identity, non-secret path fingerprints, and final health status.
- **FR-009**: System MUST avoid declaring a repair successful when any required coverage or freshness check remains degraded.
- **FR-045**: System MUST classify RAG health as `healthy`, `degraded`, `failed`, or `out_of_scope`, with every non-healthy required domain tied to a reason and next action.
- **FR-051**: System MUST default normal repair to verify-and-fix derived-state differences from canonical sources; clean-slate rebuild requires explicit scope, preflight output, and profile safety checks.

#### Unified Retrieval

- **FR-010**: System MUST expose one unified context-search surface over memory, file, code, graph, task, and decision evidence.
- **FR-011**: System MUST keep focused memory and code search surfaces available for compatibility while identifying the unified context-search surface as the agent-preferred entry point.
- **FR-012**: System MUST return typed result records for memory, code chunk, file chunk, graph entity/edge, task, decision, and legacy/unbacked evidence.
- **FR-013**: System MUST combine lexical, semantic, metadata, freshness, and graph signals when available and report which stages contributed to each result.
- **FR-014**: System MUST diversify packed context so one repeated source cannot crowd out other relevant evidence unless the query explicitly targets that source.
- **FR-015**: System MUST return stable source references for every result, including raw source ID, curated page ID, file path, line range, symbol path, graph entity/edge ID, task/run ID, or declared legacy class where applicable.
- **FR-016**: System MUST preserve canonical raw content while allowing separate contextual index text for retrieval.
- **FR-017**: System MUST explain when a stage was unavailable, skipped, stale, degraded, or intentionally disabled.
- **FR-049**: System MUST bound expensive reranking or expansion stages by documented candidate limits and expose those limits in explain output.

#### Code RAG

- **FR-018**: System MUST support code retrieval by natural-language intent, exact path, symbol, package/module, language, dependency, and recency hints.
- **FR-019**: System MUST include semantic code-chunk retrieval in code search when current code vectors are available.
- **FR-020**: System MUST include file identity, content hash, language, symbol context, line range, parse/index status, vector status, and provenance for every searchable code chunk.
- **FR-021**: System MUST report parse or indexing failures as explicit file-level states with retry guidance.
- **FR-022**: System MUST keep batch and incremental code indexing contracts equivalent for file identity, chunk identity, line attribution, failure state, and freshness.
- **FR-023**: System MUST expose code search explanation fields for stage rank, stage score, fusion/rerank score, source freshness, and source diversity decisions.

#### Graph Evidence

- **FR-024**: System MUST rebuild graph evidence from memory entities, tasks, decisions, errors, fixes, files, symbols, imports, calls, and source references where those sources exist.
- **FR-025**: System MUST expose graph nodes and edges with source references, confidence/freshness, domain, and relationship type.
- **FR-026**: System MUST support relationship-focused query modes that can use local neighborhood, global summary, and drift-style expansion when those graph assets are available.
- **FR-027**: System MUST report graph contribution in unified recall explanations whenever graph expansion changes candidates, ranking, or context packing.
- **FR-028**: System MUST keep graph failures from marking the whole RAG system healthy unless graph was explicitly out of scope for that profile or command.
- **FR-052**: System MUST include graph rebuild and coverage reporting in P1 health/repair work while allowing advanced relationship query modes to ship separately in P2.

#### Evals, Observability, And Quality Gates

- **FR-029**: System MUST provide deterministic fixture evals for recall relevance, ranking, provenance, graph expansion, code line attribution, rebuild parity, and repair reports.
- **FR-030**: System MUST provide live corpus evals that validate actual workspace coverage and expected source retrieval after repair or rebuild.
- **FR-031**: System MUST measure retrieval relevance, ranking quality, context precision, context recall, groundedness/provenance, answer correctness when answers are generated, latency, freshness, and coverage.
- **FR-032**: System MUST fail live evals when required vector or graph coverage is empty, stale, or inconsistent.
- **FR-033**: System MUST persist query traces for explain-enabled runs with stage counts, scores, fusion/rerank data, latency, provider/model/device truth, freshness, and provenance.
- **FR-034**: System MUST provide human-readable and machine-readable health, eval, repair, query trace, and job outputs.
- **FR-035**: System MUST run default RAG quality gates for changes touching RAG lifecycle, memory, code search, embeddings, graph, eval fixtures, or unified retrieval contracts.
- **FR-036**: System MUST keep model-heavy, accelerator-heavy, and live-corpus-heavy evals opt-in unless explicitly requested by the operator or CI gate.
- **FR-046**: System MUST treat a required live-eval domain with zero expected cases as `degraded` eval readiness, not as a passing result.
- **FR-050**: System MUST define pass/fail thresholds for each eval suite before the suite runs, including ranking, grounding/provenance, coverage, and latency thresholds where applicable.

#### Runtime Truth, Safety, And Future Upgrades

- **FR-037**: System MUST distinguish requested provider/model/device/dimensions from actual provider/model/device/dimensions in jobs, traces, health, reports, and eval artifacts.
- **FR-038**: System MUST fail closed when an explicit provider, model, or device requirement cannot be satisfied.
- **FR-039**: System MUST permit automatic fallback only when fallback is allowed by configuration and the fallback reason is visible in job, health, report, and trace output.
- **FR-040**: System MUST prevent secrets, credentials, raw environment values, and unredacted provider configuration from appearing in logs, reports, traces, eval artifacts, or memory.
- **FR-041**: System MUST expose destructive, expensive, and repair operations through audited CLI and agent-tool surfaces with structured inputs and outputs.
- **FR-042**: System MUST define adapter boundaries for optional future indexing, model-serving, vector-store, and graph-store upgrades without moving canonical task/run/policy/memory ownership out of Fulcrum.
- **FR-043**: System MUST require quality, latency, rollback, local-first, and operational-risk comparison before an optional runtime/store becomes default.
- **FR-044**: System MUST keep the current local baseline usable when optional runtime/store paths are disabled, unavailable, or worse than baseline.
- **FR-047**: System MUST authorize destructive, expensive, and repair execution by actor capability and workspace/project scope before mutation.
- **FR-048**: System MUST expose absolute profile paths only on explicit operator-facing preflight/report surfaces and use non-secret path fingerprints on agent-facing traces, eval artifacts, and memory.

### Key Entities *(include if feature involves data)*

- **RAG Repair Plan**: Non-mutating operator plan listing domains, counts, profile, mutation scope, prerequisites, commands, and expected health outcomes.
- **RAG Repair Run**: Long-running execution that repairs or rebuilds derived memory, file, code, vector, graph, and eval-readiness state.
- **RAG Health Report**: Consolidated status for coverage, freshness, provenance, graph, vector metadata, code index, repair state, and recommended actions.
- **RAG Health Status**: One of `healthy`, `degraded`, `failed`, or `out_of_scope`, with required domains unable to pass recorded as degraded or failed.
- **Coverage Record**: Source-level status describing current, stale, skipped, failed, or intentionally-unembedded coverage for vectors, graph, text search, and code index domains.
- **Unified Context Query**: Agent or operator request over memory, file, code, graph, task, and decision sources.
- **Typed Context Result**: Search result with domain type, rank, score, source references, provenance class, freshness, and explanation metadata.
- **Context Pack**: Source-diverse set of results assembled for an agent or answer workflow, preserving citations and line/source references.
- **Code Evidence Unit**: Searchable code chunk or symbol record with file identity, line range, language, symbol context, content hash, and index/vector status.
- **Graph Evidence Unit**: Entity, edge, or summary record linking tasks, decisions, files, symbols, errors, fixes, memory entities, and source IDs.
- **RAG Eval Case**: Fixture or live query with expected evidence, ranking, provenance, graph, code-line, and coverage assertions.
- **RAG Eval Run**: Execution record for fixture or live evals with metric values, failures, traces, and pass/fail gate status.
- **RAG Query Trace**: Explain-enabled query record showing stage candidates, ranks, scores, fusion, reranking, latency, runtime truth, freshness, and provenance.
- **Runtime Truth Record**: Requested and actual provider/model/device/dimensions plus fallback reason and policy outcome.
- **Optional Runtime Experiment**: Controlled trial of future indexer, model-serving, vector-store, or graph-store paths with baseline comparison and rollback criteria.
- **Runtime Data Profile**: Isolated execution profile for installed/operator, dev/review, or test data roots.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A workspace that starts with missing live vectors and graph coverage can produce a repair plan and a final health report that either reaches healthy status or identifies every remaining degraded domain with retryable actions.
- **SC-002**: 100% of current recallable memory, file, and code evidence has explicit coverage state after repair verification.
- **SC-003**: 100% of search results from the unified context surface include a typed domain, provenance class, source reference, freshness state, and explanation status.
- **SC-004**: Unified context search can retrieve relevant evidence from at least three distinct source domains in the top 10 results for fixture queries that require cross-domain evidence.
- **SC-005**: Code RAG fixture queries return expected file and line-range evidence in the top 5 results for natural-language, symbol, and path-hint queries.
- **SC-006**: Live corpus evals fail when vector or graph coverage is intentionally removed from a workspace that requires those domains.
- **SC-007**: Default RAG gates run for representative RAG-touching changes and skip representative unrelated changes without manual selection.
- **SC-008**: Explain-enabled query traces expose candidate counts, stage scores, fusion/rerank decisions, latency, runtime truth, freshness, and provenance for all stages that ran.
- **SC-009**: Explicit device/provider/model mismatch tests fail closed, while automatic fallback tests pass only when fallback reason is visible in structured output.
- **SC-010**: Optional runtime/store experiments can be compared against the baseline with recall quality, grounding/provenance, latency, device use, and rollback status before adoption.
- **SC-011**: Required live-eval domains with zero expected cases produce degraded eval readiness instead of a passing eval run.
- **SC-012**: Eval reports include retrieval recall@K, MRR or nDCG, context precision, context recall, groundedness/provenance, citation accuracy, latency p50/p95, and coverage for suites where those measures apply.

## Assumptions

- The prior RAG lifecycle hardening work remains the prerequisite foundation for destructive safety, staged rebuild behavior, runtime data profile isolation, and durable job state.
- L0 raw sources remain canonical; L1 pages, code/file chunks, vectors, graphs, traces, and eval artifacts are derived or operational state.
- The first implementation target is the existing local-first Fulcrum workspace; future runtime/store options are evaluated behind adapters only after baseline gates exist.
- Machine-readable CLI and agent-tool parity are required for operator workflows that agents need to invoke.
- Fixture evals must remain deterministic and cheap enough for targeted gates; live corpus and accelerator-heavy evals may be opt-in by default.
- No secret-bearing provider configuration is needed in reports, traces, eval artifacts, or memory to prove runtime truth.
