# Data Model: Fulcrum RAG Lifecycle Hardening

## Existing Entities Extended

### Memory

Existing table: `memories`

Relevant existing fields:
- `memory_id`
- `workspace_id`
- `project_id`
- `schema_version`
- `content`
- `content_hash`
- `provenance_refs`
- `confidence`
- `supersedes`
- `superseded_by`
- `embedded`

New relationships:
- Can have one or more vector metadata records.
- Can appear as an embedding job item source.
- Can appear in eval expected-result fixtures.

### Code File

Existing table: `code_files`

Relevant existing fields:
- `file_id`
- `workspace_id`
- `project_id`
- `rel_path`
- `language`
- `sha256`
- `chunks_count`
- `indexed_at`

Proposed additive fields:
- `status`: `indexed | skipped | failed`
- `failure_reason`: nullable string
- `last_error_at`: nullable timestamp

Validation:
- `status` must have a SQLite `CHECK`.
- `chunks_count` must match child `code_chunks` rows when status is `indexed`.

### Code Chunk

Existing table: `code_chunks`

Relevant existing fields:
- `chunk_id`
- `workspace_id`
- `project_id`
- `file_path`
- `file_id`
- `content`
- `start_line`
- `end_line`
- `symbol_path`
- `content_hash`
- `embedding`

New relationships:
- Must resolve to `code_files.file_id` unless legacy and reported.
- Can have one or more vector metadata records.
- Can appear as an embedding job item source.

## New Entities

### Rebuild Report

Suggested table: `rag_rebuild_reports`

Fields:
- `report_id`: first-class ID via `newId('report')` or registered equivalent.
- `workspace_id`
- `project_id`
- `requested_by`
- `actor_role`
- `mode`: `plan | dry_run | execute`
- `domains`: JSON array of selected domains.
- `status`: `planned | running | completed | failed | cancelled`
- `candidate_id`: nullable reference to a staged rebuild candidate.
- `candidate_disposition`: `none | promoted | quarantined | discarded`
- `input_snapshot_id`: nullable reference to the rebuild input snapshot used by the candidate.
- `started_at`
- `finished_at`
- `summary`: JSON object with counts by domain.
- `parity`: JSON object with pass/fail checks.
- `warnings`: JSON array.
- `errors`: JSON array.
- `artifact_path`: optional report file path.

Validation:
- `mode`, `status`, and `candidate_disposition` need TypeScript unions plus SQLite `CHECK`.
- `workspace_id` required for every query.
- Execute mode must persist actor identity and must be authorized for a human operator, `chief_of_staff`, `memory_curator`, or a role with write-code/edit-file capability.

### Staged Rebuild Candidate

Suggested table: `rag_rebuild_candidates`

Fields:
- `candidate_id`: first-class ID.
- `report_id`
- `workspace_id`
- `project_id`
- `domains`: JSON array of staged domains.
- `status`: `building | verifying | verified | promoting | promoted | quarantined | discarded | failed`
- `storage_ref`: JSON object describing candidate table names, temp DB path, artifact path, or domain-specific staging references.
- `input_snapshot_id`
- `served_state_before`: JSON object recording the currently served derived-state identifiers before promotion.
- `verification`: JSON object with parity check results.
- `created_at`
- `updated_at`
- `promoted_at`
- `disposed_at`

Validation:
- `status` needs TypeScript union plus SQLite `CHECK`.
- Candidate state must not be visible to recall or code search until `status=promoted`.
- Failed candidates must be quarantined or discarded and must leave `served_state_before` unchanged.
- Candidate promotion must revalidate `input_snapshot_id`; stale snapshots block promotion and leave served state unchanged.

### Rebuild Input Snapshot

Suggested table: `rag_rebuild_input_snapshots`

Fields:
- `input_snapshot_id`: first-class ID.
- `workspace_id`
- `project_id`
- `domains`: JSON array covered by the snapshot.
- `source_manifest`: JSON object containing canonical source IDs, paths, content hashes, source table names, and relevant config fingerprints.
- `status`: `current | stale | superseded`
- `created_at`
- `validated_at`
- `stale_reason`: nullable string.

Validation:
- `status` needs TypeScript union plus SQLite `CHECK`.
- Snapshot rows must be workspace-scoped.
- Promotion must compare current canonical source identities and content hashes to `source_manifest`.
- Stale snapshots cannot promote a rebuild candidate.

### Embedding Model

Suggested table: `embedding_models`

Fields:
- `embedding_model_id`: first-class ID.
- `provider`
- `model`
- `dimensions`
- `intended_device`
- `model_kind`: `text_embedding | code_embedding | reranker`
- `created_at`
- `active`

Validation:
- Unique active model per `model_kind`, provider, model, dimensions, and intended device.
- `model_kind` needs TypeScript union plus SQLite `CHECK`.

### Embedding Job

Suggested table: `embedding_jobs`

Fields:
- `job_id`: first-class ID.
- `workspace_id`
- `project_id`
- `source_domain`: `memories | l1_pages | code_chunks`
- `status`: `pending | running | completed | degraded | failed | cancelled`
- `requested_provider`
- `requested_model`
- `requested_device`
- `dimensions`
- `scope`: JSON object describing filters and allow-empty behavior.
- `preflight_counts`: JSON object.
- `started_at`
- `finished_at`
- `cancel_requested_at`
- `summary`: JSON object with item counts.

Validation:
- `source_domain` and `status` need TypeScript unions plus SQLite `CHECK`.
- Resume must be idempotent by job ID.
- A job with one or more item failures and otherwise completed work transitions to `degraded`, not indefinite `running`.
- Failed-item retry must not reprocess completed current items by default.

### Embedding Job Item

Suggested table: `embedding_job_items`

Fields:
- `job_item_id`: first-class ID.
- `job_id`
- `workspace_id`
- `source_domain`
- `source_id`: `memory_id` or `chunk_id`.
- `source_content_hash`
- `chunk_key`: stable source chunk key for oversized content.
- `requested_provider`
- `requested_model`
- `requested_device`
- `actual_provider`
- `actual_model`
- `actual_device`
- `dimensions`
- `status`: `pending | running | embedded | failed | skipped | stale`
- `attempts`
- `error_type`
- `error_message`
- `started_at`
- `finished_at`

Validation:
- Unique current item per job, source ID, content hash, model, provider, dimensions, and chunk key.
- `status` needs TypeScript union plus SQLite `CHECK`.

### Job Event

Suggested table: `rag_job_events`

Fields:
- `event_id`: first-class ID.
- `job_id`
- `workspace_id`
- `event_type`: `progress | retry | split | fallback | cancelled | resumed | failed | completed`
- `source_id`: optional source row ID.
- `message`
- `details`: JSON object.
- `created_at`

Validation:
- `event_type` needs TypeScript union plus SQLite `CHECK`.
- Details must be redacted before persistence.

### Vector Metadata

Suggested table: `vector_metadata`

Fields:
- `vector_metadata_id`: first-class ID.
- `workspace_id`
- `source_domain`: `memory | code_chunk`
- `source_id`
- `content_hash`
- `provider`
- `model`
- `requested_device`
- `actual_device`
- `dimensions`
- `vector_table`: `vec_memories | vec_chunks`
- `status`: `current | stale | failed | skipped | legacy`
- `embedded_at`
- `error_type`
- `error_message`

Validation:
- `source_domain`, `vector_table`, and `status` need TypeScript unions plus SQLite `CHECK`.
- Current coverage is only valid when content hash, provider, model, dimensions, and intended device match current config.

### Recall Explanation

Output entity, not necessarily persisted.

Fields:
- `result_id`
- `result_type`: `memory | code_chunk`
- `stage_ranks`: lexical, vector, graph, reranker.
- `stage_scores`: lexical, vector, graph, reranker, fused.
- `runtime`: provider, model, requested device, actual device, fallback reason, latency.
- `trust`: confidence, freshness, supersession state, provenance class.
- `sources`: raw, curated, code, generated, or legacy references.

Validation:
- Must be JSON-serializable and stable for tests.

### RAG Health Report

Output entity and optional artifact.

Fields:
- `workspace_id`
- `project_id`
- `generated_at`
- `status`: `healthy | degraded | failed`
- `domains`: raw, l1, fts, code, vector, graph, eval.
- `recommended_actions`: ordered list.
- `warnings`
- `errors`

Validation:
- Status must be derived from checks, not manually set.

### RAG Eval Case

Suggested location: checked-in fixture files under `packages/memory/src/eval/`.

Fields:
- `case_id`
- `query`
- `scope`
- `expected_memory_ids`
- `expected_chunk_ids`
- `expected_provenance_refs`
- `expected_stage`
- `ranking_expectations`
- `fixture_setup`

Validation:
- Default eval cases must be deterministic and local-first.

### RAG Eval Run

Suggested table or JSON artifact.

Fields:
- `eval_run_id`
- `workspace_id`
- `suite`
- `status`
- `trigger_source`: `local | ci`
- `trigger_scope`: `rag_related | non_rag | manual`
- `gate_required`: boolean
- `started_at`
- `finished_at`
- `results`: JSON object grouped by retrieval relevance, ranking, correctness, grounding/provenance, graph expansion, and parity.

Validation:
- Default CI eval gates are required only when `trigger_scope=rag_related`.

### RAG Maintenance Audit Event

Suggested table or existing audit/event stream entry.

Fields:
- `audit_event_id`: first-class ID.
- `workspace_id`
- `project_id`
- `actor_id`
- `actor_role`
- `actor_kind`: `human | agent`
- `operation`: `rebuild | embed | retry | cancel | eval`
- `mode`: `plan | dry_run | execute | status`
- `authorized`: boolean
- `authorization_reason`
- `report_id`: optional rebuild report reference.
- `job_id`: optional embedding job reference.
- `created_at`

Validation:
- Destructive or expensive `execute` operations require `authorized=true`.
- Details must be secret-redacted before persistence.

## State Transitions

### Embedding Job

```text
pending -> running -> completed
pending -> running -> degraded
pending -> running -> failed
pending -> running -> cancelled
failed -> running -> completed
degraded -> running -> completed
degraded -> running -> degraded
cancelled -> running -> completed
```

### Embedding Job Item

```text
pending -> running -> embedded
pending -> running -> failed
pending -> skipped
embedded -> stale
failed -> pending
stale -> pending
```

### Rebuild Report

```text
planned -> completed
planned -> running -> completed
planned -> running -> failed
planned -> running -> cancelled
```

### Staged Rebuild Candidate

```text
building -> verifying -> verified -> promoting -> promoted
building -> failed -> quarantined
verifying -> failed -> quarantined
verified -> failed -> quarantined
promoting -> failed -> quarantined
quarantined -> discarded
```

## Migration Notes

- Additive tables should use extension-style idempotent migrations with ledger rows.
- New persisted enum-like fields must be added to `GUARDED_COLUMNS` tests.
- New first-class IDs require prefixes in `packages/core/src/ids.ts`.
- Existing `code_files` changes should be additive first. Avoid table rebuild unless a `CHECK` must be enforced immediately.
- Existing vector rows without metadata should be treated as `legacy` until reindexed.
