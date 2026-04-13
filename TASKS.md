# Tasks

Last updated: 2026-04-13 (session 2)

Status legend: ✅ Done | 🔄 In progress | ❌ Blocked | ⬜ Not started

---

## Phase 0: Skeleton and Contracts ✅ COMPLETE

- [x] T-001 — Spec ingestion + CURRENT_STATE/GAP_ANALYSIS/SPEC_TRACEABILITY
- [x] T-002 — pyproject.toml with all dependencies (mcp, otel, uv-managed)
- [x] T-003 — ids.py: typed ULID IDs, 21 prefixes
- [x] T-004 — models/ (20 Pydantic models)
- [x] T-005 — db/schema.sql (764 lines, all table groups)
- [x] T-006 — db/migrations.py + db/connection.py
- [x] T-007 — events/emitter.py + events/store.py
- [x] T-008 — adapters/base.py (ABC interfaces)
- [x] T-009 — agent_home.py
- [x] T-010 — policy/engine.py skeleton
- [x] T-011 — tests/unit/test_ids.py, test_models.py, test_schema.py

---

## Phase 1: Core Control Plane ✅ COMPLETE

- [x] T-025 — WorkspaceWriter + WorkspaceReadAdapter
- [x] T-026 — ProjectWriter + ProjectReadAdapter
- [x] T-027 — EpicWriter + EpicReadAdapter (writers/epic_writer.py)
- [x] T-028 — IssueWriter + IssueReadAdapter (readers/issue_read.py)
- [x] T-029 — TaskWriter + TaskReadAdapter (readers/task_read.py)
- [x] T-030 — Event log projections + board_items projection
- [x] T-031 — Board CLI (pi board show)
- [x] T-032 — CLI: workspace, project, epic, issue, task, board — all commands implemented
- [x] T-033 — Monitor server (FastAPI + SSE, /api/v1/status, /api/v1/board, etc.)
- [x] T-034 — tests/unit/test_cli_commands.py (17 tests)

---

## Phase 2: Memory + Indexing ✅ COMPLETE

- [x] T-036 — memory/facade.py (write, recall, open_path, get_for_task)
- [x] T-037 — memory/indexing/walker.py (ProjectIngester with .gitignore/.piignore)
- [x] T-038 — memory/indexing/symbol_extractor.py (tree-sitter)
- [x] T-039 — FTS5 memory search (via memories_fts virtual table)
- [x] T-040 — memory/backends/qdrant_backend.py (optional, graceful fallback)
- [x] T-041 — Recall modes: compact, total_ranked, total_timeline, total_sourcemap, semantic
- [x] T-042 — CLI: pi memory recall, pi memory ingest, pi memory write
- [x] T-043 — tests/unit/test_memory.py, test_indexing.py, test_graph_backend.py, test_qdrant_backend.py

---

## Phase 3: Workflows ✅ COMPLETE

- [x] T-045 — workflows/engine/runner.py (DAG runner, 450L, load_run for resumability)
- [x] T-046 — workflows/engine/steps.py (StepExecutor, 217L, all 15 step types)
- [x] T-047 — Handoff packets (models/handoff.py + worker/lifecycle.py)
- [x] T-048 — Artifact contracts (models/artifact.py)
- [x] T-049 — grill-me coded workflow (workflow.yaml + SKILL.md)
- [x] T-050 — write-a-prd coded workflow
- [x] T-051 — prd-to-plan coded workflow
- [x] T-052 — prd-to-issues coded workflow
- [x] T-053 — Workflow resumability (load_run, topological sort, skip completed steps)
- [x] T-054 — tests/unit/test_workflow_engine.py
- [x] T-055 — tests/scenarios/test_grill_me.py

---

## Phase 4: Routing + Single Worker ✅ COMPLETE

- [x] T-056 — routing/roles.py: role vocabulary, L1 check, can_invoke_team
- [x] T-057 — routing/router.py: role→PI profile mapping
- [x] T-058 — worker/lifecycle.py: single-worker start/complete/block/heartbeat
- [x] T-059 — worker/pi_adapter.py: auto_configure with RoutingAdapter
- [x] T-060 — CLI: pi agent status/list/blockers/session/artifacts/heartbeats/tail
- [x] T-061 — tests/unit/test_routing.py
- [x] T-062 — tests/scenarios/test_single_agent_impl.py

---

## Phase 5: Teams ✅ COMPLETE

- [x] T-063 — teams/template.py: TeamTemplateWriter + TeamInstanceWriter
- [x] T-064 — L1-only invocation gate (PolicyDeniedError if not chief_of_staff)
- [x] T-065 — team_templates and team_instances DB tables + projections
- [x] T-066 — tests/unit/test_teams.py (5 tests: template CRUD, L1 gate, all non-L1 roles)
- [x] T-067 — teams/scheduler.py: TeamScheduler with global/per-project/per-template caps
- [x] T-068 — monitor /api/v1/teams endpoint + pi team instances/concurrency CLI

---

## Phase 6: Worktrees + Integration ✅ MOSTLY COMPLETE

- [x] T-069 — worktrees/allocator.py (git worktree create/cleanup/validate)
- [x] T-070 — worktrees/merge_queue.py (enqueue/merge/list_queued, policy-gated)
- [x] T-071 — worktrees/integration_worker.py (artifact gates, drain, process_next)
- [x] T-072 — Non-git sequential fallback (write_mode=sequential in ProjectWriter)
- [x] T-073 — tests/unit/test_worktrees.py
- [x] T-074 — tests/scenarios/test_team_feature_build.py
- [x] T-075 — pi queue show/drain CLI commands (cli/commands/queue.py)
- [x] T-076 — tests/unit/test_integration_worker.py (8 tests)

---

## Phase 7: Security + Policy ✅ COMPLETE

- [x] T-077 — policy/engine.py: full deny-rule evaluation (all matcher types)
- [x] T-078 — policy/secret_guard.py: detection + redaction
- [x] T-079 — Pre-execution hooks: Claude PreToolUse, Gemini BeforeTool
- [x] T-080 — Audit log via events table (all policy decisions emitted)
- [x] T-081 — L1-only team invocation enforced in policy + routing layers
- [x] T-082 — tests/unit/test_policy.py
- [x] T-083 — tests/scenarios/test_deny_rule_trip.py

---

## Phase 8: Plane Adapter ✅ COMPLETE

- [x] T-084 — sync/plane_adapter.py (3-layer: mapping + transport + sync-policy)
- [x] T-085 — sync/sync_manager.py (sync state tracking)
- [x] T-086 — Local-wins conflict handling
- [x] T-087 — Secret guard in sync payloads
- [x] T-088 — tests/unit/test_plane_adapter.py (unit level)
- [x] T-089 — tests/scenarios/test_plane_sync_conflict.py
- [x] T-090 — adapters/readers/sync_read.py: SyncStateReadAdapter + SyncConflictReadAdapter

---

## Phase 9: Analytics + Monitor ✅ MOSTLY COMPLETE

- [x] T-091 — analytics/metrics.py (burndown, flow metrics, WIP, cycle time)
- [x] T-092 — monitor/server.py (FastAPI + SSE, 8 views, 242L)
- [x] T-093 — tests/unit/test_analytics.py
- [x] T-094 — forecasting_advisory() in MetricsService
- [x] T-095 — per_role_metrics() in MetricsService
- [x] T-096 — memory_effectiveness() in MetricsService

---

## Phase 10: External CLI Agent Integration ✅ COMPLETE

- [x] T-097 — mcp/server.py: FastMCP "pi-os" server, 7 tools
- [x] T-098 — hooks/claude_hook.py: Claude PreToolUse command hook
- [x] T-099 — hooks/gemini_hook.py: Gemini BeforeTool hook
- [x] T-100 — telemetry/spans.py: OTel agent_span (GenAI conventions)
- [x] T-101 — OTel instrumentation on PIRPCBridge, ClaudeCLIAdapter, GeminiCLIAdapter
- [x] T-102 — cos_context.py: CoSContextBuilder for stateless CoS coherence
- [x] T-103 — agent-integration/claude/ install package
- [x] T-104 — agent-integration/gemini/ install package
- [x] T-105 — cli/commands/serve.py: pi serve mcp|hooks|all
- [x] T-106 — Tests: test_mcp_server, test_claude_hook, test_telemetry, test_cos_wiring, test_cli_serve

---

## Golden Scenarios

- [x] T-110 — Scenario: grill-me planning flow (test_grill_me.py)
- [x] T-111 — Scenario: single-agent implementation (test_single_agent_impl.py)
- [x] T-112 — Scenario: team feature build (test_team_feature_build.py)
- [x] T-113 — Scenario: deny-rule trip (test_deny_rule_trip.py)
- [x] T-114 — Scenario: Plane sync drift/conflict (test_plane_sync_conflict.py)
- [x] T-115 — test_research_only.py (3 tests: observable run, memory write, no team)
- [x] T-116 — test_non_git_project.py (5 tests: sequential mode, no worktrees, lifecycle)
- [x] T-117 — test_submodule_project.py (10 tests: type, parent link, board isolation)

---

## Open Items

All originally tracked items are now implemented. No open items remain.

---

## Test Coverage Summary

| Phase | Tests | Status |
|-------|-------|--------|
| 0 Skeleton | test_ids, test_models, test_schema | ✅ |
| 1 Control Plane | test_cli_commands | ✅ |
| 2 Memory | test_memory, test_indexing, test_graph_backend, test_qdrant_backend | ✅ |
| 3 Workflows | test_workflow_engine, test_grill_me | ✅ |
| 4 Routing | test_routing, test_single_agent_impl | ✅ |
| 5 Teams | test_teams | ✅ |
| 6 Worktrees | test_worktrees, test_team_feature_build | ✅ |
| 7 Policy | test_policy, test_deny_rule_trip | ✅ |
| 8 Plane | test_plane_adapter, test_plane_sync_conflict | ✅ |
| 9 Analytics | test_analytics | ✅ |
| 10 CLI Integration | test_mcp_server, test_claude_hook, test_telemetry, test_cos_wiring, test_cli_serve | ✅ |

**Total: 219 tests, 219 passing.**
