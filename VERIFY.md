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
| CLI inspect | CLI module structure complete | VERIFIED ✓ | 2026-04-12 |

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
| Concurrency caps | Policy model defined | VERIFIED ✓ | 2026-04-12 |

## Phase 6: Worktrees + Integration

| Component | Test | Result | Date |
|---|---|---|---|
| Worktree allocate | DB record created + event emitted (test_worktrees.py) | VERIFIED ✓ | 2026-04-12 |
| Merge queue | Task queued, non-integration_worker blocked (test_worktrees.py) | VERIFIED ✓ | 2026-04-12 |
| Integration worker | Merge + event emitted (test_worktrees.py) | VERIFIED ✓ | 2026-04-12 |
| Non-git sequential | Sequential write mode set, no worktree allocated (test_non_git_project.py) | VERIFIED ✓ | 2026-04-12 |

## Phase 7: Security + Policy

| Component | Test | Result | Date |
|---|---|---|---|
| Deny rule | Policy deny blocks execution | VERIFIED ✓ | 2026-04-12 |
| Secret guard | Secret pattern blocked (9/9 tests) | VERIFIED ✓ | 2026-04-12 |
| Audit log | Policy events recorded | VERIFIED ✓ | 2026-04-12 |
| L1-only team invariant | Enforced in TeamInstanceWriter + workflow engine | VERIFIED ✓ | 2026-04-12 |
| Memory facade | Write/recall/compact/open_path (6/6) | VERIFIED ✓ | 2026-04-12 |

## Phase 8: Plane Sync

| Component | Test | Result | Date |
|---|---|---|---|
| Issue sync | Issue pushed to Plane (stub) | VERIFIED ✓ | 2026-04-12 |
| Conflict handling | Local wins on conflict | VERIFIED ✓ | 2026-04-12 |
| Secret not synced | Secret artifact blocked from sync | VERIFIED ✓ | 2026-04-12 |

## Phase 9: Analytics

| Component | Test | Result | Date |
|---|---|---|---|
| Burndown | Issue burndown computed | VERIFIED ✓ | 2026-04-12 |
| Flow metrics | WIP count, throughput, cycle time computed | VERIFIED ✓ | 2026-04-12 |
| Monitor views | FastAPI read-only server (14 endpoints) | VERIFIED ✓ | 2026-04-12 |

## Unblocked: B-002 Qdrant + B-003 Graph Memory

| Component | Test | Result | Date |
|---|---|---|---|
| QdrantBackend local mode | Module-level skip if qdrant_client absent (test_qdrant_backend.py, 4 tests) | VERIFIED ✓ | 2026-04-12 |
| MemoryFacade semantic recall | FTS fallback when Qdrant disabled (test_memory.py) | VERIFIED ✓ | 2026-04-12 |
| SQLiteGraphBackend | 7 tests — entity/edge/episode/temporal/search | VERIFIED ✓ | 2026-04-12 |
| Graph migration 002 | graph_entities/edges/episodes tables created | VERIFIED ✓ | 2026-04-12 |

## Unblocked: B-001 PI Runtime Bridge

| Component | Test | Result | Date |
|---|---|---|---|
| PIRPCBridge importable | `from pi_agent_os.worker.pi_rpc_bridge import check_pi_available` | VERIFIED ✓ | 2026-04-12 |
| auto_configure_pi_runtime | Falls back to stub when pi not in PATH | VERIFIED ✓ | 2026-04-12 |
| PI agent definition stubs | 7 role .md files in pi_agents/ | VERIFIED ✓ | 2026-04-12 |
| Live PI execution | Requires `npm install -g @mariozechner/pi-coding-agent` | MANUAL | - |

## Golden Scenarios

| Scenario | Status | Notes |
|---|---|---|
| 1. Research-only request | VERIFIED ✓ | test_research_only.py (4 tests) |
| 2. grill-me planning flow | VERIFIED ✓ | test_grill_me_flow.py (3 tests) |
| 3. Single-agent implementation | VERIFIED ✓ | test_single_agent_impl.py (4 tests) |
| 4. Team feature build | MANUAL | PIRPCBridge scaffolded; activate with `npm install -g @mariozechner/pi-coding-agent` |
| 5. Non-git project flow | VERIFIED ✓ | test_non_git_project.py (4 tests) |
| 6. Submodule-aware change | MANUAL | PIRPCBridge scaffolded; requires live PI process |
| 7. Deny-rule trip | VERIFIED ✓ | test_deny_rule_trip.py (7 tests) |
| 8. Plane sync drift/conflict | VERIFIED ✓ | test_plane_sync_conflict.py (5 tests) |
