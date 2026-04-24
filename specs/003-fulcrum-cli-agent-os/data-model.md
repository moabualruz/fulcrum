# Data Model: Fulcrum CLI Agent OS

**Feature**: [Fulcrum CLI Agent OS](./spec.md)
**Date**: 2026-04-24

## Ownership Classes

### Canonical State

Fulcrum-owned records that survive backup/restore and cannot be owned by adapters:

- Workspace, Project
- Task, Dependency/Blocker
- Run, Heartbeat, Action Record
- Event, Policy Decision
- Artifact, Review Item, Merge Item
- Setup Profile, Setup Lock, Setup Receipt
- Provider Configuration reference and privacy status
- Adapter Ref, External Mapping
- Sidecar Process record
- Index File State
- Memory Source
- OS Graph Node/Edge
- Context Pack when explicitly persisted
- Release Validation Run

### Derived State

Rebuildable state repaired from canonical sources:

- AST symbols/imports/chunks
- Lexical indexes and search refs
- Semantic vectors and hybrid retrieval indexes
- LightRAG retrieval graph outputs
- Context rankings and query traces when not explicitly persisted
- Graph extraction outputs not yet promoted to canonical OS graph refs

Rule: derived state may be deleted/rebuilt through scoped repair; canonical state must not be lost during repair, rebuild-index, backup/restore, uninstall, or adapter outage.

## Core Entities

### Workspace

Local top-level scope for projects, setup profile state, events, indexes, graph refs, adapters, memory, and validations.

Fields:
- `workspace_id`
- `name`
- `fulcrum_home`
- `created_at`
- `updated_at`
- `status`: `active | archived | blocked`
- `privacy_posture`: `local_only | remote_opt_in | external_sync_opt_in`

Relationships:
- Has many Projects, Tasks, Runs, Events, Memory Sources, Graph Nodes/Edges, Adapter Mappings, Validation Runs.

### Project

Work unit inside a workspace with code roots, tasks, memory links, runs, worktrees, and index states.

Fields:
- `project_id`
- `workspace_id`
- `name`
- `root_path_fingerprint`
- `display_path_operator_only`
- `ignore_policy_ref`
- `created_at`
- `updated_at`

Validation:
- Agent-facing output uses stable refs and fingerprints unless operator explicitly requests path output.

### Task

Fulcrum-owned unit of planned or active work.

Fields:
- `task_id`
- `workspace_id`
- `project_id`
- `title`
- `description`
- `state`: `backlog | ready | running | blocked | review | merge | completed | cancelled`
- `priority`
- `assignee_ref`
- `blocked_reason`
- `created_at`
- `updated_at`

Relationships:
- Has Dependencies/Blockers, Runs, Artifacts, Review Items, Merge Items, Context Packs, Graph Refs, Adapter Mappings.

Rules:
- External PM adapter IDs map to Task but do not replace Task identity.

### Run

Supervised execution attempt for a task.

Fields:
- `run_id`
- `task_id`
- `workspace_id`
- `project_id`
- `mode`: `stub | subprocess | adapter_action | external_agent`
- `state`: `pending | running | blocked | failed | cancelled | completed`
- `started_at`
- `last_heartbeat_at`
- `finished_at`
- `terminal_reason`
- `worktree_allocation_id`

Transitions:
- `pending -> running`
- `running -> blocked`
- `running -> failed`
- `running -> cancelled`
- `running -> completed`
- `blocked -> running`
- Terminal states: `failed | cancelled | completed`

Rules:
- A Run may reach at most one terminal state.
- Invalid transitions are rejected and evented.

### Event

Append-only local record for reconstructing task, run, cockpit, setup, adapter, action, index, graph, health, and policy state.

Fields:
- `event_id`
- `workspace_id`
- `project_id`
- `subject_type`
- `subject_id`
- `event_type`
- `sequence`
- `cursor`
- `payload`
- `redaction_status`
- `created_at`

Rules:
- Event replay must reconstruct dashboard and run state.
- SSE/live streams reconnect by cursor.

### Artifact

Output from a run, action, review, merge, validation, or context workflow.

Fields:
- `artifact_id`
- `workspace_id`
- `project_id`
- `task_id`
- `run_id`
- `producer_type`: `run | action | review | merge | validation | context`
- `kind`
- `path_or_ref`
- `size_bytes`
- `digest`
- `retention_status`: `active | purged | preserved_backup`
- `created_at`

Rules:
- Secrets and raw env values are redacted or excluded before agent-facing output.

### Policy Decision

Local record authorizing, blocking, or constraining sensitive operations.

Fields:
- `policy_decision_id`
- `workspace_id`
- `project_id`
- `subject_type`: `run | action | adapter | setup | provider | destructive_operation | remote_operation`
- `subject_id`
- `decision`: `allow | deny | require_confirmation | require_profile`
- `reason`
- `rule_refs`
- `created_at`

Rules:
- Policy must run before action launch, adapter mutation, destructive reset, remote provider use, telemetry export, or sidecar install.

## Setup Entities

### Setup Profile

Capability bundle selected by an operator.

Fields:
- `profile`: `core | code | memory | actions | full`
- `workspace_id`
- `status`: `not_installed | planned | installing | ready | degraded | blocked | uninstalling`
- `selected_at`
- `last_doctor_at`

Rules:
- `core` is default.
- Missing optional profile dependencies must not block unrelated core workflows.

### Setup Lock

Manifest at `$FULCRUM_HOME/manifests/setup-lock.toml`.

Fields:
- `setup_lock_id`
- `profile`
- `host_os`
- `host_arch`
- `fulcrum_version`
- `dependencies`
- `provider_refs`
- `source_urls_or_local_sources`
- `sha256`
- `installed_paths`
- `health_commands`
- `last_results`
- `created_at`
- `updated_at`

Rules:
- Required for install, doctor, repair, and uninstall.
- Embedding model and dimensions are recorded before vector indexing.

### Setup Receipt

Per-step proof that a dependency or managed asset was installed, detected, repaired, or uninstalled.

Fields:
- `receipt_id`
- `setup_lock_id`
- `dependency_id`
- `classification`: `managed | detected | guided | optional | blocked`
- `action`: `install | detect | repair | uninstall | smoke`
- `version`
- `source`
- `sha256`
- `paths`
- `doctor_result`: `passed | degraded | failed | blocked`
- `duration_ms`
- `created_at`

Rules:
- No receipt means not installed.
- `setup install --json` emits JSONL step events for receipt lifecycle.

### Dependency Status

Dependency readiness record inside setup doctor output.

Fields:
- `dependency_id`
- `profile`
- `classification`: `managed | detected | guided | optional | blocked`
- `required`
- `version`
- `path_fingerprint`
- `fix_command`
- `health_result`
- `last_checked_at`

Rules:
- Agents must stop on `blocked`.
- Guided dependencies include exact verification command and install choices.

### Provider Configuration

Provider-neutral model config for memory/code/context use.

Fields:
- `provider_config_id`
- `kind`: `openai-compatible | ollama-local | lmstudio-local | vllm-local | llama-cpp-local | localai | remote-openai-compatible`
- `base_url`
- `api_key_env`
- `chat_model`
- `embedding_model`
- `embedding_dimensions`
- `reranker_model`
- `privacy_status`: `local | remote_opt_in | unknown`
- `health_status`: `ready | degraded | blocked`
- `created_at`
- `updated_at`

Rules:
- Large models are never auto-downloaded without explicit consent.
- Existing vector indexes block when configured model/dimensions drift.

## Code And Retrieval Entities

### Index File State

Canonical record of file identity and index readiness.

Fields:
- `file_id`
- `workspace_id`
- `project_id`
- `relative_path`
- `path_fingerprint`
- `content_hash`
- `classification`: `source | docs | config | binary | large | ignored | secret_excluded`
- `parse_status`: `indexed | skipped | failed | stale`
- `lexical_status`: `current | stale | failed | skipped`
- `semantic_status`: `current | stale | failed | skipped | queued`
- `graph_status`: `current | stale | failed | skipped`
- `last_indexed_at`
- `failure_code`

Rules:
- Create/update/delete/rename update index and graph state incrementally.
- Ignore rules and secret exclusion are enforced before indexing/retrieval.

### Code Evidence Unit

Searchable code result or source unit.

Fields:
- `code_evidence_id`
- `file_id`
- `kind`: `file | symbol | chunk | import | dependency | lexical_hit | semantic_hit | graph_hit`
- `language`
- `symbol_path`
- `line_start`
- `line_end`
- `content_hash`
- `lane_contributions`
- `freshness`
- `provenance_class`: `code_backed`

Rules:
- Exact identifier, symbol, path, quoted phrase, and suffix matches outrank weak semantic hits for identifier-like queries.

### Memory Source

Markdown, L0, L1, curated, or imported source with provenance.

Fields:
- `memory_source_id`
- `workspace_id`
- `project_id`
- `kind`: `markdown | l0 | l1 | curated | imported`
- `source_ref`
- `source_hash`
- `provenance_class`
- `state`: `active | updated | tombstoned | deleted`
- `graph_link_status`
- `created_at`
- `updated_at`

Rules:
- Update/delete/tombstone changes retrieval results and graph refs.
- Missing provider blocks memory readiness but not core status.

### OS Graph Node

Fulcrum-owned graph node linking cross-domain records.

Fields:
- `graph_node_id`
- `workspace_id`
- `project_id`
- `domain`: `memory | code | task | run | action | artifact | policy | context | adapter | file | symbol | chunk | external`
- `stable_ref`
- `source_ids`
- `freshness`
- `created_at`
- `updated_at`

### OS Graph Edge

Fulcrum-owned relationship between graph nodes.

Fields:
- `graph_edge_id`
- `from_node_id`
- `to_node_id`
- `relationship_type`
- `confidence`
- `source_event_id`
- `freshness`
- `created_at`
- `updated_at`

Rules:
- Normal changes update graph refs incrementally.
- Full rebuild is repair, not normal correctness path.

### Context Pack

Source-diverse cited evidence bundle.

Fields:
- `context_pack_id`
- `workspace_id`
- `project_id`
- `query`
- `results`
- `budget_tokens`
- `used_tokens`
- `source_diversity`
- `lane_contributions`
- `persisted`: `true | false`
- `created_at`

Rules:
- One file, memory family, source, or evidence lane cannot dominate unless explicitly targeted.
- Read-only retrieval does not persist traces/artifacts unless requested.

### Query Trace

Explain record for retrieval/context workflows.

Fields:
- `query_trace_id`
- `workspace_id`
- `project_id`
- `query`
- `candidate_counts`
- `stage_rankings`
- `lane_contributions`
- `token_budget`
- `tokenizer_kind`
- `embedding_cache_hit`
- `cold_start_latency_ms`
- `total_latency_ms`
- `degraded_lanes`
- `redaction_summary`
- `persisted`

Rules:
- Agent-facing trace output redacts secrets and private paths.

## Worktree And Delivery Entities

### Worktree Allocation

Task/run relation to branch and worktree state.

Fields:
- `worktree_allocation_id`
- `task_id`
- `run_id`
- `branch_name`
- `worktree_path_fingerprint`
- `state`: `allocated | active | review | merge_ready | merged | conflicted | cleanup_blocked | cleaned`
- `dirty`
- `untracked`
- `conflicted`
- `unmerged`
- `created_at`
- `updated_at`

Rules:
- Cleanup refuses unsafe dirty, unmerged, conflicted, or user-owned worktrees.

### Review Item

Finding or review decision attached to task/run/artifact/file.

Fields:
- `review_item_id`
- `task_id`
- `run_id`
- `artifact_id`
- `file_id`
- `severity`
- `status`: `open | addressed | dismissed`
- `body`
- `created_at`

### Merge Item

Merge queue record.

Fields:
- `merge_item_id`
- `task_id`
- `run_id`
- `worktree_allocation_id`
- `state`: `queued | merging | merged | conflicted | blocked`
- `conflict_artifact_id`
- `created_at`
- `updated_at`

## Adapter Entities

### Action Record

Fulcrum-owned record for local or external action.

Fields:
- `action_id`
- `workspace_id`
- `project_id`
- `task_id`
- `run_id`
- `adapter_id`
- `state`: `planned | policy_blocked | launched | running | succeeded | failed | cancelled`
- `external_job_id`
- `log_artifact_id`
- `result_artifact_id`
- `created_at`
- `updated_at`

Rules:
- Action cannot mutate Run lifecycle directly.
- Policy decision is required before launch.

### Adapter Mapping

Reversible mapping between Fulcrum refs and external product IDs.

Fields:
- `adapter_mapping_id`
- `adapter_id`
- `fulcrum_ref_type`
- `fulcrum_ref_id`
- `external_id`
- `direction`: `import | export | sync | webhook`
- `conflict_state`: `none | pending | resolved | blocked`
- `provenance`
- `last_seen_at`

### Adapter Certification Report

Evidence package for optional adapter promotion.

Fields:
- `certification_report_id`
- `adapter_id`
- `profile`
- `install_strategy`
- `doctor_health`
- `local_footprint`
- `ports_processes`
- `external_ids`
- `mapping_contract`
- `crud_update_delete_semantics`
- `offline_behavior`
- `offline_boot_behavior`
- `backup_restore_posture`
- `uninstall_behavior`
- `security_privacy_notes`
- `clean_machine_smoke_result`
- `status`: `experimental | certified | deferred | rejected`

Rules:
- No adapter becomes default without certification and release-band gates.

## Release Validation Entity

### Release Validation Run

Milestone or release-band gate execution.

Fields:
- `validation_run_id`
- `scope`: `core | code | memory | actions | full | release | privacy | setup | graph | context | adapter`
- `milestone`: `M0 | M1 | M2 | M3 | M4 | M5 | M6 | M7 | M8 | M9 | M10 | M11 | M12`
- `release_band`: `local_alpha | useful_alpha | adapter_beta | release_candidate | beta_hardening`
- `status`: `passed | failed | degraded | skipped`
- `evidence_refs`
- `skipped_reasons`
- `risk_refs`
- `created_at`

Rules:
- Release bands cannot be claimed until all required milestone validation runs pass or are explicitly deferred by documented gate.
