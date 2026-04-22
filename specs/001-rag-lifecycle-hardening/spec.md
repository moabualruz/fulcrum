# Feature Specification: Fulcrum RAG Lifecycle Hardening

**Feature Branch**: `[001-rag-lifecycle-hardening]`  
**Created**: 2026-04-22  
**Status**: Draft  
**Input**: User description: "Start Spec Kit workflow from docs/audit/2026-04-22-fulcrum-rag-capability-report.md findings."

## Clarifications

### Session 2026-04-22

- Q: Which actors may execute destructive RAG maintenance? → A: Human operator, `chief_of_staff`, `memory_curator`, and any role with write-code/edit-file capability.
- Q: How should embedding jobs behave when some items fail? → A: Complete as degraded with retryable failed items.
- Q: What failure-atomicity guarantee should full RAG rebuilds provide? → A: Build in staging/quarantine and promote only after all checks pass.
- Q: Which changes must run default golden RAG eval gates in CI? → A: Only changes touching RAG lifecycle, memory, code search, embeddings, graph, or eval fixtures.
- Q: What happens if canonical sources change while a staged full rebuild is running? → A: Snapshot inputs at rebuild start and promote only if the snapshot is still current.
- Q: How should rebuild, review, development, and test data be isolated before destructive RAG maintenance continues? → A: Use three explicit runtime data profiles with separate DB, vault, graph, vector, and artifact roots: installed/operator data, dev/review data, and ephemeral test data. Destructive maintenance must be profile-scoped, path-visible, and fail closed when profile boundaries are missing or unsafe.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Rebuild Trusted Search State (Priority: P1)

As a Fulcrum operator, I need one authoritative reset and rebuild workflow for all derived search state so that agents and humans can trust memory recall and code search after maintenance, recovery, or model changes.

**Why this priority**: The audit's highest-risk finding is that reset and rebuild behavior can leave mixed, stale, or partial state. This must be reliable before new RAG capabilities are added.

**Independent Test**: Can be tested by starting from a workspace with existing vault and project files, running the full rebuild workflow, and confirming the final report proves parity across raw sources, curated memory, text search, code files, code chunks, vectors, and graph coverage.

**Acceptance Scenarios**:

1. **Given** a workspace with existing raw vault files, curated memory files, project files, and stale derived search state, **When** an operator requests a full derived reset and rebuild, **Then** the system clears and rebuilds candidate derived state from canonical sources, promotes the candidate only after verification, and returns a machine-readable report with counts and pass/fail checks.
2. **Given** any parity check fails during rebuild, **When** the workflow reaches verification, **Then** the workflow reports the failing check, exits unsuccessfully, leaves the current served derived state unchanged, and quarantines or discards the unpromoted candidate state with enough report detail for the operator to identify the affected domain.
3. **Given** an operator asks only for a dry run or plan, **When** the workflow evaluates scope, **Then** it reports what would be cleared and rebuilt without mutating state.
4. **Given** text-search indexes are rebuilt from source tables, **When** verification runs, **Then** keyword-search integrity is checked and any inconsistency is reported as a failed rebuild stage.
5. **Given** an operator, review agent, or test suite requests a destructive rebuild, **When** the runtime data profile is missing, ambiguous, or resolves to an unsafe shared path, **Then** the workflow fails before mutation and reports the resolved profile, DB, vault, graph, vector, and artifact paths that must be corrected.
6. **Given** dev/review or test rebuilds run against their own data profiles, **When** they clear and rebuild derived state, **Then** installed/operator DB and vault contents remain unchanged and the rebuild report proves which profile was mutated.

---

### User Story 2 - Resume and Inspect Embedding Work (Priority: P1)

As a Fulcrum operator, I need embedding work to be durable, resumable, and model-aware so large corpora can be processed without babysitting or losing track of failed, skipped, stale, or mixed-model rows.

**Why this priority**: Embedding instability blocks reliable vector recall, especially after out-of-memory events, model changes, or interrupted jobs.

**Independent Test**: Can be tested by starting an embedding job, interrupting it after partial progress, resuming it, and verifying that completed, failed, skipped, stale, and pending items are accurately reported by job and by source row.

**Acceptance Scenarios**:

1. **Given** a large corpus embedding job is interrupted, **When** the operator resumes the job, **Then** already completed rows are not reprocessed unless stale, pending rows continue, and failures remain inspectable.
2. **Given** a row cannot be embedded, **When** the embedding job records the failure, **Then** the row keeps its source identity, content hash, model intent, error type, error message, attempt count, and retry eligibility.
3. **Given** an embedding model, provider, device, dimensions, or content hash changes, **When** the operator checks coverage, **Then** stale vectors are reported separately from current vectors.
4. **Given** the system reduces batch size or splits content to recover from an embedding failure, **When** the job continues, **Then** the recovery decision is recorded with source item identity and does not hide partial work.

---

### User Story 3 - Search With Explainable Trust Signals (Priority: P1)

As an agent using Fulcrum recall and code search, I need each result to explain how it was retrieved, ranked, and backed by source evidence so I can decide whether to trust and cite it.

**Why this priority**: The audit found that ranking, fallback, provenance, and retrieval stages exist in pieces but are not consistently visible at runtime.

**Independent Test**: Can be tested by running recall and code-search queries with explanation enabled and verifying every returned result includes retrieval stages, scores, provenance class, source links, supersession status, and runtime provider/device details where applicable.

**Acceptance Scenarios**:

1. **Given** recall explanation is requested, **When** results are returned, **Then** each result includes lexical, vector, reranking, graph, freshness, confidence, supersession, and provenance fields when those stages apply.
2. **Given** a configured accelerator is unavailable in automatic mode, **When** search falls back to another device, **Then** the explanation reports the actual device used and the fallback reason.
3. **Given** an explicit device requirement cannot be satisfied, **When** retrieval or embedding starts, **Then** the operation fails closed instead of silently using another device.
4. **Given** a result represents memory, code, generated content, or legacy content, **When** explanation is enabled, **Then** the result exposes a consistent provenance class and source reference shape.

---

### User Story 4 - Keep Code Index State Consistent (Priority: P1)

As a developer relying on Fulcrum code search, I need batch and incremental indexing to produce identical file and chunk state so line attribution, file identity, and parse failures are trustworthy.

**Why this priority**: The audit found two code indexing paths that can leave chunks without file records or inconsistent file-level status.

**Independent Test**: Can be tested by indexing the same project through batch and incremental flows and verifying that each code chunk has a valid file identity, each file record has an accurate chunk count or explicit failure state, and search results include stable path and line range.

**Acceptance Scenarios**:

1. **Given** a project file is indexed through any supported path, **When** code search state is inspected, **Then** every searchable chunk resolves to a file record with matching path, hash, language, and chunk count.
2. **Given** a file cannot be parsed, **When** indexing completes, **Then** the file is marked with an explicit failure state and does not leave ambiguous partial indexed rows.
3. **Given** a file changes, **When** incremental indexing runs, **Then** stale chunks for that file are replaced consistently and search results point at current line ranges.

---

### User Story 5 - Diagnose RAG Health Without Manual Queries (Priority: P2)

As an operator, I need one health surface for memory, code, vector, graph, failures, and freshness so I can decide what maintenance action is required without manually inspecting storage.

**Why this priority**: Operators currently need logs and manual queries to answer basic health questions, which makes recovery slow and error-prone.

**Independent Test**: Can be tested by running the health report against healthy, stale, partially rebuilt, and failed workspaces and verifying that each condition is reflected in clear machine-readable and human-readable output.

**Acceptance Scenarios**:

1. **Given** a workspace with mismatched raw files and raw-source rows, **When** the operator runs a RAG health report, **Then** the mismatch is reported with expected and actual counts.
2. **Given** vector rows were produced by different models or devices, **When** health is checked, **Then** coverage is grouped by model, provider, device, dimensions, freshness, and stale status.
3. **Given** embedding failures or split retries occurred, **When** health is checked, **Then** failures are grouped by reason and linked to retryable job items.
4. **Given** graph nodes or edges are missing after rebuild, **When** health is checked, **Then** graph coverage reports the missing domains.

---

### User Story 6 - Guard Retrieval Quality With Evals (Priority: P2)

As a maintainer, I need a standing RAG evaluation suite so reset, rebuild, embedding, reranking, graph, and provenance changes cannot regress retrieval quality while command-level tests still pass.

**Why this priority**: The audit found that indexing success can be mistaken for retrieval quality.

**Independent Test**: Can be tested by running the eval suite against a checked-in fixture corpus and confirming it fails when expected memory IDs, code chunks, provenance links, ranking order, or rebuild parity are wrong.

**Acceptance Scenarios**:

1. **Given** a known memory query has expected results, **When** the eval suite runs, **Then** it verifies the expected memory results are returned and ranked within acceptable bounds.
2. **Given** a lexical distractor competes with a semantically correct result, **When** reranking is enabled, **Then** the eval verifies the distractor is demoted.
3. **Given** a stale claim has been superseded, **When** recall runs in eval, **Then** the stale claim is excluded or clearly marked according to the recall contract.
4. **Given** a full rebuild starts from empty derived state, **When** eval completes, **Then** it verifies index parity before retrieval assertions run.
5. **Given** an eval case includes expected evidence, **When** recall returns an answerable result, **Then** the eval verifies retrieval relevance, source grounding, and provenance trace separately from answer correctness.
6. **Given** a change touches RAG lifecycle, memory, code search, embeddings, graph, or eval fixtures, **When** CI evaluates the change, **Then** default golden RAG eval gates run and must pass before the change is accepted.

### Edge Cases

- Rebuild requested when the workspace has zero canonical files: report zero scope clearly and require explicit allow-empty execution for mutating work.
- Destructive rebuild requested without an explicit runtime data profile: fail closed before mutation.
- Test or review profile resolves to the installed/operator DB, vault, graph, vector, or artifact root: fail closed before mutation.
- Installed/operator profile rebuild requested without backup and profile confirmation: fail closed before mutation.
- Full database wipe requested when a profile-scoped derived-state clear would suffice: require explicit backup, profile confirmation, and machine-readable wipe scope before any mutation.
- Help, status, plan, dry-run, or explain-only commands must never mutate workspace state.
- Long-running jobs must remain inspectable after process interruption, terminal close, or host restart.
- Partial model migration must report mixed-vector coverage instead of presenting the index as homogeneous.
- Content that exceeds model limits must be represented as explicit chunks with stable source provenance, never as a silent partial embedding.
- Text-search index and backing data drift must be detected before the workspace is marked healthy.
- Accelerator dependency mismatch, unsupported provider, or unavailable runtime must produce explicit state rather than a silent downgrade when configuration is explicit.
- Legacy or unbacked memory must remain searchable only with visible provenance class and confidence limits.
- Duplicate requests for cancellation, resume, or retry must be idempotent and produce current job state.
- Embedding jobs with failed items must not stay indefinitely running solely because item failures exist; they complete as degraded and expose retry actions.
- Failed full rebuild candidates must not be promoted or served as current search state.
- Full rebuild candidates built from stale canonical-source snapshots must not be promoted.
- Graph rebuild failures must not mark the full RAG state healthy.

## Requirements *(mandatory)*

### Functional Requirements

#### Derived Lifecycle

- **FR-001**: System MUST provide one authoritative full reset and rebuild workflow for derived RAG state.
- **FR-002**: System MUST support plan, dry-run, execute, and report modes for destructive or expensive RAG maintenance work.
- **FR-003**: System MUST print and persist exact mutation scope before clearing, rebuilding, embedding, or graph-building derived state.
- **FR-004**: System MUST rebuild raw-source, curated-memory, text-search, code-file, code-chunk, vector, and graph coverage from canonical workspace sources.
- **FR-005**: System MUST verify row-count and relationship parity after rebuild and fail the workflow when required parity checks fail.
- **FR-006**: System MUST write a machine-readable rebuild report that includes scope, completed stages, counts, failures, warnings, timings, and parity results.
- **FR-045**: System MUST perform full RAG rebuilds in staged or quarantined candidate state and promote the candidate to served current state only after all required rebuild and parity checks pass.
- **FR-047**: System MUST snapshot canonical source identities and content hashes at full rebuild start and MUST revalidate that snapshot before promotion; stale snapshots MUST fail promotion without changing served derived state.
- **FR-033**: System MUST guarantee that help, status, and explain-only operations do not mutate state.
- **FR-034**: System MUST provide machine-readable output for reset, rebuild, embedding, health, explanation, job, and eval operations.
- **FR-035**: System MUST verify text-search index integrity against backing content during rebuild and health checks where the storage engine supports that validation.

#### Embedding And Vector Coverage

- **FR-007**: System MUST provide separate memory embedding scopes for all recallable memories, curated pages only, and code chunks.
- **FR-008**: System MUST show preflight scan counts before embedding starts and treat unexpected zero scope as warning or failure unless explicitly allowed.
- **FR-009**: System MUST represent embedding work as durable jobs with inspectable job items.
- **FR-010**: System MUST record each embedding job item's source identity, source table or domain, content hash, model, provider, device, dimensions, status, attempts, timestamps, and error state.
- **FR-011**: System MUST allow embedding jobs to resume, cancel, inspect status, and retry only failed or stale items.
- **FR-012**: System MUST expose vector coverage by source domain, model, provider, device, dimensions, content hash freshness, and error state.
- **FR-013**: System MUST mark stale vectors when content hash, model, provider, device requirement, or dimensions no longer match the intended index configuration.
- **FR-014**: System MUST split oversized content before embedding using stable chunk identities and source provenance.
- **FR-036**: System MUST record adaptive embedding recovery actions, including batch-size reductions and content splits, as inspectable job events.
- **FR-037**: System MUST distinguish requested runtime device from actual runtime device in embedding, reranking, recall explanation, and health output.

#### Code Indexing

- **FR-015**: System MUST ensure every searchable code chunk resolves to a file-level identity unless explicitly classified and reported as legacy.
- **FR-016**: System MUST ensure batch project indexing and incremental file indexing produce the same file, chunk, failure, and attribution contracts.
- **FR-017**: System MUST record parse and indexing failures as first-class file states instead of leaving ambiguous partial index rows.
- **FR-018**: System MUST return path and line range for every code-search result.

#### Explainability, Provenance, And Graph

- **FR-019**: System MUST provide a stable explanation schema for memory recall and code search.
- **FR-020**: System MUST include retrieval stages, stage ranks, stage scores, provider, model, device, fallback reason, latency, freshness, confidence, supersession state, and provenance in explanations when applicable.
- **FR-021**: System MUST fail closed when an explicit runtime device requirement cannot be satisfied.
- **FR-022**: System MUST allow automatic runtime fallback only when the fallback is recorded and exposed in job, recall, or health output.
- **FR-023**: System MUST assign every memory result one provenance class from raw-backed, curated-backed, code-backed, legacy-unbacked, or generated.
- **FR-024**: System MUST expose source links and confidence in a consistent shape for all recall result types.
- **FR-025**: System MUST detect broken curated-memory source references and unresolved raw-source links.
- **FR-026**: System MUST rebuild and report graph coverage as part of full RAG lifecycle maintenance.
- **FR-027**: System MUST expose graph contribution in recall explanations when graph expansion affects results.

#### Health, Jobs, And Evals

- **FR-028**: System MUST provide a RAG health report covering raw-source coverage, curated-memory coverage, text-search parity, code-file and code-chunk parity, vector coverage, embedding failures, stale embeddings, and graph coverage.
- **FR-029**: System MUST provide first-class job status, logs, cancellation, and resume surfaces for long-running RAG work.
- **FR-044**: System MUST complete embedding jobs as degraded when one or more items fail while preserving retryable failed-item state; completed current items MUST NOT be reprocessed by default during failed-item retry.
- **FR-030**: System MUST include a checked-in golden evaluation corpus for memory recall, code search, hybrid recall, reranking, provenance trace, graph expansion, and reset/rebuild parity.
- **FR-031**: System MUST fail retrieval-quality gates when expected eval results, ranking bounds, provenance links, or parity checks regress.
- **FR-032**: System MUST allow an operator to run local evals immediately after a full reindex or rebuild.
- **FR-038**: System MUST group eval failures by retrieval relevance, ranking, answer correctness, grounding/provenance, graph expansion, and operational parity.
- **FR-039**: System MUST keep default evals deterministic and local-first, with model-heavy or accelerator-heavy checks opt-in.
- **FR-046**: System MUST run default golden RAG eval gates in CI for changes touching RAG lifecycle, memory, code search, embeddings, graph, or eval fixtures; unrelated changes MAY skip the gate.

#### Safety And Migration

- **FR-040**: System MUST gate destructive or expensive maintenance execution so only a human operator, `chief_of_staff`, `memory_curator`, or a role with write-code/edit-file capability may execute; every execution MUST include explicit workspace/project scope, actor authorization, and persisted audit events.
- **FR-041**: System MUST avoid writing secrets, credentials, raw environment values, or unredacted provider configuration into logs, reports, explanations, eval artifacts, or memory.
- **FR-042**: System MUST make required schema or data migrations idempotent, workspace-scoped, backward-compatible during rollout, and recoverable without manual database surgery.
- **FR-043**: System MUST allow P1 lifecycle hardening to ship independently of P2 quality-expansion work when lower-priority features are not required for parity or safety.
- **FR-048**: System MUST define explicit runtime data profiles for installed/operator, dev/review, and test execution, each with separate DB, vault, graph, vector, and artifact roots.
- **FR-049**: System MUST resolve and expose the active runtime data profile and absolute DB, vault, graph, vector, and artifact paths in preflight command output before any destructive or expensive RAG maintenance work starts.
- **FR-050**: System MUST fail closed when a dev/review or test profile resolves to installed/operator paths, shared global paths, or any path that would allow tests or reviews to mutate installed/operator data.
- **FR-051**: System MUST require profile confirmation and a restorable backup or snapshot before destructive maintenance mutates installed/operator profile data.
- **FR-052**: System MUST make test-profile DB and vault state ephemeral or explicitly disposable so automated tests can reset it without disturbing installed/operator or dev/review data.
- **FR-053**: System MUST include runtime data profile identity and non-secret path fingerprints in persisted rebuild reports, audit events, health output, and destructive-command structured errors.
- **FR-054**: System MUST clear only allowlisted profile-scoped derived RAG state during normal rebuilds; full DB or vault wipe requires a separate explicit wipe scope, backup confirmation, and installed/operator profile confirmation when applicable.

### Key Entities *(include if feature involves data)*

- **Rebuild Request**: Operator intent describing target domains, mode, scope, allow-empty behavior, and whether expensive derived stages should run.
- **Rebuild Report**: Durable result of a reset or rebuild, including scope, counts, parity checks, failures, warnings, timings, and artifact references.
- **Rebuild Input Snapshot**: Canonical-source identity and content-hash manifest captured at rebuild start and revalidated before candidate promotion.
- **Embedding Job**: Durable unit of embedding work with configuration, lifecycle state, progress, cancellation status, and summary counts.
- **Embedding Job Item**: Row-level unit of embedding work tied to one source item or source chunk, with status, attempts, error state, and freshness metadata.
- **Staged Rebuild Candidate**: Isolated derived state produced by a full rebuild before promotion, including status, verification results, failure details, and cleanup or quarantine disposition.
- **Embedding Model Record**: Declared embedding or reranking model identity, provider, dimensions, supported devices, and current intended configuration.
- **Vector Coverage Record**: Operational metadata that proves whether a source item has a current vector for the intended content hash, model, provider, device, and dimensions.
- **Code File Index Record**: File-level indexing state including path, content hash, language, chunk count, status, and failure reason when applicable.
- **Code Chunk Index Record**: Searchable code segment with stable file identity, line range, symbol context, content hash, and vector status when applicable.
- **Recall Explanation**: Machine-readable explanation of retrieval stages, scores, ranking changes, runtime details, confidence, freshness, supersession, and provenance.
- **Provenance Reference**: Link from a result or curated claim to raw evidence, code source, generated content, or legacy unbacked status.
- **Graph Coverage Report**: Counts and freshness status for graph nodes and edges produced from code, tasks, decisions, errors, and memory relationships.
- **RAG Health Report**: Consolidated health summary for all recall and code-search domains, including parity, stale state, failures, and recommended actions.
- **RAG Eval Case**: Fixture-backed query with expected results, ranking expectations, provenance expectations, and rebuild prerequisites.
- **Job Event**: Durable event attached to a long-running job, including progress updates, recovery actions, fallback decisions, cancellation, resume, and failure details.
- **Text Search Integrity Check**: Verification that keyword-search index content matches its backing source rows and can be safely trusted for recall.
- **Audit Event**: Workspace-scoped record of a destructive, expensive, or policy-sensitive RAG lifecycle operation, including actor, scope, mode, result, and report reference.
- **Runtime Data Profile**: Operator-selected execution context (`install`, `dev`, or `test`) that resolves to isolated DB, vault, graph, vector, and artifact roots.
- **Profile Path Manifest**: Machine-readable resolved path set and fingerprints for the active runtime data profile, included before mutation and persisted with reports/audit events.
- **Profile-Scoped Backup**: Restorable copy or snapshot of the active profile's mutable data roots captured before destructive installed/operator maintenance.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A full rebuild from empty derived state completes with a machine-readable report that verifies all required parity checks for a representative fixture workspace.
- **SC-002**: 100% of searchable code chunks created by supported indexing flows resolve to a valid file-level identity or are explicitly reported as legacy.
- **SC-003**: 100% of embedding results expose model, provider, device, dimensions, content hash, timestamp, and current/stale status.
- **SC-004**: An interrupted embedding job can resume without reprocessing completed current items and can retry failed items independently.
- **SC-005**: Recall and code-search explanation output is valid machine-readable data and includes required stage, score, provenance, and runtime fields for all applicable results.
- **SC-006**: Explicit device mismatch produces a failed operation with a clear reason in 100% of tested embedding and reranking paths.
- **SC-007**: Health reporting identifies raw-source mismatch, curated-memory mismatch, text-search parity failure, code parity failure, stale vector coverage, embedding failure, and graph coverage gap in fixture scenarios.
- **SC-008**: Golden evals fail when expected memory results, code chunks, provenance links, ranking order, or rebuild parity are intentionally broken.
- **SC-009**: Help, status, dry-run, plan, and explain-only operations perform zero state mutations in automated tests.
- **SC-010**: Operators can determine current RAG health and next required action from command output alone, without manual database queries, for all fixture failure modes.
- **SC-011**: Eval output identifies the failing retrieval stage or operational parity stage for every intentionally broken fixture case.
- **SC-012**: A workspace with text-search/backing-content drift is reported unhealthy before recall quality checks are allowed to pass.
- **SC-013**: An embedding job with intentional item failures reaches a degraded terminal state and can retry only those failed items.
- **SC-014**: A full rebuild with an intentional stage failure leaves the prior served derived state unchanged and does not expose the failed candidate through recall or code search.
- **SC-015**: CI runs default golden RAG eval gates for a representative RAG-related change and does not require those gates for an unrelated non-RAG change.
- **SC-016**: A full rebuild whose canonical source files or source rows change before promotion fails promotion, reports stale snapshot details, and leaves prior served derived state unchanged.
- **SC-017**: Destructive rebuild execution fails before mutation in 100% of tested cases where the active runtime data profile is missing, ambiguous, or resolves to an unsafe shared path.
- **SC-018**: Automated tests can reset the test-profile DB and vault in 100% of fixture runs while checksum or row-count sentinels prove installed/operator and dev/review profiles were not modified.
- **SC-019**: A dev/review-profile rebuild can clear and rebuild derived state while installed/operator profile path fingerprints and canonical data sentinels remain unchanged.
- **SC-020**: Installed/operator-profile destructive rebuild execution records a restorable backup reference, explicit profile confirmation, profile path manifest, and audit event in every tested execution.

## Assumptions

- Fulcrum remains local-first; remote providers may be explicit configuration choices but are not required for the base lifecycle.
- Canonical source material is limited to vault raw files, vault curated files, project files, and explicit configuration for this feature.
- Existing recall and code-search behavior should remain available while new lifecycle guarantees are added incrementally.
- Graph recall is in scope for coverage, explanation, and evals, but quality improvements beyond first-class lifecycle participation can be staged after P1 work.
- Operator-facing command names and exact JSON schemas may be refined during planning, provided the user-visible capabilities and machine-readable contracts remain intact.
- Online research notes for this specification are captured in `research.md`; planning should turn those source-backed decisions into technical contracts and task slices.
- Planning should slice delivery so P1 restores operational trust first: authoritative rebuild/reporting, embedding job durability, code-index parity, and explanation contracts. P2 can deepen graph recall quality, dashboards, and broader eval coverage after P1 parity and safety are proven.
- Destructive RAG maintenance execution is intentionally broader than memory-only roles: human operators, `chief_of_staff`, `memory_curator`, and roles with write-code/edit-file capability are in scope; all other roles are limited to inspect, plan, dry-run, and status surfaces.
- Runtime data profiles are a prerequisite for closing US1: installed/operator data, dev/review data, and test data must be isolated before any further destructive rebuild or review execution is considered safe.
- Normal rebuilds clear derived state only within the active profile. They do not wipe canonical task/run/audit state or vault sources unless an explicit wipe workflow with backup and profile confirmation is added.
