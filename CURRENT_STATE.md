# Current State

Last updated: 2026-04-13 (session 5)

## Repository Summary

| Field | Value |
|---|---|
| Repo path | /home/mkh/workspace/pi-stack-plan |
| Branch | main |
| Language | Python 3.12+ |
| Package manager | uv |
| Framework | FastAPI (monitor), Typer (CLI), Pydantic v2 (models) |
| Tests | 251 passing, 1 skipped |
| CI/CD | None (local-only) |

## Implementation Status

**All 11 phases fully implemented.** The system is a complete local-first agent OS control plane.

### Phase Completion

| Phase | Description | Status | Tests |
|---|---|---|---|
| 0 | Skeleton + Contracts | ✅ Complete | test_ids, test_models, test_schema |
| 1 | Core Control Plane | ✅ Complete | test_cli_commands (17) |
| 2 | Memory + Indexing | ✅ Complete | test_memory, test_indexing, test_graph_backend, test_qdrant_backend |
| 3 | Workflows | ✅ Complete | test_workflow_engine, test_grill_me |
| 4 | Routing + Single Worker | ✅ Complete | test_routing, test_single_agent_impl |
| 5 | Teams | ✅ Complete | test_teams, test_team_scheduler |
| 6 | Worktrees + Integration | ✅ Complete | test_worktrees, test_integration_worker, test_team_feature_build |
| 7 | Security + Policy | ✅ Complete | test_policy, test_deny_rule_trip |
| 8 | Plane Adapter | ✅ Complete | test_plane_adapter, test_plane_sync_conflict |
| 9 | Analytics + Monitor | ✅ Complete | test_analytics |
| 10 | External CLI Agent Integration | ✅ Complete | test_mcp_server (21), test_claude_hook, test_pi_hook (6), test_telemetry, test_cos_wiring, test_cli_serve |
| 10+ | PI Cockpit Extension | ✅ Complete | test_control_api (12), agent-integration/pi/cockpit/ |

### Golden Scenarios

| Scenario | Status |
|---|---|
| Research-only request | ✅ Automated (test_research_only.py) |
| grill-me planning flow | ✅ Automated (test_grill_me_flow.py) |
| Single-agent implementation | ✅ Automated (test_single_agent_impl.py) |
| Team feature build | ✅ Automated (test_team_feature_build.py) |
| Non-git project flow | ✅ Automated (test_non_git_project.py) |
| Submodule-aware change | ✅ Automated (test_submodule_project.py, 10 tests) |
| Deny-rule trip | ✅ Automated (test_deny_rule_trip.py) |
| Plane sync drift/conflict | ✅ Automated (test_plane_sync_conflict.py) |

## Core Subsystems

### Control Plane
- Workspace / Project / Epic / Issue / Task — full CRUD + read adapters
- Board projection (never canonical truth)
- Event log (append-only, SQLite + JSONL)
- Agent run lifecycle (start/heartbeat/block/complete)

### Memory Plane
- `MemoryFacade` — global/project/file/task-linked memory
- FTS5 lexical search
- Qdrant vector retrieval (optional, graceful fallback)
- SQLiteGraphBackend (temporal/provenance graph)
- ProjectIngester + tree-sitter symbol extractor

### Workflow Plane
- DAG runner with resumability
- 15 step types
- 4 coded workflows: grill-me, write-a-prd, prd-to-plan, prd-to-issues

### Orchestration
- Router (role → PI profile, fallback chain)
- WorkerLifecycle (single worker start/heartbeat/block/complete)
- TeamTemplateWriter + TeamInstanceWriter (L1-only gate enforced)
- TeamScheduler (global/per-project/per-template concurrency caps)
- CoSContextBuilder + CoSResponseParser (stateless CoS coherence)

### Integration + Worktrees
- WorktreeAllocator (git worktree create/cleanup/validate)
- MergeQueue (enqueue/merge/list_queued)
- IntegrationWorker (artifact gates, role-enforced drain)

### Security + Policy
- PolicyEngine (deny rules, SYSTEM_INVARIANTS, default-allow)
- SecretGuard (pattern detection + redaction)
- Claude PreToolUse hook / Gemini BeforeTool hook / PI BeforeTool hook

### Sync
- PlaneAdapter (local-wins conflict, secret guard, async queue)
- SyncManager (state tracking)
- SyncStateReadAdapter + SyncConflictReadAdapter

### Analytics + Monitor
- MetricsService (burndown, cycle time, WIP, throughput, per-role, memory effectiveness, forecast)
- FastAPI monitor server (17+ read-only endpoints, SSE)

### External CLI Integration
- MCP server (`pi-os`, 13 tools: 7 original + 6 lifecycle/status)
- `pi serve mcp|hooks|all` CLI
- OTel spans (GenAI semconv v1.37.0: gen_ai.provider.name)
- `agent-integration/claude/` + `agent-integration/gemini/` + `agent-integration/pi/` install packages
- PI-native extension: `pi-os.extension.json`, `PI.md`, `pi_hook.py`
- Lifecycle tools: `start_agent_run`, `heartbeat_agent_run`, `complete_agent_run`, `block_agent_run`, `build_cos_context`, `get_workspace_status`
- **PI Cockpit** (`agent-integration/pi/cockpit/`): publishable npm package (`pi-os-cockpit`)
  - TypeScript extension with live dashboard widget, footer, monitoring link, auto-server management
  - 11 slash commands, 11 LLM tools, policy hook (`pi.on("tool_call")`)
  - REST control API: 13 endpoints at `/api/v1/control/` (tasks, runs, memory, policy, CoS)
  - `python -m pi_agent_os.monitor` entry point

## PI Runtime

PI CLI is not locally installed. The system uses:
- `PIRPCBridge` for native PI execution when `pi` is in PATH
- `ClaudeCLIAdapter` when `claude` CLI is in PATH
- `GeminiCLIAdapter` when `gemini` CLI is in PATH
- `StubPIRuntimeAdapter` (tests and development)

`auto_configure_pi_runtime()` detects and wires the best available adapter.

## Known Limitations / Remaining Work

1. **PI runtime not locally available** — `StubPIRuntimeAdapter` is used for all tests. Live PI execution requires `npm install -g @mariozechner/pi-coding-agent` + API keys.
2. **No CI pipeline** — tests are run manually with `pytest`.
3. **Qdrant disabled by default** — `enable_qdrant=False` in `MemoryFacade.__init__`. Enable explicitly when needed.
4. **No WebSocket/realtime** — Monitor SSE is one-way push; no bidirectional control channel.
5. **No authentication** on monitor server — designed for local use only.
