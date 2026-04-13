# Implementation Plan

Version: 0.1  
Date: 2026-04-12  
Aligned to: spec v0.1 §26 (Phased Implementation Plan)

---

## Technology Stack

| Layer | Choice |
|---|---|
| Language | Python 3.12+ |
| Package manager | uv |
| Data models | Pydantic v2 |
| CLI | Typer |
| Web monitor | FastAPI + SSE |
| Operational DB | SQLite (stdlib sqlite3 + aiosqlite) |
| FTS | SQLite FTS5 |
| Vector DB | Qdrant (local/embedded) |
| Embeddings | sentence-transformers (all-MiniLM-L6-v2) |
| Graph memory | graphiti-core (with SQLite fallback) |
| Code parsing | tree-sitter + tree-sitter-languages |
| Typed IDs | python-ulid + typed prefixes |
| HTTP client | httpx |
| Plane API | httpx → Plane REST API |

---

## Repository Structure

```
pi-stack-plan/
├── src/
│   └── pi_agent_os/
│       ├── __init__.py
│       ├── ids.py                    # Typed prefixed ULID IDs
│       ├── agent_home.py             # Agent-home init + paths
│       ├── config.py                 # Config loading
│       ├── models/                   # Pydantic models
│       │   ├── __init__.py
│       │   ├── workspace.py
│       │   ├── project.py
│       │   ├── epic.py
│       │   ├── issue.py
│       │   ├── task.py
│       │   ├── prd.py
│       │   ├── plan.py
│       │   ├── agent_run.py
│       │   ├── worktree.py
│       │   ├── review.py
│       │   ├── artifact.py
│       │   ├── memory.py
│       │   ├── handoff.py
│       │   ├── team.py
│       │   ├── workflow.py
│       │   ├── policy.py
│       │   ├── sync.py
│       │   └── events.py
│       ├── db/                       # SQLite layer
│       │   ├── __init__.py
│       │   ├── connection.py
│       │   ├── migrations.py
│       │   ├── schema.sql
│       │   └── queries/
│       ├── events/                   # Event system
│       │   ├── __init__.py
│       │   ├── emitter.py
│       │   └── store.py
│       ├── adapters/                 # Read/write adapters
│       │   ├── __init__.py
│       │   ├── base.py
│       │   ├── writers/
│       │   └── readers/
│       ├── memory/                   # Memory facade
│       │   ├── __init__.py
│       │   ├── facade.py
│       │   ├── writer.py
│       │   ├── recall.py
│       │   ├── backends/
│       │   │   ├── sqlite_graph.py
│       │   │   └── graphiti.py
│       │   └── indexing/
│       │       ├── pipeline.py
│       │       ├── file_walker.py
│       │       ├── parser.py
│       │       └── embedder.py
│       ├── policy/                   # Policy engine
│       │   ├── __init__.py
│       │   ├── engine.py
│       │   ├── rules.py
│       │   └── secret_guard.py
│       ├── workflows/                # Workflow engine
│       │   ├── __init__.py
│       │   ├── engine.py
│       │   ├── runner.py
│       │   ├── steps.py
│       │   └── handoff.py
│       ├── routing/                  # Role mapping + routing
│       │   ├── __init__.py
│       │   ├── roles.py
│       │   └── router.py
│       ├── worker/                   # Worker lifecycle
│       │   ├── __init__.py
│       │   ├── lifecycle.py
│       │   └── pi_adapter.py
│       ├── teams/                    # Team system
│       │   ├── __init__.py
│       │   ├── template.py
│       │   └── instance.py
│       ├── worktrees/                # Git worktree management
│       │   ├── __init__.py
│       │   ├── allocator.py
│       │   └── merge_queue.py
│       ├── sync/                     # Plane adapter
│       │   ├── __init__.py
│       │   ├── plane_adapter.py
│       │   └── sync_manager.py
│       ├── monitor/                  # Observability + monitor server
│       │   ├── __init__.py
│       │   ├── server.py
│       │   └── views.py
│       ├── analytics/                # Metrics + burndown
│       │   ├── __init__.py
│       │   └── metrics.py
│       └── cli/                      # CLI commands
│           ├── __init__.py
│           ├── main.py
│           ├── commands/
│           │   ├── workspace.py
│           │   ├── project.py
│           │   ├── issue.py
│           │   ├── task.py
│           │   ├── agent.py
│           │   ├── board.py
│           │   ├── memory.py
│           │   ├── workflow.py
│           │   └── monitor.py
├── workflows/                        # Coded workflow definitions
│   ├── grill-me/
│   │   ├── SKILL.md
│   │   ├── workflow.yaml
│   │   ├── schemas/
│   │   └── templates/
│   ├── write-a-prd/
│   ├── prd-to-plan/
│   └── prd-to-issues/
├── agent-home-template/              # Reference agent-home layout
├── tests/
│   ├── unit/
│   ├── integration/
│   └── scenarios/
├── scripts/
│   ├── bootstrap.sh
│   └── init_agent_home.py
├── pyproject.toml
├── uv.lock (generated)
└── [documentation files]
```

---

## Phase 0: Skeleton and Contracts (Wave 1)

**Goal:** All interfaces defined, schema complete, basic read/write for main objects working.

### Deliverables
- [ ] pyproject.toml with all dependencies
- [ ] src/pi_agent_os/ids.py — typed ULID IDs, all 21 prefixes
- [ ] src/pi_agent_os/models/ — all 20 Pydantic models
- [ ] src/pi_agent_os/db/schema.sql — all table groups
- [ ] src/pi_agent_os/db/migrations.py — migration runner
- [ ] src/pi_agent_os/events/emitter.py — event emission + storage
- [ ] src/pi_agent_os/adapters/base.py — adapter interfaces (ABC)
- [ ] src/pi_agent_os/agent_home.py — agent-home init + paths
- [ ] src/pi_agent_os/policy/engine.py — policy skeleton
- [ ] tests/unit/test_ids.py
- [ ] tests/unit/test_models.py
- [ ] tests/unit/test_schema.py

### Exit criteria
- All objects create/read/update
- Basic read adapters work
- Static monitor shows current state
- Tests pass

---

## Phase 1: Core Control Plane (Wave 2)

**Goal:** Full GitHub-like workflow model functional.

### Deliverables
- [ ] WorkspaceWriter + WorkspaceReadAdapter
- [ ] ProjectWriter + ProjectReadAdapter
- [ ] EpicWriter + EpicReadAdapter
- [ ] IssueWriter + IssueReadAdapter
- [ ] TaskWriter + TaskReadAdapter
- [ ] Event log projections
- [ ] Board projection + update logic
- [ ] CLI: `pi workspace`, `pi project`, `pi issue`, `pi task`, `pi board`
- [ ] Monitor basic views (global state)
- [ ] tests/unit/test_control_plane.py
- [ ] tests/integration/test_issue_workflow.py

---

## Phase 2: Memory + Indexing (Wave 3)

**Goal:** Project/code memory ingestion works, recall APIs functional.

### Deliverables
- [ ] src/pi_agent_os/memory/facade.py
- [ ] src/pi_agent_os/memory/indexing/pipeline.py
- [ ] File walker with .gitignore + .piignore/.piinclude
- [ ] tree-sitter symbol extraction
- [ ] FTS5 memory search
- [ ] Qdrant vector search (optional/stubbed)
- [ ] Recall modes (compact, total ranked, timeline, sourcemap)
- [ ] Memory kinds + scope handling
- [ ] CLI: `pi memory recall`, `pi memory ingest`
- [ ] tests/unit/test_memory.py
- [ ] tests/integration/test_ingestion.py

---

## Phase 3: Workflows (Wave 4)

**Goal:** Planning flows run end-to-end.

### Deliverables
- [ ] Thin DAG workflow runner
- [ ] All 15 step types implemented
- [ ] Human-input step (first-class)
- [ ] Handoff packets
- [ ] Artifact contracts + validation
- [ ] grill-me coded workflow
- [ ] write-a-prd coded workflow
- [ ] prd-to-plan coded workflow
- [ ] prd-to-issues coded workflow
- [ ] Workflow resumability
- [ ] tests/unit/test_workflow_engine.py
- [ ] tests/scenarios/test_grill_me.py

---

## Phase 4: Routing + Single Worker (Wave 5)

**Goal:** L1 routes correctly, runs observable and queryable.

### Deliverables
- [ ] Role vocabulary implementation
- [ ] PI profile mapping (adapter interface)
- [ ] Routing logic + fallback chains
- [ ] Single-worker lifecycle
- [ ] Live status without LLM (heartbeat, current step, blocker)
- [ ] CLI: `pi agent status`, `pi agent tail`, `pi agent blockers`
- [ ] tests/unit/test_routing.py
- [ ] tests/scenarios/test_single_agent.py

---

## Phase 5: Teams + Orchestration (Wave 5)

**Goal:** Teams run correctly, visible and governed.

### Deliverables
- [ ] TeamTemplate with slot-based composition
- [ ] TeamInstance with slot resolution
- [ ] Concurrency caps (per-slot, per-team, per-project, global)
- [ ] L1-only team invocation enforcement
- [ ] Team monitor views
- [ ] Cross-team scheduler stub
- [ ] tests/unit/test_teams.py

---

## Phase 6: Worktrees + Integration (Wave 6)

**Goal:** Git-backed parallel write flow works safely.

### Deliverables
- [ ] Worktree allocator (git worktree create/cleanup)
- [ ] Merge queue
- [ ] Integration worker
- [ ] Review + test artifact gates
- [ ] Conflict handling (agent-first, then escalate)
- [ ] Non-git sequential fallback
- [ ] Submodule-aware project handling
- [ ] tests/unit/test_worktrees.py
- [ ] tests/scenarios/test_team_feature_build.py

---

## Phase 7: Security + Policy (Wave 7)

**Goal:** Deterministic blocking, audit visible, all invariants enforced.

### Deliverables
- [ ] Full deny rule evaluation (all matcher types)
- [ ] Secret guard (detection + redaction)
- [ ] Pre-execution enforcement hooks
- [ ] Audit log views
- [ ] PolicyReadAdapter, PolicyDecisionReadAdapter, SecretEventReadAdapter, BoundaryViolationReadAdapter
- [ ] L1-only team invocation in policy engine
- [ ] tests/unit/test_policy.py
- [ ] tests/scenarios/test_deny_rule_trip.py

---

## Phase 8: Plane Adapter (Wave 8)

**Goal:** Plane reflects local planning state; local stays authoritative.

### Deliverables
- [ ] PlaneAdapter (mapping + transport + sync-policy layers)
- [ ] Sync state tracking per object
- [ ] Conflict handling (local wins)
- [ ] Artifact summary sync (no raw content)
- [ ] No secret sync guard
- [ ] SyncStateReadAdapter, SyncConflictReadAdapter
- [ ] tests/unit/test_plane_adapter.py
- [ ] tests/scenarios/test_plane_sync.py

---

## Phase 9: Analytics + Polish (Wave 8)

**Goal:** Monitor gives useful operational insight.

### Deliverables
- [ ] Issue/task burndown
- [ ] Flow metrics (cycle time, lead time, blocked duration)
- [ ] Quality/integration metrics
- [ ] Agent/orchestration metrics
- [ ] Memory effectiveness analytics
- [ ] All 8 monitor views
- [ ] Forecasting advisory stubs
- [ ] tests/unit/test_analytics.py

---

## Phase 10: External CLI Agent Integration (Spec §3.6) ✅ COMPLETE

**Goal:** Wire Claude CLI and Gemini CLI as first-class chat providers alongside PI, with
MCP-namespaced control plane tools, pre-execution hook interception, OTel observability,
and CoS world-state coherence.

### Deliverables
- [x] `mcp>=1.0` + `opentelemetry-*` dependencies added (`pyproject.toml`)
- [x] `src/pi_agent_os/mcp/server.py` — FastMCP server `pi-os` with 7 tools:
  `list_tasks`, `create_task`, `update_task`, `recall_memory`, `write_memory`,
  `list_agent_profiles`, `get_agent_run_status`
- [x] `src/pi_agent_os/mcp/__main__.py` — `python -m pi_agent_os.mcp.server` entry point
- [x] `src/pi_agent_os/hooks/claude_hook.py` — Claude `PreToolUse` command hook
- [x] `src/pi_agent_os/hooks/gemini_hook.py` — Gemini `BeforeTool` command hook
- [x] `src/pi_agent_os/telemetry/spans.py` — `agent_span()` OTel context manager (GenAI conventions)
- [x] OTel instrumentation on `PIRPCBridge`, `ClaudeCLIAdapter`, `GeminiCLIAdapter`
- [x] `CoSContextBuilder` world-state injection wired into `WorkerLifecycle.start()` for `chief_of_staff`
- [x] `agent-integration/claude/` — `CLAUDE.md`, `.mcp.json`, hook settings snippet, `install.sh`
- [x] `agent-integration/gemini/` — `GEMINI.md`, `gemini-extension.json`, `install.sh`
- [x] `src/pi_agent_os/cli/commands/serve.py` — `pi serve mcp|hooks|all` commands
- [x] Tests: `test_mcp_server.py`, `test_claude_hook.py`, `test_telemetry.py`, `test_cos_wiring.py`, `test_cli_serve.py`

### Install
```bash
bash agent-integration/claude/install.sh   # Claude Code integration
bash agent-integration/gemini/install.sh   # Gemini CLI integration
pi serve mcp                               # Start MCP server (stdio, default)
pi serve hooks                             # Start HTTP hook server (port 7100)
```

### Agent model spec examples
```yaml
# Use Claude CLI for this agent (Claude Code OAuth, no API billing)
models: claude-cli/claude-sonnet-4-6

# Use Gemini CLI for this agent
models: gemini-cli/gemini-2.5-pro

# Use PI native (default)
models: opencode/big-pickle
```
