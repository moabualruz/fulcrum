# Tasks: Fulcrum RAG Lifecycle Hardening

**Input**: Design documents from `/specs/001-rag-lifecycle-hardening/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/rag-lifecycle-contracts.md, quickstart.md

**Tests**: Required by project rules and this feature's risk profile. Write tests first; each test task should fail before its paired implementation task lands.

**Organization**: Tasks are grouped by user story so each story can be implemented and verified independently after the foundational phase.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it touches different files or independent checks.
- **[Story]**: User story label for story phases only.
- Every task references concrete file paths.

## Specialist Enrichment Applied

- **Data integrity**: migrations, enum `CHECK` constraints, workspace scoping, transaction boundaries, stale snapshot protection.
- **Security hardening**: authorization gates, input validation, secret redaction, destructive-command audit events.
- **API/interface design**: stable CLI/MCP JSON contracts, structured errors, additive types, contract tests.
- **Agent-native architecture**: CLI/MCP/action parity, machine-readable outputs, read-only vs destructive capability metadata.
- **Test-driven development**: failing tests before implementation in every behavior slice.
- **Integration utilization**: producer/consumer wiring tests across core, memory, CLI, MCP, monitor, and CI workflows.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create feature scaffolding and fixture locations without changing runtime behavior.

- [X] T001 [P] Create RAG lifecycle fixture directory and seed placeholder notes in packages/memory/src/tests/fixtures/rag-lifecycle/README.md
- [X] T002 [P] Create RAG lifecycle eval suite directory and seed placeholder docs in packages/memory/src/eval/rag-lifecycle/README.md
- [X] T003 [P] Add RAG lifecycle command module scaffold in packages/cli/src/commands/memory-rag-lifecycle.ts
- [X] T004 [P] Add RAG lifecycle memory module scaffold in packages/memory/src/setup/rag-lifecycle.ts
- [X] T005 [P] Add RAG lifecycle job module scaffold in packages/memory/src/l2/embedding-jobs.ts
- [X] T006 [P] Add RAG lifecycle explain module scaffold in packages/memory/src/retrieval/explain.ts
- [X] T007 [P] Add RAG lifecycle health module scaffold in packages/memory/src/setup/rag-health.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared types, schema, contracts, redaction, and agent-facing surfaces required by all user stories.

**Critical**: No user story implementation begins until this phase is complete.

- [X] T008 [P] Add failing schema migration tests for `rag_rebuild_reports`, `rag_rebuild_candidates`, `rag_rebuild_input_snapshots`, `embedding_jobs`, `embedding_job_items`, `rag_job_events`, `vector_metadata`, and `rag_eval_runs` covering FR-042 in packages/core/src/tests/rag-lifecycle-schema.test.ts
- [X] T009 [P] Add failing persisted enum `CHECK` coverage for rebuild, candidate, snapshot, job, item, event, vector, health, and eval statuses in packages/core/src/tests/check-constraints.test.ts
- [X] T010 [P] Add failing first-class ID prefix tests for report, candidate, snapshot, job, job item, event, vector metadata, and eval run IDs in packages/core/src/tests/ids.test.ts
- [X] T011 [P] Add failing workspace-scope regression tests for every RAG lifecycle task/report/job lookup in packages/core/src/tests/rag-lifecycle-scope.test.ts
- [X] T012 [P] Add failing redaction tests for logs, reports, job events, explanations, eval artifacts, and provider config covering FR-041 in packages/memory/src/tests/rag-lifecycle-redaction.test.ts
- [X] T013 [P] Add failing CLI/MCP schema lint tests for RAG lifecycle tool names, read-only hints, destructive flags, and idempotent hints in packages/cli/src/tests/rag-lifecycle-mcp-tools.test.ts
- [X] T014 [P] Add failing integration utilization tests proving memory producers are consumed by CLI registry and MCP tools in packages/cli/src/tests/rag-lifecycle-utilization.test.ts
- [X] T015 Implement RAG lifecycle shared unions and output interfaces for FR-034 in packages/core/src/types.ts
- [X] T016 Implement RAG lifecycle ID prefixes via `newId()` for all first-class entities in packages/core/src/ids.ts
- [X] T017 Implement additive RAG lifecycle migrations with `CHECK` constraints and workspace-scoped indexes in packages/core/src/db/schema.ts
- [X] T018 Wire idempotent migration execution and ledger rows for RAG lifecycle schema covering FR-042 in packages/core/src/db/migrations.ts
- [X] T019 Implement shared redaction helper for free-form details and provider configuration covering FR-041 in packages/memory/src/setup/rag-redaction.ts
- [X] T020 Export RAG lifecycle public types and primitives through packages/core/src/index.ts and packages/memory/src/index.ts
- [X] T021 Register RAG lifecycle CLI/MCP schema placeholders with capability metadata in packages/cli/src/mcp-tools.ts
- [X] T022 Register RAG lifecycle handlers as registry-backed entries with read-only/destructive capability metadata in packages/cli/src/tool-registry.ts

**Checkpoint**: Foundation ready; user story work can start.

---

## Phase 3: User Story 1 - Rebuild Trusted Search State (Priority: P1) - MVP

**Goal**: Provide authoritative reset/rebuild with staged promotion, source snapshots, parity checks, reports, authorization, and audit events.

**Independent Test**: Run rebuild plan, dry-run, execute, intentional parity failure, and stale-source-snapshot scenarios against fixture workspace; verify reports and served state.

### Tests for User Story 1

- [X] T023 [P] [US1] Add failing plan/dry-run non-mutation tests for FR-002, FR-003, FR-033, and SC-009 in packages/memory/src/tests/rag-rebuild-plan.test.ts
- [X] T024 [P] [US1] Add failing staged candidate promotion and failed-candidate quarantine tests for FR-045, SC-014, and SC-001 in packages/memory/src/tests/rag-rebuild-staging.test.ts
- [X] T025 [P] [US1] Add failing source-snapshot stale-promotion tests for FR-047 and SC-016 in packages/memory/src/tests/rag-rebuild-snapshot.test.ts
- [X] T026 [P] [US1] Add failing parity tests for L0, L1, FTS5, code file/chunk, vector metadata, and graph coverage for FR-004, FR-005, FR-035, and SC-012 in packages/memory/src/tests/rag-rebuild-parity.test.ts
- [X] T027 [P] [US1] Add failing authorization and audit tests for destructive rebuild execution covering FR-040 in packages/cli/src/tests/rag-rebuild-authorization.test.ts
- [X] T028 [P] [US1] Add failing CLI JSON contract tests for rebuild request/response and structured errors in packages/cli/src/tests/rag-rebuild-contract.test.ts

### Implementation for User Story 1

- [X] T029 [US1] Implement rebuild scope planner with zero-scope and allow-empty behavior for FR-001, FR-002, and FR-008 in packages/memory/src/setup/rag-lifecycle.ts
- [X] T030 [US1] Implement rebuild input snapshot capture and hash manifest comparison for FR-047 in packages/memory/src/setup/rebuild-snapshot.ts
- [X] T031 [US1] Implement staged rebuild candidate creation, status transitions, and unserved storage references for FR-045 in packages/memory/src/setup/rebuild-candidate.ts
- [X] T032 [US1] Implement rebuild orchestration for L0, L1, FTS5, code, vector metadata, and graph domains for FR-004 in packages/memory/src/setup/rag-lifecycle.ts
- [X] T033 [US1] Implement text-search integrity and relationship parity checks for FR-005 and FR-035 in packages/memory/src/setup/rebuild-parity.ts
- [X] T034 [US1] Implement transactional promote/quarantine/discard behavior that preserves prior served state for FR-045 and FR-047 in packages/memory/src/setup/rebuild-candidate.ts
- [X] T035 [US1] Implement persisted machine-readable rebuild reports with counts, timings, warnings, errors, parity, candidate disposition, and stale snapshot details for FR-006 in packages/memory/src/setup/rebuild-report.ts
- [X] T036 [US1] Implement destructive rebuild authorization and audit-event creation for human operator, `chief_of_staff`, `memory_curator`, and write-code/edit-file capable roles for FR-040 in packages/cli/src/commands/memory-rag-lifecycle.ts
- [X] T037 [US1] Wire `fulcrum memory rebuild --mode plan|dry-run|--execute --json` to registry-backed handlers for FR-034 in packages/cli/src/index.ts
- [X] T038 [US1] Add MCP/action parity for rebuild plan, dry-run, execute, and report status with accurate capability hints for FR-034 and FR-040 in packages/cli/src/tool-registry.ts
- [X] T039 [US1] Export rebuild primitives for downstream consumers through packages/memory/src/index.ts

**Checkpoint**: US1 rebuild workflow is independently functional and safe.

---

## Phase 4: User Story 2 - Resume and Inspect Embedding Work (Priority: P1)

**Goal**: Durable, resumable, model-aware embedding jobs with degraded terminal state and failed-item retry.

**Independent Test**: Start embedding job, interrupt/resume, force item failures, retry failed items only, and verify completed current items are not reprocessed.

### Tests for User Story 2

- [ ] T040 [P] [US2] Add failing embedding job ledger migration and mapper tests for FR-009 and FR-010 in packages/memory/src/tests/embedding-jobs-schema.test.ts
- [ ] T041 [P] [US2] Add failing resume/idempotency tests for interrupted jobs covering FR-011 and SC-004 in packages/memory/src/tests/embedding-jobs-resume.test.ts
- [ ] T042 [P] [US2] Add failing degraded terminal-state and failed-item retry tests for FR-044 and SC-013 in packages/memory/src/tests/embedding-jobs-degraded.test.ts
- [ ] T043 [P] [US2] Add failing vector metadata current/stale/mixed-model coverage tests for FR-012, FR-013, and SC-003 in packages/memory/src/tests/vector-metadata.test.ts
- [ ] T044 [P] [US2] Add failing adaptive split and batch-reduction event tests for FR-014 and FR-036 in packages/memory/src/tests/embedding-recovery-events.test.ts
- [ ] T045 [P] [US2] Add failing runtime device requested/actual/fallback tests for FR-021, FR-022, FR-037, and SC-006 in packages/memory/src/tests/embedding-runtime-device.test.ts
- [ ] T046 [P] [US2] Add failing jobs CLI contract tests for status, logs, cancel, resume, retry failed, actor authorization, and audit events covering FR-029 and FR-040 in packages/cli/src/tests/rag-jobs-contract.test.ts

### Implementation for User Story 2

- [ ] T047 [US2] Implement embedding job and job item repositories with workspace-scoped queries in packages/memory/src/l2/embedding-jobs.ts
- [ ] T048 [US2] Implement preflight scanner for memory, L1 page, and code chunk scopes with allow-empty handling for FR-007 and FR-008 in packages/memory/src/l2/embedding-jobs.ts
- [ ] T049 [US2] Implement durable embedding runner that records source identity, content hash, requested model/provider/device/dimensions, status, attempts, and errors for FR-010 in packages/memory/src/l2/embedding-jobs.ts
- [ ] T050 [US2] Implement resume, cancellation, and idempotent retry surfaces for FR-011 in packages/memory/src/l2/embedding-jobs.ts
- [ ] T051 [US2] Implement degraded terminal state and failed/stale-only retry filtering for FR-044 in packages/memory/src/l2/embedding-jobs.ts
- [ ] T052 [US2] Implement vector metadata writes and stale/current/legacy classification for FR-012 and FR-013 in packages/memory/src/l2/vector-metadata.ts
- [ ] T053 [US2] Implement adaptive split and batch-size reduction event recording with redacted details for FR-014 and FR-036 in packages/memory/src/l2/embedding-jobs.ts
- [ ] T054 [US2] Implement requested vs actual runtime device and fail-closed explicit device mismatch behavior for FR-021, FR-022, and FR-037 in packages/memory/src/l2/embed.ts
- [ ] T055 [US2] Wire `fulcrum memory embed --scope` and `fulcrum jobs status|logs|cancel|resume|retry --failed --json` commands with audit events for expensive start/retry/cancel operations covering FR-029 and FR-040 in packages/cli/src/index.ts
- [ ] T056 [US2] Add MCP/action parity for embedding job start, status, cancel, resume, and retry with read-only/destructive hints in packages/cli/src/tool-registry.ts

**Checkpoint**: US2 embedding jobs are durable, inspectable, resumable, and retryable.

---

## Phase 5: User Story 3 - Search With Explainable Trust Signals (Priority: P1)

**Goal**: Stable explain output for memory recall and code search, including retrieval stages, runtime details, provenance, supersession, graph contribution, and source links.

**Independent Test**: Run recall and code search with explain enabled; verify JSON schema, stage scores/ranks, runtime fields, provenance classes, and graph contribution.

### Tests for User Story 3

- [ ] T057 [P] [US3] Add failing recall explain schema tests for FR-019, FR-020, FR-023, FR-024, and SC-005 in packages/memory/src/tests/recall-explain.test.ts
- [ ] T058 [P] [US3] Add failing code-search explain schema and path/line range tests for FR-018, FR-019, and SC-005 in packages/memory/src/tests/search-code-explain.test.ts
- [ ] T059 [P] [US3] Add failing provenance class and broken-source reference tests for FR-023, FR-024, and FR-025 in packages/memory/src/tests/provenance-explain.test.ts
- [ ] T060 [P] [US3] Add failing graph contribution explain tests for FR-026 and FR-027 in packages/memory/src/tests/graph-explain.test.ts
- [ ] T061 [P] [US3] Add failing CLI/MCP explain contract tests for `fulcrum memory recall --explain --json` and `recall_knowledge` in packages/cli/src/tests/recall-explain-contract.test.ts

### Implementation for User Story 3

- [ ] T062 [US3] Implement stable recall explanation schema and mappers in packages/memory/src/retrieval/explain.ts
- [ ] T063 [US3] Capture lexical, vector, reranker, graph, fused score, and rank data from recall pipeline in packages/memory/src/retrieval/v3-search.ts
- [ ] T064 [US3] Capture provider, model, requested device, actual device, fallback reason, and latency fields in packages/memory/src/retrieval/v3-search.ts
- [ ] T065 [US3] Implement provenance class and source reference mapping for raw-backed, curated-backed, code-backed, legacy-unbacked, and generated results in packages/memory/src/retrieval/explain.ts
- [ ] T066 [US3] Add graph contribution metadata when graph expansion affects results in packages/memory/src/retrieval/v3-search.ts
- [ ] T067 [US3] Add code-search explanation and line/path result mapping in packages/memory/src/retrieval/search-code.ts
- [ ] T068 [US3] Wire `--explain --json` recall output and MCP `recall_knowledge` explain support in packages/cli/src/commands/memory-recall.ts

**Checkpoint**: US3 explain outputs are stable and contract-tested.

---

## Phase 6: User Story 4 - Keep Code Index State Consistent (Priority: P1)

**Goal**: Batch and incremental code indexing produce identical file/chunk state, explicit failure rows, and stable search attribution.

**Independent Test**: Index the same fixture project through batch and incremental flows; verify file records, chunk counts, parse failure state, and path/line attribution.

### Tests for User Story 4

- [ ] T069 [P] [US4] Add failing batch vs incremental code indexing parity tests for FR-015, FR-016, and SC-002 in packages/memory/src/tests/code-index-parity.test.ts
- [ ] T070 [P] [US4] Add failing parse/index failure state tests for FR-017 in packages/memory/src/tests/code-index-failures.test.ts
- [ ] T071 [P] [US4] Add failing stale chunk replacement and current line range tests for FR-018 in packages/memory/src/tests/code-index-lines.test.ts
- [ ] T072 [P] [US4] Add failing integration utilization tests proving batch and PCI consumers use the same file-level primitive in packages/memory/src/tests/code-index-utilization.test.ts

### Implementation for User Story 4

- [ ] T073 [US4] Implement shared file-level code indexing primitive with file identity, hash, language, chunk count, and failure state in packages/memory/src/l2/code.ts
- [ ] T074 [US4] Update batch project indexing to call the shared file-level primitive in packages/memory/src/setup/backfill-code-files.ts
- [ ] T075 [US4] Update PCI incremental indexing to call the shared file-level primitive in packages/memory/src/pci/syncer.ts
- [ ] T076 [US4] Enforce chunk/file relationship parity and legacy classification in packages/memory/src/retrieval/search-code.ts
- [ ] T077 [US4] Return stable path and line range for every code-search result in packages/memory/src/retrieval/search-code.ts

**Checkpoint**: US4 code index state is consistent across ingestion paths.

---

## Phase 7: User Story 5 - Diagnose RAG Health Without Manual Queries (Priority: P2)

**Goal**: One read-only health surface for raw, L1, FTS, code, vector, failures, stale state, graph, eval, and recommended actions.

**Independent Test**: Run health report against healthy, stale, partial, failed, and drifted fixture workspaces; verify machine-readable and human-readable outputs.

### Tests for User Story 5

- [ ] T078 [P] [US5] Add failing health report fixture tests for raw/L1/FTS/code/vector/graph failures covering FR-028, SC-007, and SC-010 in packages/memory/src/tests/rag-health.test.ts
- [ ] T079 [P] [US5] Add failing read-only non-mutation tests for health command and monitor endpoint covering FR-033 and SC-009 in packages/cli/src/tests/rag-health-readonly.test.ts
- [ ] T080 [P] [US5] Add failing monitor read-only RAG health endpoint tests in packages/monitor/src/tests/rag-health-endpoint.test.ts

### Implementation for User Story 5

- [ ] T081 [US5] Implement RAG health report aggregation and recommended-action ordering in packages/memory/src/setup/rag-health.ts
- [ ] T082 [US5] Wire `fulcrum memory doctor --json` or equivalent RAG health command in packages/cli/src/index.ts
- [ ] T083 [US5] Add MCP/action read-only RAG health handler with structured output in packages/cli/src/tool-registry.ts
- [ ] T084 [US5] Add read-only monitor RAG health route and response mapping in packages/monitor/src/server.ts

**Checkpoint**: US5 health report is read-only and actionable.

---

## Phase 8: User Story 6 - Guard Retrieval Quality With Evals (Priority: P2)

**Goal**: Deterministic local golden RAG eval suite and targeted CI gate for RAG-related changes.

**Independent Test**: Run eval suite on fixture corpus; intentionally break expected memory IDs, code chunks, provenance links, ranking order, or parity and verify grouped failures.

### Tests for User Story 6

- [ ] T085 [P] [US6] Add failing golden eval fixture tests for retrieval relevance, ranking, answer correctness, grounding/provenance, graph expansion, and operational parity covering FR-030, FR-031, FR-038, SC-008, and SC-011 in packages/memory/src/eval/rag-lifecycle/runner.test.ts
- [ ] T086 [P] [US6] Add failing local deterministic eval runner tests that keep model-heavy checks opt-in for FR-039 in packages/memory/src/tests/rag-eval-runner.test.ts
- [ ] T087 [P] [US6] Add failing CI gate path-filter tests for RAG-related vs unrelated non-RAG changes covering FR-046 and SC-015 in packages/cli/src/tests/rag-eval-ci-gate.test.ts
- [ ] T088 [P] [US6] Add failing CLI eval contract tests for `fulcrum memory eval --suite rag-lifecycle --json`, actor authorization, and audit events covering FR-040 in packages/cli/src/tests/rag-eval-contract.test.ts

### Implementation for User Story 6

- [ ] T089 [US6] Implement checked-in golden eval fixtures for memory recall, code search, hybrid recall, reranking, provenance trace, graph expansion, and reset/rebuild parity in packages/memory/src/eval/rag-lifecycle/fixtures.ts
- [ ] T090 [US6] Implement RAG lifecycle eval runner and grouped result categories in packages/memory/src/eval/rag-lifecycle/runner.ts
- [ ] T091 [US6] Wire local deterministic eval suite into existing eval exports in packages/memory/src/eval/index.ts
- [ ] T092 [US6] Wire `fulcrum memory eval --suite rag-lifecycle --json` command for local post-rebuild eval execution with audit events for expensive eval runs covering FR-032 and FR-040 in packages/cli/src/index.ts
- [ ] T093 [US6] Add targeted CI gate for RAG lifecycle, memory, code search, embeddings, graph, and eval fixture paths in .github/workflows/memory-eval.yml
- [ ] T094 [US6] Document opt-in model-heavy and accelerator-heavy eval flags in packages/memory/src/eval/rag-lifecycle/README.md

**Checkpoint**: US6 default eval gate protects RAG-related changes without blocking unrelated work.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Cross-package verification, docs sync, and final quality gates.

- [ ] T095 [P] Update CLI reference and operator docs for rebuild, jobs, health, explain, and eval commands in docs/guides/cli-reference.md
- [ ] T096 [P] Update memory architecture docs for staged rebuilds, input snapshots, degraded embedding jobs, vector metadata, and eval gates in docs/architecture/memory-v3.md
- [ ] T097 [P] Add quickstart validation script or command notes matching specs/001-rag-lifecycle-hardening/quickstart.md in packages/cli/src/tests/rag-lifecycle-quickstart.test.ts
- [ ] T098 Run targeted core schema and guard tests with `pnpm --filter fulcrum-agent-core test` from package.json
- [ ] T099 Run targeted memory tests with `pnpm --filter fulcrum-memory test` from package.json
- [ ] T100 Run targeted CLI and monitor tests with `pnpm --filter fulcrum-agent-cli test` and `pnpm --filter fulcrum-monitor test` from package.json
- [ ] T101 Run full verification with `pnpm test`, `pnpm build`, and `pnpm run check:cycles` from package.json
- [ ] T102 Add P1-only shipping gate proving FR-043 can ship without P2 health/eval expansion in packages/cli/src/tests/rag-lifecycle-p1-gate.test.ts

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup**: no dependencies.
- **Phase 2 Foundational**: depends on Phase 1; blocks all user stories.
- **Phase 3 US1**: depends on Phase 2; MVP.
- **Phase 4 US2**: depends on Phase 2; can run after or alongside US1 once shared schema/types exist.
- **Phase 5 US3**: depends on Phase 2 and benefits from US2 runtime metadata.
- **Phase 6 US4**: depends on Phase 2; can run alongside US2/US3.
- **Phase 7 US5**: depends on US1, US2, US4, and graph coverage primitives.
- **Phase 8 US6**: depends on US1, US3, US4, and fixture health signals.
- **Phase 9 Polish**: depends on desired story phases.

### User Story Dependencies

- **US1 Rebuild Trusted Search State**: MVP and prerequisite for rebuild parity assertions.
- **US2 Resume and Inspect Embedding Work**: independent after shared schema; feeds vector health and eval fixtures.
- **US3 Search With Explainable Trust Signals**: independent after shared schema; uses metadata from US2 when available.
- **US4 Keep Code Index State Consistent**: independent after shared schema; feeds health and eval.
- **US5 Diagnose RAG Health Without Manual Queries**: depends on implemented signals from US1, US2, US4, and graph coverage.
- **US6 Guard Retrieval Quality With Evals**: depends on rebuild, explain, code parity, and fixture surfaces.

### Parallel Opportunities

- Setup scaffolds T001-T007 can run in parallel.
- Foundational failing tests T008-T014 can run in parallel before shared implementation T015-T022.
- Test tasks within each user story can run in parallel.
- US2 and US4 can proceed in parallel after Phase 2.
- CLI/MCP contract work can proceed in parallel with memory primitives once output contracts are frozen.
- Documentation tasks T095-T096 can run in parallel after contracts stabilize.

---

## Parallel Example: User Story 1

```bash
Task: "Add failing staged candidate promotion and failed-candidate quarantine tests for FR-045, SC-014, and SC-001 in packages/memory/src/tests/rag-rebuild-staging.test.ts"
Task: "Add failing source-snapshot stale-promotion tests for FR-047 and SC-016 in packages/memory/src/tests/rag-rebuild-snapshot.test.ts"
Task: "Add failing authorization and audit tests for destructive rebuild execution covering FR-040 in packages/cli/src/tests/rag-rebuild-authorization.test.ts"
```

## Parallel Example: User Story 2

```bash
Task: "Add failing degraded terminal-state and failed-item retry tests for FR-044 and SC-013 in packages/memory/src/tests/embedding-jobs-degraded.test.ts"
Task: "Add failing vector metadata current/stale/mixed-model coverage tests for FR-012, FR-013, and SC-003 in packages/memory/src/tests/vector-metadata.test.ts"
Task: "Add failing jobs CLI contract tests for status, cancel, resume, and retry failed in packages/cli/src/tests/rag-jobs-contract.test.ts"
```

## Parallel Example: User Story 6

```bash
Task: "Add failing golden eval fixture tests for retrieval relevance, ranking, answer correctness, grounding/provenance, graph expansion, and operational parity covering FR-030, FR-031, FR-038, SC-008, and SC-011 in packages/memory/src/eval/rag-lifecycle/runner.test.ts"
Task: "Add failing CI gate path-filter tests for RAG-related vs unrelated non-RAG changes covering FR-046 and SC-015 in packages/cli/src/tests/rag-eval-ci-gate.test.ts"
```

---

## Implementation Strategy

### MVP First

1. Complete Phase 1 and Phase 2.
2. Complete Phase 3 (US1) only.
3. Validate rebuild plan, dry-run, execute, failed parity, stale snapshot, and non-mutation behavior.
4. Stop and review before adding embedding, explainability, health, and eval scope.

### Incremental Delivery

1. Ship US1 to make derived state trustworthy.
2. Ship US2 to make vector work durable and inspectable.
3. Ship US4 to make code search state consistent.
4. Ship US3 to make retrieval trust explainable.
5. Ship US5 to make health visible without manual SQL.
6. Ship US6 to protect quality with deterministic eval gates.

### Quality Gates

1. Every behavior task starts with the paired failing test task.
2. Every new persisted enum has TypeScript union, SQLite `CHECK`, and guard-test coverage.
3. Every destructive execution path has authorization, explicit scope, audit event, and non-mutating plan/dry-run alternative.
4. Every CLI user capability has MCP/action parity where agents need the same outcome.
5. Every producer/consumer path has an integration utilization test before completion.
