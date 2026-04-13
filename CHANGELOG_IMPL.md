# Implementation Changelog

## [0.5.0] — 2026-04-13 (Session 5: PI Agent OS Cockpit)

### Added

- **`agent-integration/pi/cockpit/index.ts`**: Full TypeScript cockpit extension (~550 lines)
  - Config discovery: walks up to 6 parent dirs for `.pi-os.json`; falls back to `PI_OS_WORKSPACE_ID` / `PI_OS_PROJECT_ID` / `PI_OS_PORT` env vars
  - `startServer()`: spawns `python -m pi_agent_os.monitor --port PORT`; polls readiness for up to 15 s; notifies on up
  - `refreshStatus()`: polls `/api/v1/status?workspace_id=...` every 5 s
  - **Dashboard widget** (`ctx.ui.setWidget()`): header with server health dot + clickable monitor URL, summary row (running/blocked/WIP), per-agent lines with role/run_id/progress%/step, blocked agents with reason, workspace/project tail
  - **Footer** (`ctx.ui.setFooter()`): `● PI-OS  N run  N blocked  WIP:N  :PORT`
  - **ANSI helpers**: GREEN / YELLOW / RED / CYAN / BLUE / MUTED
  - **11 slash commands**: `/pi-status`, `/pi-start`, `/pi-monitor`, `/pi-tasks [status]`, `/pi-create <title>`, `/pi-run <task_id> <role>`, `/pi-complete <run_id> [summary]`, `/pi-block <run_id> <reason>`, `/pi-recall <query>`, `/pi-workspaces`, `/cos <goal>`
  - **11 LLM tools** (`pi.registerTool()`): `pi_os_list_tasks`, `pi_os_create_task`, `pi_os_update_task`, `pi_os_recall_memory`, `pi_os_write_memory`, `pi_os_start_run`, `pi_os_heartbeat`, `pi_os_complete_run`, `pi_os_block_run`, `pi_os_workspace_status`, `pi_os_build_cos_context`
  - **Policy hook**: `pi.on("tool_call")` → calls `/api/v1/control/policy/check` for all non-`pi_os_*` tools; blocks on deny
  - `pi.on("session_start")` auto-starts server + registers everything; `pi.on("session_shutdown")` stops server + interval

- **`agent-integration/pi/cockpit/package.json`**: npm-publishable manifest
  - `name: "pi-os-cockpit"`, `"keywords": ["pi-package", "pi-os", "agent-os"]`
  - `"pi": { "extensions": ["./index.ts"] }` for PI discovery
  - `peerDependencies`: `@mariozechner/pi-coding-agent`, `@mariozechner/pi-tui`, `@sinclair/typebox`

- **`src/pi_agent_os/monitor/control.py`**: FastAPI control plane REST API (13 endpoints)
  - `APIRouter(prefix="/api/v1/control")` mounted on existing monitor app
  - Read: `GET /workspaces`, `GET /projects`, `GET /tasks`
  - Write: `POST /tasks`, `PATCH /tasks/{task_id}`
  - Run lifecycle: `POST /runs`, `POST /runs/{run_id}/heartbeat`, `POST /runs/{run_id}/complete`, `POST /runs/{run_id}/block`
  - Memory: `POST /memory/recall`, `POST /memory/write`
  - CoS: `POST /cos-context`
  - Policy: `POST /policy/check`
  - All write operations delegate to `mcp.server` functions (single source of truth)
  - SQLite column aliasing: `SELECT id as workspace_id FROM workspaces`

- **`src/pi_agent_os/monitor/server.py`**: Control router mounted; version bumped to 0.2.0
- **`src/pi_agent_os/monitor/__main__.py`**: `python -m pi_agent_os.monitor` entry point (avoids `pi` binary naming conflict)
- **`pyproject.toml`**: Added `pi-os` as secondary script alias for the Python CLI
- **`agent-integration/pi/cockpit/README.md`**: Full install/config/usage documentation
- **`agent-integration/pi/pi-os.extension.json`**: Updated note — real extension is `./cockpit/index.ts`

- **`tests/unit/test_control_api.py`**: 12 tests covering all control plane endpoints

### Fixed (bugs found during cockpit work)

- **`monitor/control.py`**: `workspaces.id` column aliased as `workspace_id` in SQL (`SELECT id as workspace_id`)
- **`monitor/control.py`**: `projects.id` column aliased as `project_id` in SQL (`SELECT id as project_id`)

### Total tests: 251 passing, 1 skipped

---

## [0.4.0] — 2026-04-13 (Session 4: PI Native Extension)

### Added

- **`agent-integration/pi/`**: PI native extension package
  - `pi-os.extension.json`: PI extension manifest — MCP server subprocess, BeforeTool hook, `lifecycleTools` map pointing to the 6 runtime tools
  - `PI.md`: Context rules for PI agents — tool namespace, role boundaries, lifecycle call sequence, CoS JSON format
  - `install.sh`: Installs to `~/.pi/extensions/` (or `$PI_EXTENSIONS_DIR`)

- **`src/pi_agent_os/hooks/pi_hook.py`**: PI BeforeTool hook
  - Normalises PI camelCase event shape (`sessionId`, `toolName`, `toolInput`, `runId`) to canonical hook shape
  - Falls back to snake_case fields when PI sends those instead
  - Passes `role` and `run_id` through for richer policy context
  - Delegates to `handle_hook()` from `claude_hook` (shared logic)

- **`src/pi_agent_os/mcp/server.py`**: 6 new lifecycle/status MCP tools (total: 13)
  - `start_agent_run(task_id, agent_role, workspace_id, project_id, worktree_path, pi_run_id)` — creates AgentRun + emits `agent_run_started`
  - `heartbeat_agent_run(run_id, workspace_id, current_step, progress_pct)` — calls `AgentRunWriter.heartbeat()`
  - `complete_agent_run(run_id, workspace_id, output_summary, artifact_paths)` — updates status to `finished`
  - `block_agent_run(run_id, workspace_id, reason)` — updates status to `blocked` + stores blocker
  - `build_cos_context(goal, project_id, workspace_id, max_tasks, max_events)` — returns world-state markdown for CoS injection
  - `get_workspace_status(workspace_id)` — single-call snapshot: active runs, blockers, queue depth, WIP

- **`tests/unit/test_pi_hook.py`**: 6 tests for PI hook (camelCase normalisation, allow/deny, empty/invalid stdin, snake_case fallback)
- **`tests/unit/test_mcp_server.py`**: 13 tests added for lifecycle tools (8 new lifecycle + 5 original → 21 total in file)

### Fixed (bugs found during PI extension work)

- **`mcp/server.py`**: `EventType.agent_started/heartbeat/completed/blocked` → correct names `agent_run_started/progress/finished/blocked`
- **`mcp/server.py`**: `AgentRunWriter.complete()` / `AgentRunWriter.block()` don't exist — replaced with `AgentRunWriter.update()` using `AgentRunStatus.finished` / `AgentRunStatus.blocked`
- **`mcp/server.py`**: `project_id=project_id or None` in `AgentRun()` constructor fails Pydantic validation (`project_id: str` is non-optional) — changed to `project_id or ""`

### Total tests: 228 passing, 1 skipped

---

## [0.3.0] — 2026-04-13 (Session 3: Hardening + Research)

### Fixed (Critical Bugs)

- **`worker/cos_context.py`**: `CoSContextBuilder._memories_section()` called `MemoryFacade.recall()` with nonexistent `scope=`/`scope_id=` kwargs — fixed to `workspace_id=`/`project_id=`.
- **`worker/cos_context.py`**: `CoSResponseParser._apply_memory_notes()` called `MemoryFacade.write()` with `content=note` and `scope_id=` — fixed to correct kwargs (`workspace_id=`, `title=`, `summary=`, `project_id=`).
- **`policy/engine.py`**: `SYSTEM_INVARIANTS` class attribute was dead code — `_load_rules()` only returned DB rules; hardcoded L1-only team invariant was never evaluated. Fixed: `_load_rules()` now prepends system invariant rules at priority=1000 when applicable.
- **`routing/router.py`**: `RouteDecision.fallback_chain` defaulted to `None` — changed to `field(default_factory=list)` to prevent `AttributeError` on `.append()` / iteration.
- **`worktrees/integration_worker.py`**: Artifact gate SQL subquery `SELECT run_id FROM merge_queue_projection WHERE worktree_id=?` returned NULLs for items enqueued without a `run_id`. `IN (NULL)` always evaluates to UNKNOWN in SQL — gates always raised `ArtifactGateError`. Fixed: added `AND run_id IS NOT NULL` to subquery.

### Fixed (Robustness)

- **`db/connection.py`**: Registered explicit `sqlite3.register_adapter(datetime, ...)` and `register_converter()` to eliminate Python 3.12+ DeprecationWarnings. Added `detect_types=sqlite3.PARSE_DECLTYPES` to `connect()`.
- **`db/connection.py`**: Added `threading.Lock()` protecting reads/writes of `_db_path` global to prevent race condition under concurrent thread startup.
- **`events/store.py`**: Added `threading.Lock()` around JSONL file write in `_append_to_log()` to prevent interleaved concurrent writes.
- **`db/migrations.py`**: Changed `conn.execute("INSERT ...")` to `conn.execute("INSERT OR IGNORE ...")` for version recording + split into per-migration commits so partial failures are idempotent.
- **`worker/cos_context.py`**: Replaced fragile bare-JSON fallback regex with brace-depth scanner that handles nested JSON objects. Extracted `_build_decision()` helper.

### Updated (Standards Compliance)

- **`telemetry/spans.py`**: OTel semconv v1.37.0 renamed `gen_ai.system` to `gen_ai.provider.name`. Now emits both for backwards compatibility with older collectors. Added `cache_creation.input_tokens` and `cache_read.input_tokens` to `set_token_usage()` for Anthropic cache accounting. Updated provider name reference values (`gcp.gemini` instead of `google_gemini`).

### Research Applied

Web research on current versions:
- **FastMCP**: Using official `mcp` SDK v1.23.3 (`mcp.server.fastmcp`), not PrefectHQ's separate package. Import paths are stable.
- **OTel semconv**: Applied v1.37.0 rename. All `gen_ai.*` attributes remain Development stability (not Stable).
- **SQLite/uv**: FTS5 available in uv ≥ 0.7.21 (python-build-standalone 20250712 fix). Documented in ASSUMPTIONS.md.
- **sentence-transformers**: v5.x is current; `Asym` module removed. Our usage of `encode()` is stable across v3→v5.
- **Pydantic v2**: All models use `model_config = ConfigDict(...)` pattern. No `.parse_obj()` usage found.

### Documentation

- **CURRENT_STATE.md**: Fully updated to reflect complete implementation state.
- **GAP_ANALYSIS.md**: Updated — all original gaps resolved; hardening gaps H-001..H-011 documented and fixed.
- **VERIFY.md**: Session 3 test run results, hardening fix verifications, updated golden scenario status.
- **CHANGELOG_IMPL.md**: This file.
- **SPEC_TRACEABILITY.md**: Updated to `verified` for all applicable requirements.
- **ASSUMPTIONS.md**: Added entries for uv FTS5, sentence-transformers version, OTel stability status.
- **BLOCKERS.md**: B-001 marked unblocked; updated remaining.

---

## [0.2.0] — 2026-04-13 (Session 2: Full Integration)

### Added

- **Phase 10: External CLI Agent Integration**
  - `mcp/server.py`: FastMCP "pi-os" server, 7 tools (create_task, update_task, list_tasks, recall_memory, write_memory, list_agent_profiles, get_agent_run_status)
  - `hooks/claude_hook.py`: Claude Code PreToolUse command hook
  - `hooks/gemini_hook.py`: Gemini BeforeTool hook
  - `telemetry/spans.py`: OTel agent_span with GenAI semantic conventions
  - `worker/cos_context.py`: CoSContextBuilder + CoSResponseParser for stateless CoS coherence
  - `worker/cli_chat_adapter.py`: ClaudeCLIAdapter + GeminiCLIAdapter + RoutingAdapter
  - `worker/pi_rpc_bridge.py`: PIRPCBridge wrapping PI CLI process
  - `cli/commands/serve.py`: `pi serve mcp|hooks|all`
  - `agent-integration/claude/`: CLAUDE.md, .mcp.json, install.sh
  - `agent-integration/gemini/`: GEMINI.md, gemini-extension.json, install.sh
  - OTel instrumentation on PIRPCBridge, ClaudeCLIAdapter, GeminiCLIAdapter
  - CoS world-state injection in WorkerLifecycle for chief_of_staff runs
  - Tests: test_mcp_server, test_claude_hook, test_gemini_hook, test_telemetry, test_cos_wiring, test_cli_serve

- **Stub CLI commands replaced with real implementations**
  - `cli/commands/project.py`: Full create/list/get/update with ProjectWriter
  - `cli/commands/epic.py`: Full create/list/get/update with EpicWriter
  - `cli/commands/workflow.py`: list/get/run/resume with WorkflowRunner
  - `cli/commands/memory.py`: recall/ingest/write with MemoryFacade
  - `cli/commands/queue.py`: show/drain with IntegrationWorker
  - `cli/commands/sync.py`: status/list/conflicts/queue/drain

- **TeamScheduler** (`teams/scheduler.py`): Global/per-project/per-template concurrency caps, `can_start()`, `concurrency_report()`, `list_running()`
- **IntegrationWorker** (`worktrees/integration_worker.py`): Artifact gate enforcement, role-enforced drain
- **SyncStateReadAdapter + SyncConflictReadAdapter** (`adapters/readers/sync_read.py`)
- **Analytics extensions**: `per_role_metrics()`, `memory_effectiveness()`, `forecasting_advisory()`
- **Monitor server extensions**: `/api/v1/teams`, `/api/v1/analytics/per-role`, `/analytics/memory`, `/analytics/forecast`
- **Tests**: test_team_scheduler (9), test_integration_worker (8), test_sync_read (6)
- **Scenarios**: test_submodule_project (10), test_research_only (4), test_non_git_project (5)

### Total tests: 215 passing, 1 skipped

---

## [0.1.0] — 2026-04-12 (Session 1: Phases 0–9)

### Added (Full initial implementation)

- Phase 0: Skeleton (pyproject.toml, ids.py, models/, db/, events/, adapters/, agent_home.py, policy skeleton)
- Phase 1: Control Plane (workspace/project/epic/issue/task CRUD + board projection + CLI)
- Phase 2: Memory + Indexing (MemoryFacade + FTS5 + QdrantBackend + SQLiteGraphBackend + ProjectIngester + symbol_extractor)
- Phase 3: Workflows (DAG runner + StepExecutor + 4 coded workflows + resumability)
- Phase 4: Routing + Single Worker (Router + WorkerLifecycle + PIRuntimeAdapter + StubPIRuntimeAdapter)
- Phase 5: Teams (TeamTemplateWriter + TeamInstanceWriter + L1-only gate)
- Phase 6: Worktrees + Integration (WorktreeAllocator + MergeQueue + non-git sequential fallback)
- Phase 7: Security + Policy (PolicyEngine deny rules + SecretGuard + PreToolUse/BeforeTool hooks skeleton)
- Phase 8: Plane Adapter (PlaneAdapter + SyncManager + local-wins conflict)
- Phase 9: Analytics + Monitor (MetricsService + FastAPI SSE monitor server)
- All docs: CURRENT_STATE.md, GAP_ANALYSIS.md, SPEC_TRACEABILITY.md, IMPLEMENTATION_PLAN.md, TASKS.md, DECISIONS.log, ASSUMPTIONS.md, BLOCKERS.md, VERIFY.md
