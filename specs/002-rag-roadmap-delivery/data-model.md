# Data Model: Fulcrum RAG Roadmap Delivery

**Feature**: [Fulcrum RAG Roadmap Delivery](./spec.md)
**Date**: 2026-04-23

## Existing Entities Reused

- **Runtime Data Profile**: Existing install/dev/test profile manifest with DB, vault, graph, vector, artifact paths and path fingerprints.
- **RAG Rebuild Report**: Existing persisted rebuild report extended with repair-plan linkage, final health verification, and richer degraded-domain details.
- **Embedding Job / Item**: Existing durable job ledger extended with stricter runtime truth and code-vector execution guarantees.
- **Vector Metadata**: Existing per-source vector metadata extended or verified to include actual runtime truth, freshness, and coverage states.
- **Trace Event**: Existing local telemetry table reused for spans where suitable; RAG query traces may use a dedicated table when retrieval-stage structure needs stable query contracts.
- **RAG Eval Run**: Existing eval-run ledger extended to support multiple suites and persisted per-case results.

## New Or Extended Entities

### RAG Repair Plan

Non-mutating plan generated from current health, profile, coverage, and eval readiness.

Fields:
- `repair_plan_id`
- `workspace_id`
- `project_id`
- `runtime_profile`
- `profile_path_fingerprints`
- `domains`
- `required_actions`
- `optional_actions`
- `mutation_scope`
- `estimated_counts`
- `preflight_warnings`
- `blocking_errors`
- `clean_slate_required`
- `created_at`

Rules:
- Does not mutate state.
- Defaults to targeted verify/fix actions.
- `clean_slate_required` can be true only when the caller explicitly requested clean-slate scope or no targeted repair can be made safe.
- Agent-facing output uses path fingerprints; operator preflight may include absolute paths.

### RAG Repair Run

Execution record for targeted derived-state repair and post-repair verification.

Fields:
- `repair_run_id`
- `repair_plan_id`
- `workspace_id`
- `project_id`
- `runtime_profile`
- `status`: `pending | running | completed | degraded | failed | cancelled`
- `domains`
- `started_at`
- `finished_at`
- `actor_kind`
- `actor_role`
- `report_id`
- `final_health_status`
- `retryable_actions`
- `errors`

Transitions:
- `pending -> running`
- `running -> completed`
- `running -> degraded`
- `running -> failed`
- `running -> cancelled`
- `degraded -> running` through retry/resume
- Terminal states: `completed | failed | cancelled`

### RAG Health Domain

Domain-level status within a health report.

Fields:
- `domain`: `l0 | l1 | fts | files | code | vectors | graph | provenance | eval_readiness | runtime_truth`
- `status`: `healthy | degraded | failed | out_of_scope`
- `required`
- `current_count`
- `stale_count`
- `failed_count`
- `skipped_count`
- `out_of_scope_reason`
- `next_actions`

Rules:
- A required domain with `out_of_scope` cannot make the overall report healthy unless the command/profile explicitly excludes that domain.
- Required live eval domain with zero expected cases is `degraded`.

### Coverage Record

Source-level coverage state for derived RAG domains.

Fields:
- `coverage_id`
- `workspace_id`
- `project_id`
- `source_domain`: `memory | l1_page | file_chunk | code_chunk | graph_entity | graph_edge | task | decision`
- `source_id`
- `derived_domain`: `fts | vector | graph | code_index | contextual_text | eval_case`
- `content_hash`
- `status`: `current | stale | failed | skipped | intentionally_unembedded | legacy`
- `provider`
- `model`
- `actual_device`
- `dimensions`
- `freshness_checked_at`
- `failure_code`
- `failure_message`

Rules:
- Every recallable memory, file chunk, and code chunk must have explicit vector coverage state after repair verification.
- Missing vector metadata is treated as `legacy` or `stale`, never silently current.

### Unified Context Query

Request over all context domains.

Fields:
- `query`
- `workspace_id`
- `project_id`
- `limit`
- `context_budget_tokens`
- `source_filters`
- `include_graph`
- `include_tasks`
- `include_code`
- `include_memory`
- `explain`
- `runtime_profile`

Validation:
- `limit` and `context_budget_tokens` have documented caps.
- Source filters cannot select private paths outside workspace/profile scope.

### Typed Context Result

Single ranked result from unified retrieval.

Fields:
- `result_id`
- `type`: `memory | code_chunk | file_chunk | graph_entity | graph_edge | task | decision | legacy`
- `rank`
- `score`
- `title`
- `snippet`
- `source_ref`
- `provenance_class`: `raw_backed | curated_backed | code_backed | graph_backed | task_backed | legacy_unbacked`
- `freshness`: `current | stale | failed | unknown`
- `stage_contributions`
- `line_range`
- `symbol_path`
- `content_hash`
- `explanation_status`

Rules:
- Every result must include type, provenance class, source ref, freshness, and explanation status.
- Canonical snippets are returned even when contextual index text affected ranking.

### Context Pack

Source-diverse result set prepared for agents or answer workflows.

Fields:
- `pack_id`
- `query_trace_id`
- `results`
- `budget`
- `source_diversity`
- `deduplicated_results`
- `truncated_results`
- `created_at`

Rules:
- Repeated source caps apply unless query filters explicitly target that source.
- Pack preserves citations and line/source references.

### Code Evidence Unit

Searchable code chunk or symbol record.

Fields:
- `chunk_id`
- `workspace_id`
- `project_id`
- `file_id`
- `absolute_path_operator_only`
- `path_fingerprint`
- `relative_path`
- `language`
- `symbol_path`
- `package_name`
- `module_path`
- `line_start`
- `line_end`
- `content_hash`
- `parse_status`: `indexed | skipped | failed`
- `vector_status`: `current | stale | failed | skipped | legacy`
- `indexed_at`
- `failure_code`
- `failure_message`

Rules:
- Batch and incremental indexers must produce equivalent chunk identity and line attribution.
- Parse/index failures are file-level states, not silent omissions.

### Graph Evidence Unit

Graph entity, edge, or summary used by retrieval.

Fields:
- `graph_unit_id`
- `kind`: `entity | edge | summary`
- `domain`: `memory | task | decision | error | fix | file | symbol | import | call`
- `relationship_type`
- `source_ids`
- `confidence`
- `freshness`
- `from_id`
- `to_id`
- `summary_id`
- `properties`

Rules:
- P1 requires coverage and reporting.
- P2 relationship modes require cited entity/edge contribution in explain output.

### Contextual Index Record

Retrieval-only text attached to canonical evidence.

Fields:
- `contextual_index_id`
- `source_domain`
- `source_id`
- `canonical_content_hash`
- `context_version`
- `template_version`
- `index_text_hash`
- `index_text`
- `status`: `current | stale | failed | skipped`
- `created_at`
- `updated_at`

Rules:
- Must not replace canonical source content.
- Becomes stale when canonical hash, symbol/document context, or template version changes.

### RAG Eval Case

Fixture or live query with expected evidence and gates.

Fields:
- `eval_case_id`
- `workspace_id`
- `project_id`
- `suite`: `rag-lifecycle | live-rag | code-rag | unified-context`
- `case_type`: `fixture | live`
- `query`
- `required_domains`
- `expected_sources`
- `expected_top_k`
- `thresholds`
- `model_heavy`
- `accelerator_heavy`
- `status`: `active | disabled | missing_expected_cases`

Rules:
- Required live domain with no expected cases marks eval readiness degraded.
- Model/accelerator-heavy cases do not run by default.

### RAG Eval Result

Per-case result inside an eval run.

Fields:
- `eval_result_id`
- `eval_run_id`
- `eval_case_id`
- `status`: `passed | failed | skipped | degraded`
- `metrics`
- `retrieved_sources`
- `missing_sources`
- `query_trace_id`
- `failures`
- `latency_ms`

Metrics:
- `recall_at_k`
- `mrr`
- `ndcg`
- `context_precision`
- `context_recall`
- `groundedness`
- `provenance_coverage`
- `citation_accuracy`
- `answer_correctness` when answer generation is used
- `latency_p50_ms`
- `latency_p95_ms`

### RAG Query Trace

Explain-enabled retrieval trace.

Fields:
- `query_trace_id`
- `workspace_id`
- `project_id`
- `query_hash`
- `source_filters`
- `runtime_truth`
- `stages`
- `fusion`
- `rerank`
- `diversification`
- `latency`
- `results`
- `skipped_stages`
- `redaction_summary`
- `created_at`

Rules:
- Do not persist raw secrets, raw env values, or agent-private absolute paths.
- Operator-only report surfaces can resolve path fingerprints to absolute paths.

### Optional Runtime Experiment

Controlled comparison for future stores/runtimes.

Fields:
- `experiment_id`
- `workspace_id`
- `project_id`
- `adapter_type`: `vector_store | graph_store | code_indexer | model_runtime`
- `adapter_name`
- `baseline_eval_run_id`
- `candidate_eval_run_id`
- `quality_delta`
- `latency_delta`
- `resource_delta`
- `rollback_verified`
- `local_first_verified`
- `agent_tool_parity_verified`
- `adoption_status`: `proposed | running | rejected | approved_for_default`
- `risk_notes`

Rule:
- `approved_for_default` requires passing quality, latency, rollback, local-first, and parity gates.

## Persistence Requirements

- All new persisted IDs use `newId(<type>)`.
- Every persisted status union has a matching SQLite `CHECK` constraint and guard-test entry.
- Workspace-scoped tables include `workspace_id`; project-scoped rows include `project_id`.
- Task-related lookups remain workspace scoped.
- JSON fields are stringified on write and parsed in mappers.
- Read-only reports never mutate state.

## Relationships

- `RAG Repair Plan` can spawn one or more `RAG Repair Run` records.
- `RAG Repair Run` links to final `RAG Rebuild Report` and `RAG Health Report`.
- `Coverage Record` links canonical source IDs to derived state.
- `Unified Context Query` produces `RAG Query Trace`, `Typed Context Result`, and optional `Context Pack`.
- `RAG Eval Result` references `RAG Query Trace` for explainable failure diagnosis.
- `Optional Runtime Experiment` references baseline and candidate `RAG Eval Run` records.
