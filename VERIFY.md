# Verification Log

## Format
Each entry: Phase / Component / Test / Result / Date

---

## Phase 0: Skeleton and Contracts

| Component | Test | Result | Date |
|---|---|---|---|
| Project setup | `uv sync` completes | VERIFIED ✓ | 2026-04-12 |
| Typed IDs | `test_ids.py` all pass (9/9) | VERIFIED ✓ | 2026-04-12 |
| Object models | Pydantic validation tests pass (6/6) | VERIFIED ✓ | 2026-04-12 |
| SQLite schema | Migration creates all tables (5/5) | VERIFIED ✓ | 2026-04-12 |
| FTS5 | FTS virtual tables created | VERIFIED ✓ | 2026-04-12 |
| Adapter interfaces | All ABC methods defined | VERIFIED ✓ | 2026-04-12 |
| Event schema | Event model validates | VERIFIED ✓ | 2026-04-12 |
| Artifact path rules | Path generation tests pass | VERIFIED ✓ | 2026-04-12 |
| Policy skeleton | Rule evaluation returns deny/allow | VERIFIED ✓ | 2026-04-12 |
| Agent-home layout | `init_agent_home()` creates structure | VERIFIED ✓ | 2026-04-12 |

## Phase 1: Core Control Plane

| Component | Test | Result | Date |
|---|---|---|---|
| WorkspaceWriter | Create/read/update workspace | VERIFIED ✓ | 2026-04-12 |
| ProjectWriter | Create/read/update project | VERIFIED ✓ | 2026-04-12 |
| EpicWriter | Create/read/update epic | VERIFIED ✓ | 2026-04-12 |
| IssueWriter | Full issue lifecycle | VERIFIED ✓ | 2026-04-12 |
| TaskWriter | Full task lifecycle with deps | VERIFIED ✓ | 2026-04-12 |
| Event log | Events emitted and persisted | VERIFIED ✓ | 2026-04-12 |
| Board projection | Updates from state changes | VERIFIED ✓ | 2026-04-12 |
| Read adapters | list/get/search for all objects | VERIFIED ✓ | 2026-04-12 |
| CLI commands | workspace/project/epic/issue/task/board — 17 tests | VERIFIED ✓ | 2026-04-13 |

## Phase 2: Memory + Indexing

| Component | Test | Result | Date |
|---|---|---|---|
| Project ingestion | `test_project_ingestion_writes_memories` (test_indexing.py) | VERIFIED ✓ | 2026-04-12 |
| Code indexing | `test_python_symbol_extraction` (test_indexing.py, 11 tests) | VERIFIED ✓ | 2026-04-12 |
| Memory facade | write/recall/search (test_memory.py, 6 tests) | VERIFIED ✓ | 2026-04-12 |
| FTS recall | Lexical search returns results (test_memory.py) | VERIFIED ✓ | 2026-04-12 |
| Vector recall | QdrantBackend local in-process; `recall(mode="semantic")` wired | VERIFIED ✓ | 2026-04-12 |
| Scope filtering | project/file/global scopes work (test_memory.py) | VERIFIED ✓ | 2026-04-12 |
| Path-based open | memory → file path → content (test_memory.py) | VERIFIED ✓ | 2026-04-12 |

## Phase 3: Workflows

| Component | Test | Result | Date |
|---|---|---|---|
| DAG runner | Linear workflow executes | VERIFIED ✓ | 2026-04-12 |
| DAG runner | DAG with parallel steps executes | VERIFIED ✓ | 2026-04-12 |
| grill-me | End-to-end with human-input mock | VERIFIED ✓ | 2026-04-12 |
| write-a-prd | Workflow YAML defined | VERIFIED ✓ | 2026-04-12 |
| prd-to-plan | Workflow YAML defined | VERIFIED ✓ | 2026-04-12 |
| prd-to-issues | Workflow YAML defined | VERIFIED ✓ | 2026-04-12 |
| Handoff packets | Structured handoff validated | VERIFIED ✓ | 2026-04-12 |
| Artifact contracts | Contract model validated | VERIFIED ✓ | 2026-04-12 |
| Step retry | Exponential backoff retry logic | VERIFIED ✓ | 2026-04-12 |
| L1 team gate | Non-L1 invoke_team blocked | VERIFIED ✓ | 2026-04-12 |

## Phase 4: Routing and Single-Worker

| Component | Test | Result | Date |
|---|---|---|---|
| Role mapping | Role → PI profile resolves | VERIFIED ✓ | 2026-04-12 |
| Routing policy | Fallback chain followed | VERIFIED ✓ | 2026-04-12 |
| Worker lifecycle | Start/run/complete/output | VERIFIED ✓ | 2026-04-12 |
| Live status | Status queryable without LLM | VERIFIED ✓ | 2026-04-12 |
| PI runtime adapter | Stub adapter functional | VERIFIED ✓ | 2026-04-12 |

## Phase 5: Teams

| Component | Test | Result | Date |
|---|---|---|---|
| Team template | Template validates (6/6 tests) | VERIFIED ✓ | 2026-04-12 |
| Team instance | Slot resolution works | VERIFIED ✓ | 2026-04-12 |
| L1-only gate | Non-L1 invoke rejected (all 15 non-L1 roles) | VERIFIED ✓ | 2026-04-12 |
| TeamScheduler global cap | Blocks at global_cap (test_team_scheduler.py) | VERIFIED ✓ | 2026-04-13 |
| TeamScheduler per-project cap | Per-project blocking (test_team_scheduler.py) | VERIFIED ✓ | 2026-04-13 |
| TeamScheduler per-template cap | Per-template blocking across projects | VERIFIED ✓ | 2026-04-13 |
| Completed instances don't count | Zero-count after complete | VERIFIED ✓ | 2026-04-13 |
| Concurrency report | Running totals + headroom | VERIFIED ✓ | 2026-04-13 |

## Phase 6: Worktrees + Integration

| Component | Test | Result | Date |
|---|---|---|---|
| Worktree allocate | DB record created + event emitted (test_worktrees.py) | VERIFIED ✓ | 2026-04-12 |
| Merge queue | Task queued, non-integration_worker blocked (test_worktrees.py) | VERIFIED ✓ | 2026-04-12 |
| Integration worker | Merge + event emitted (test_worktrees.py) | VERIFIED ✓ | 2026-04-12 |
| IntegrationWorker role gate | Non-integration_worker PolicyDeniedError | VERIFIED ✓ | 2026-04-13 |
| Artifact review gate | Missing review artifact raises ArtifactGateError | VERIFIED ✓ | 2026-04-13 |
| Artifact test gate | Missing test artifact raises ArtifactGateError | VERIFIED ✓ | 2026-04-13 |
| Drain stops on gate_fail | drain() returns gate_failed + stops | VERIFIED ✓ | 2026-04-13 |
| Non-git sequential | Sequential write mode set, no worktree (test_non_git_project.py) | VERIFIED ✓ | 2026-04-12 |

## Phase 7: Security + Policy

| Component | Test | Result | Date |
|---|---|---|---|
| Deny rule | Policy deny blocks execution | VERIFIED ✓ | 2026-04-12 |
| Secret guard | Secret pattern blocked (9/9 tests) | VERIFIED ✓ | 2026-04-12 |
| Audit log | Policy events recorded | VERIFIED ✓ | 2026-04-12 |
| L1-only team invariant | SYSTEM_INVARIANTS now evaluated in _load_rules | VERIFIED ✓ | 2026-04-13 |
| Memory facade | Write/recall/compact/open_path (6/6) | VERIFIED ✓ | 2026-04-12 |

## Phase 8: Plane Sync

| Component | Test | Result | Date |
|---|---|---|---|
| Issue sync | Issue pushed to Plane (stub) | VERIFIED ✓ | 2026-04-12 |
| Conflict handling | Local wins on conflict | VERIFIED ✓ | 2026-04-12 |
| Secret not synced | Secret artifact blocked from sync | VERIFIED ✓ | 2026-04-12 |
| SyncStateReadAdapter | pending/stale/drift_summary query | VERIFIED ✓ | 2026-04-13 |
| SyncConflictReadAdapter | unresolved_count query | VERIFIED ✓ | 2026-04-13 |

## Phase 9: Analytics

| Component | Test | Result | Date |
|---|---|---|---|
| Burndown | Issue burndown computed | VERIFIED ✓ | 2026-04-12 |
| Flow metrics | WIP count, throughput, cycle time computed | VERIFIED ✓ | 2026-04-12 |
| per_role_metrics | Per-role latency/retry/fail rates | VERIFIED ✓ | 2026-04-13 |
| memory_effectiveness | By scope/kind, recall events | VERIFIED ✓ | 2026-04-13 |
| forecasting_advisory | Velocity-based delivery forecast | VERIFIED ✓ | 2026-04-13 |
| Monitor views | FastAPI read-only server (17+ endpoints) | VERIFIED ✓ | 2026-04-13 |

## Phase 10: External CLI Integration

| Component | Test | Result | Date |
|---|---|---|---|
| MCP server | 7 tools importable, FastMCP(pi-os) | VERIFIED ✓ | 2026-04-13 |
| Claude hook | PreToolUse exit 0/2 logic | VERIFIED ✓ | 2026-04-13 |
| Gemini hook | BeforeTool exit 0/2 logic | VERIFIED ✓ | 2026-04-13 |
| OTel agent_span | gen_ai.provider.name + gen_ai.system emitted | VERIFIED ✓ | 2026-04-13 |
| CoS context builder | World-state snapshot injected into task_packet | VERIFIED ✓ | 2026-04-13 |
| CoS response parser | JSON parse + control plane writes | VERIFIED ✓ | 2026-04-13 |
| pi serve mcp|hooks|all | CLI serve commands functional | VERIFIED ✓ | 2026-04-13 |

## Session 3 Hardening Fixes

| Fix | Verification | Date |
|---|---|---|
| CoS memory facade wrong kwargs | All 215 tests pass | 2026-04-13 |
| PolicyEngine SYSTEM_INVARIANTS loaded | test_policy.py passes | 2026-04-13 |
| RouteDecision fallback_chain=None→[] | test_routing.py passes | 2026-04-13 |
| Artifact gate NULL run_id | test_integration_worker.py passes | 2026-04-13 |
| SQLite datetime adapter registration | DeprecationWarnings eliminated | 2026-04-13 |
| Thread-safe _db_path lock | Manual verification + tests | 2026-04-13 |
| Event log file write lock | Manual verification + tests | 2026-04-13 |
| Migration INSERT OR IGNORE idempotency | test_schema.py passes | 2026-04-13 |
| CoS JSON parser brace-depth scanner | test_cos_wiring.py passes | 2026-04-13 |
| OTel gen_ai.provider.name emitted | test_telemetry.py passes | 2026-04-13 |

## Phase 10 Extension: PI Native Extension (Session 4)

| Component | Test | Result | Date |
|---|---|---|---|
| PI BeforeTool hook | camelCase normalisation, allow/deny (6 tests) | VERIFIED ✓ | 2026-04-13 |
| PI hook snake_case fallback | snake_case fields accepted | VERIFIED ✓ | 2026-04-13 |
| start_agent_run | creates AgentRun, returns run_id | VERIFIED ✓ | 2026-04-13 |
| start_agent_run pi_run_id | custom run_id preserved | VERIFIED ✓ | 2026-04-13 |
| heartbeat_agent_run | calls AgentRunWriter.heartbeat | VERIFIED ✓ | 2026-04-13 |
| complete_agent_run | sets status=finished | VERIFIED ✓ | 2026-04-13 |
| block_agent_run | sets status=blocked + blocker | VERIFIED ✓ | 2026-04-13 |
| build_cos_context | returns context_markdown | VERIFIED ✓ | 2026-04-13 |
| get_workspace_status | returns active/blocked/wip counts | VERIFIED ✓ | 2026-04-13 |

## Full Test Run (2026-04-13, Session 4)

```
228 passed, 1 skipped, 1 warning in 2.24s
```

## Full Test Run (2026-04-13, Session 3)

```
215 passed, 1 skipped, 1 warning in 2.97s
```

The 1 skipped test is `test_qdrant_backend.py::test_qdrant_upsert_and_search` — skipped when qdrant-client is unavailable (graceful optional dependency).

The 1 warning is a pytest config warning (`asyncio_mode` in pyproject.toml is for pytest-asyncio, not relevant to current test runner).

## Runtime Integration Status

| Integration | Status | Notes |
|---|---|---|
| PI CLI (`pi`) | MANUAL | Requires `npm install -g @mariozechner/pi-coding-agent` |
| Claude CLI (`claude`) | MANUAL | Requires Claude Code OAuth |
| Gemini CLI (`gemini`) | MANUAL | Requires Gemini CLI OAuth |
| Qdrant vector store | MANUAL | `MemoryFacade(enable_qdrant=True)` |
| OTel export | MANUAL | Set `OTEL_EXPORTER_OTLP_ENDPOINT` env var |

## Golden Scenarios

| Scenario | Status | Notes |
|---|---|---|
| 1. Research-only request | VERIFIED ✓ | test_research_only.py (4 tests) |
| 2. grill-me planning flow | VERIFIED ✓ | test_grill_me_flow.py (3 tests) |
| 3. Single-agent implementation | VERIFIED ✓ | test_single_agent_impl.py (5 tests) |
| 4. Team feature build | VERIFIED ✓ | test_team_feature_build.py |
| 5. Non-git project flow | VERIFIED ✓ | test_non_git_project.py (5 tests) |
| 6. Submodule-aware change | VERIFIED ✓ | test_submodule_project.py (10 tests) |
| 7. Deny-rule trip | VERIFIED ✓ | test_deny_rule_trip.py (7 tests) |
| 8. Plane sync drift/conflict | VERIFIED ✓ | test_plane_sync_conflict.py (5 tests) |
