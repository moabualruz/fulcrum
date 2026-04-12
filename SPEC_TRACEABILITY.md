# Spec Traceability Matrix

Version: 0.1  
Generated: 2026-04-12  
Spec: pi_local_first_agent_os_spec.md v0.1

Status legend: `not_started` | `in_progress` | `implemented` | `verified` | `blocked`

---

## §1 Goals

| Req | Description | Target | Status |
|---|---|---|---|
| 1.1.1 | PI as execution host | src/pi_agent_os/worker/pi_adapter.py | not_started |
| 1.1.2 | Local-first and inspectable | All components avoid external deps | not_started |
| 1.1.3 | Reuse PI-native capabilities | PIRuntimeAdapter interface | not_started |
| 1.1.4 | No MCP for core integrations | Architecture constraint — no MCP deps | not_started |
| 1.1.5 | Native tools/local CLIs/REST | httpx, subprocess, local tools | not_started |
| 1.1.6 | Memory first-class (global/project/file) | src/pi_agent_os/memory/ | not_started |
| 1.1.7 | Code/project memory ingestion | src/pi_agent_os/memory/indexing/ | not_started |
| 1.1.8 | Single-agent/workflow/team execution | src/pi_agent_os/worker/, teams/, workflows/ | not_started |
| 1.1.9 | State queryable without LLM | Read adapters + CLI status | not_started |
| 1.1.10 | CLI + read-only web monitor | src/pi_agent_os/cli/, monitor/ | not_started |
| 1.1.11 | Local GitHub-like workflow model | src/pi_agent_os/adapters/, db/ | not_started |
| 1.1.12 | Plane as only external sync target | src/pi_agent_os/sync/ | not_started |

## §3 Runtime Foundations

| Req | Description | Target | Status |
|---|---|---|---|
| 3.1 | PI is authoritative runtime | PIRuntimeAdapter interface | not_started |
| 3.2 | Reuse PI extension capabilities | PIRuntimeAdapter.tasks/subagents/teams | not_started |
| 3.3 | Local web stack (no MCP) | httpx + playwright in worker tools | not_started |
| 3.4 | Local code/project indexing | tree-sitter + FTS + grep | not_started |
| 3.5.1 | SQLite with FTS5 | src/pi_agent_os/db/ | not_started |
| 3.5.2 | Filesystem for artifacts | src/pi_agent_os/agent_home.py | not_started |
| 3.5.3 | Qdrant for vector retrieval | src/pi_agent_os/memory/backends/qdrant.py | not_started |
| 3.5.4 | Graph memory for temporal/provenance | src/pi_agent_os/memory/backends/ | not_started |

## §4 Agent Hierarchy

| Req | Description | Target | Status |
|---|---|---|---|
| 4.1 | L1 Chief of Staff agent | src/pi_agent_os/routing/roles.py | not_started |
| 4.1.H1 | L1 no direct code impl | Policy rule | not_started |
| 4.1.H2 | L1 no project file editing | Policy rule | not_started |
| 4.1.H3 | L1 no merge operations | Policy rule | not_started |
| 4.1.SA1 | Only L1 creates/invokes teams | Policy enforcement | not_started |
| 4.2 | Planning/discovery agents | Role vocabulary | not_started |
| 4.3 | Execution agents | Role vocabulary | not_started |

## §5 Domain Model

| Req | Description | Target | Status |
|---|---|---|---|
| 5.1 | 20 core object types defined | src/pi_agent_os/models/ | not_started |
| 5.2 | Object semantics (Issue≠Task≠Run) | models + adapter separation | not_started |
| 5.3 | Full lifecycle graph | DB schema + status transitions | not_started |
| 5.4 | Project = git/non-git/submodule/logical | ProjectWriter + project model | not_started |
| 5.5 | Workspace = top-level grouping | WorkspaceWriter + model | not_started |
| 5.6 | Epics first-class | EpicWriter + model | not_started |
| 5.7 | Non-git folders supported | ProjectWriter + sequential write mode | not_started |
| 5.8 | Submodules as nested projects | project_submodules relation table | not_started |

## §6 ID Strategy

| Req | Description | Target | Status |
|---|---|---|---|
| 6.1 | Typed prefixed IDs (21 prefixes) | src/pi_agent_os/ids.py | not_started |
| 6.2 | Human display IDs (ISS-143 etc.) | ids.py display ID generation | not_started |
| 6.3 | Artifact filenames include owner ID | ArtifactWriter path generation | not_started |
| 6.4.1 | No object without typed ID | Pydantic model validators | not_started |
| 6.4.2 | No artifact without ownership | artifact model + writer | not_started |
| 6.4.3 | No projection row without backing IDs | DB FK constraints | not_started |

## §7 Status Model

| Req | Description | Target | Status |
|---|---|---|---|
| 7.1 | Issue statuses (7) | models/issue.py enum | not_started |
| 7.2 | Task statuses (8) | models/task.py enum | not_started |
| 7.3 | AgentRun statuses (8) | models/agent_run.py enum | not_started |
| 7.4 | WorkflowRun statuses (9) | models/workflow.py enum | not_started |
| 7.5 | Workflow step statuses (10) | models/workflow.py enum | not_started |
| 7.6 | Review statuses (4) | models/review.py enum | not_started |
| 7.7 | Worktree statuses (5) | models/worktree.py enum | not_started |
| 7.8 | Sync statuses (8) | models/sync.py enum | not_started |
| 7.9 | TeamInstance statuses (9) | models/team.py enum | not_started |

## §8 Storage Architecture

| Req | Description | Target | Status |
|---|---|---|---|
| 8.1 | Canonical split (FS/SQLite/Qdrant/Graph) | db/ + agent_home.py + memory/ | not_started |
| 8.2 | Qdrant/graph NOT control-plane truth | Architecture constraint — enforced by adapters | not_started |
| 8.3 | Global agent-home layout | agent_home.py + agent-home-template/ | not_started |
| 8.4 | All SQLite table groups | db/schema.sql | not_started |
| 8.5 | Qdrant collection strategy | memory/backends/qdrant.py | not_started |
| 8.6 | Graph memory boundaries | memory/backends/ | not_started |
| 8.7 | Schema versioning + migrations table | db/migrations.py | not_started |
| 8.8 | Backup/restore from canonical sources | scripts/backup.sh | not_started |

## §9 Adapter Boundaries

| Req | Description | Target | Status |
|---|---|---|---|
| 9.1 | No direct raw store access (adapters only) | Architecture constraint | not_started |
| 9.2 | 17 write services | adapters/writers/ | not_started |
| 9.3 | 28 read adapters | adapters/readers/ | not_started |
| 9.4 | Minimum interface (get/list/search/related/for_project/for_workspace) | adapters/base.py ABC | not_started |
| 9.5 | Canonical write flow (SQLite→event→projections→FTS/vector/graph) | writers + event emitter | not_started |

## §10 Memory Architecture

| Req | Description | Target | Status |
|---|---|---|---|
| 10.1 | Unified memory fabric (global/project/file) | memory/facade.py | not_started |
| 10.2 | 4 recall modes | memory/recall.py | not_started |
| 10.3 | Default: top 8 compact + fields | recall.py default mode | not_started |
| 10.4 | Path-based full reads | recall.py open_path() | not_started |
| 10.5 | 14 memory kinds | models/memory.py | not_started |
| 10.6 | Memory record fields (20+) | models/memory.py | not_started |
| 10.7 | Hybrid ranking (semantic+lexical+recency+importance) | recall.py rank() | not_started |
| 10.8 | Task→memory write on events | TaskWriter hooks | not_started |
| 10.9 | Code/project ingestion sources | indexing/pipeline.py | not_started |
| 10.10 | .gitignore + .piignore/.piinclude | indexing/file_walker.py | not_started |
| 10.11 | Code indexing pipeline (lexical+AST+symbols) | indexing/parser.py | not_started |
| 10.12 | Ingestion triggers (watch/git-diff/refresh) | indexing/pipeline.py | not_started |

## §11 Task Management + Board

| Req | Description | Target | Status |
|---|---|---|---|
| 11.1 | Issues/Tasks/Subtasks split | models/ + db/ | not_started |
| 11.2 | Board is projection only | projections/ — never primary write target | not_started |
| 11.3 | Typed task dependencies | task_dependencies table + model | not_started |
| 11.4 | Till-done philosophy | TaskWriter + lifecycle | not_started |
| 11.5 | 7 board projection types | projections/ | not_started |
| 11.6 | Board integrates with PRDs/plans/issues/reviews | board_items projection | not_started |
| 11.7 | Estimate fields | task/issue models optional fields | not_started |

## §12 Skills Strategy

| Req | Description | Target | Status |
|---|---|---|---|
| 12.1 | Native skills first | Routing defaults | not_started |
| 12.2 | Coded workflow promotion rule | workflows/engine.py + governance | not_started |
| 12.3 | 4 promoted workflows | workflows/{grill-me,write-a-prd,prd-to-plan,prd-to-issues}/ | not_started |
| 12.4 | Skill repo governance | models/skill.py + registry | not_started |
| 12.5 | Native skill first execution preference | routing/router.py | not_started |
| 12.6 | Local override wins | routing/router.py override logic | not_started |

## §13 Workflow Engine

| Req | Description | Target | Status |
|---|---|---|---|
| 13.1 | Thin local workflow runner | workflows/engine.py | not_started |
| 13.2 | DAG support required | workflows/engine.py DAG impl | not_started |
| 13.3 | Workflow file structure (SKILL.md + workflow.yaml + schemas/ + scripts/ + templates/) | workflows/* | not_started |
| 13.4 | 15 built-in step types | workflows/steps.py | not_started |
| 13.5 | Human-input steps first-class | steps.py PromptUserStep | not_started |
| 13.6 | Step-level retries | engine.py retry logic | not_started |
| 13.7 | Per-step and per-workflow timeouts | engine.py timeout handling | not_started |
| 13.8 | Blocked ≠ Failed semantics | WorkflowRunStatus enum | not_started |
| 13.9 | Resumability (full state persistence) | db/ workflow_runs table | not_started |
| 13.10 | Role/profile binding | routing/roles.py | not_started |
| 13.11 | Only L1 may invoke teams (enforced in engine) | engine.py + policy | not_started |
| 13.12 | 6 task hook points | engine.py hooks | not_started |
| 13.13 | Artifact/memory declarations per step | workflow.yaml schema | not_started |

## §14 Handoff Packets + Artifact Contracts

| Req | Description | Target | Status |
|---|---|---|---|
| 14.1 | Structured handoff for all non-trivial delegation | models/handoff.py | not_started |
| 14.2 | Default handoff mode: artifact_first_brief | HandoffMode enum default | not_started |
| 14.3 | 4 handoff modes | HandoffMode enum | not_started |
| 14.4 | Handoff packet minimum fields (15) | models/handoff.py | not_started |
| 14.5 | Artifact contracts per workflow/task | models/artifact.py ArtifactContract | not_started |
| 14.6 | Standard artifact type catalog (18 types) | models/artifact.py ArtifactType enum | not_started |
| 14.7 | Artifact formats (MD+JSON sidecar+diff+log) | ArtifactWriter | not_started |
| 14.8 | Structured worker return object | models/agent_run.py WorkerResult | not_started |
| 14.9 | Schema validation pre-dispatch + on-complete | workflows/engine.py + adapters | not_started |
| 14.10 | Failure artifacts for blocked/failed runs | ArtifactWriter + engine | not_started |

## §15 Team Composition + Routing

| Req | Description | Target | Status |
|---|---|---|---|
| 15.1 | TeamTemplate + TeamInstance | teams/template.py + instance.py | not_started |
| 15.2 | Only L1 creates/invokes teams | policy/engine.py + teams/ | not_started |
| 15.3 | Slot-based composition (8 slot fields) | teams/template.py Slot model | not_started |
| 15.4 | Role vocabulary (15 roles) | routing/roles.py | not_started |
| 15.5 | L1 team selection logic | routing/router.py | not_started |
| 15.6 | Team selection conditions | routing/router.py | not_started |
| 15.7 | PI-native profile mapping | routing/roles.py → PIRuntimeAdapter | not_started |
| 15.8 | Routing: PI profile first, explicit fallback | routing/router.py | not_started |
| 15.9 | Fallback degrade by cost/specialization | routing/router.py fallback chain | not_started |
| 15.10 | Concurrency caps (4 levels) | teams/instance.py + policy | not_started |
| 15.11 | Team policies (7 policy fields) | teams/template.py TeamPolicy | not_started |
| 15.12 | Centralized cross-team scheduler | teams/scheduler.py | not_started |
| 15.13 | Team observability (10 fields) | adapters/readers/team_read.py | not_started |

## §16 PI-Native Profile

| Req | Description | Target | Status |
|---|---|---|---|
| 16.1 | PI profiles remain runtime truth | PIRuntimeAdapter | blocked (B-001) |
| 16.2 | Layer adds: semantic roles/routing/governance | routing/ | not_started |
| 16.3 | Roles mapped to PI profiles | routing/roles.py | not_started |
| 16.4 | Routing order (5 steps) | routing/router.py | not_started |
| 16.5 | Monitor shows role/profile/task/heartbeat/blocker | adapters/readers/ + monitor/ | not_started |
| 16.6 | Policy decides spawn, PI executes | policy + PIRuntimeAdapter | not_started |

## §17 Orchestration + Workers

| Req | Description | Target | Status |
|---|---|---|---|
| 17.1 | Default: single lead + isolated workers | worker/lifecycle.py | not_started |
| 17.2 | Direct worker messaging only in team mode | policy enforcement | not_started |
| 17.3 | Default handoff: artifact_first_brief | workflows/handoff.py | not_started |
| 17.4 | Integration worker owns merge | worktrees/merge_queue.py | not_started |
| 17.5 | Non-git: sequential writers | worker/lifecycle.py | not_started |
| 17.6 | Worker receives full task packet | models/handoff.py | not_started |
| 17.7 | Workers produce structured run result | models/agent_run.py WorkerResult | not_started |

## §18 Worktrees + Merge Queue

| Req | Description | Target | Status |
|---|---|---|---|
| 18.1 | Worktrees for parallel git writes only | worktrees/allocator.py | not_started |
| 18.2 | Short-lived topic branches | worktrees/allocator.py | not_started |
| 18.3 | Merge queue required for git write work | worktrees/merge_queue.py | not_started |
| 18.4 | Integration worker owns merge/rebase | worktrees/merge_queue.py | not_started |
| 18.5 | Conflict: agent first, human on risky | worktrees/merge_queue.py | not_started |
| 18.6 | Worktrees temporary by default | worktrees/allocator.py cleanup | not_started |
| 18.7 | Non-git: sequential | worker/lifecycle.py | not_started |
| 18.8 | Worktree lifecycle (8 steps) | worktrees/allocator.py | not_started |
| 18.9 | Worktree preconditions | worktrees/allocator.py validate() | not_started |
| 18.10 | Merge readiness requirements | worktrees/merge_queue.py | not_started |
| 18.11 | Submodule integration (submodule first, then parent) | worktrees/allocator.py | not_started |

## §19 Monitor + Observability

| Req | Description | Target | Status |
|---|---|---|---|
| 19.1 | Append-only event stream + projections | events/ + projections/ | not_started |
| 19.2 | Global + project filter | monitor/server.py | not_started |
| 19.3 | SSE transport | monitor/server.py (FastAPI SSE) | not_started |
| 19.4 | Events in DB + append-only log | events/store.py | not_started |
| 19.5 | Task and run replay | adapters/readers/replay_read.py | not_started |
| 19.6 | Passive dashboard alerts | monitor/views.py | not_started |
| 19.7 | Only planning views/analytics sync to Plane | sync/plane_adapter.py filter | not_started |
| 19.8 | Every agent/run queryable without LLM | Read adapters + live status | not_started |
| 19.9 | Event schema (11 fields) | models/events.py | not_started |
| 19.10 | 30 key event types | models/events.py EventType enum | not_started |
| 19.11 | 8 required monitor views | monitor/views.py | not_started |
| 19.12 | All major state has read adapters | adapters/readers/ | not_started |

## §20 Metrics + Analytics

| Req | Description | Target | Status |
|---|---|---|---|
| 20.1 | 5 metric families | analytics/metrics.py | not_started |
| 20.2 | Issue/task burndown + tracking | analytics/burndown.py | not_started |
| 20.3 | Planning metrics | analytics/metrics.py | not_started |
| 20.4 | Flow metrics | analytics/metrics.py | not_started |
| 20.5 | Quality/integration metrics | analytics/metrics.py | not_started |
| 20.6 | Agent/orchestration metrics | analytics/metrics.py | not_started |
| 20.7 | Memory analytics | analytics/metrics.py | not_started |
| 20.8 | Forecasting advisory only | analytics/forecasting.py | not_started |
| 20.9 | Planning analytics sync to Plane only | sync/plane_adapter.py | not_started |

## §21 Security + Policy

| Req | Description | Target | Status |
|---|---|---|---|
| 21.1 | Default allow | policy/engine.py | not_started |
| 21.2 | 6-level layered scopes | policy/engine.py | not_started |
| 21.3 | Rule actions (allow/deny/audit_only) | models/policy.py PolicyAction | not_started |
| 21.4 | Matchers (8 types) | policy/rules.py | not_started |
| 21.5 | Pre-execution enforcement (7 trigger points) | policy/engine.py check() | not_started |
| 21.6 | Secret guard (5 rules) | policy/secret_guard.py | not_started |
| 21.7 | Path/workspace boundary distinction | policy/engine.py | not_started |
| 21.8 | Network boundary restrictions | policy/rules.py NetworkMatcher | not_started |
| 21.9 | Optional selective sandboxing | policy/engine.py (stub) | not_started |
| 21.10 | Hard orchestration invariants in policy (4) | policy/engine.py | not_started |
| 21.11 | Audit events (6 types) | events/ | not_started |
| 21.12 | 4 security read adapters | adapters/readers/policy_read.py | not_started |

## §22 Plane Adapter

| Req | Description | Target | Status |
|---|---|---|---|
| 22.1 | Plane only external adapter | sync/ | not_started |
| 22.2 | Local system authoritative | sync/plane_adapter.py | not_started |
| 22.3 | Default local→Plane | sync/sync_manager.py | not_started |
| 22.4 | Local wins on conflict | sync/sync_manager.py conflict handler | not_started |
| 22.5 | Artifact sync: summaries/links only | sync/plane_adapter.py | not_started |
| 22.6 | 3-layer adapter structure | sync/ | not_started |
| 22.7 | Mixed trigger model (manual/event/batch/scheduled) | sync/sync_manager.py | not_started |
| 22.8 | Sync state fields (8) | models/sync.py | not_started |
| 22.9 | Sync-allowed object types (15) | sync/plane_adapter.py allowed_types | not_started |
| 22.10 | Sync-blocked types (7) | sync/plane_adapter.py denied_types | not_started |
| 22.11 | 4 sync read adapters | adapters/readers/sync_read.py | not_started |

## §23 Workflow Catalog

| Req | Description | Target | Status |
|---|---|---|---|
| 23.1 | Native skills for most flows | routing/router.py default | not_started |
| 23.2 | 4 required coded workflows | workflows/ | not_started |
| 23.3 | grill-me requirements (5) | workflows/grill-me/ | not_started |
| 23.4 | write-a-prd requirements (3) | workflows/write-a-prd/ | not_started |
| 23.5 | prd-to-plan requirements (2) | workflows/prd-to-plan/ | not_started |
| 23.6 | prd-to-issues requirements (2) | workflows/prd-to-issues/ | not_started |

## §24 Queryable Live Status

| Req | Description | Target | Status |
|---|---|---|---|
| 24.1 | Always-queryable agent status (no LLM needed) | adapters/readers/ | not_started |
| 24.2 | 3 inspection levels | adapters/readers/agent_status_read.py | not_started |
| 24.3 | 6 required CLI/API surfaces | cli/commands/agent.py | not_started |
| 24.4 | 9 required data fields | models/agent_run.py AgentLiveStatus | not_started |

## §25 Testing + Validation

| Req | Description | Target | Status |
|---|---|---|---|
| 25.1 | Layered tests + scenario evals | tests/ | not_started |
| 25.2 | Done = impl + read path + observability + tests | All phases | not_started |
| 25.3 | 8 golden scenarios | tests/scenarios/ | not_started |
| 25.4 | Acceptance tests by subsystem (10) | tests/integration/ | not_started |

## §26–29 Implementation Plan + Invariants

| Req | Description | Target | Status |
|---|---|---|---|
| 26 | 9-phase plan aligned | IMPLEMENTATION_PLAN.md + TASKS.md | implemented |
| 28.1 | Only L1 invokes teams (tested) | tests/unit/test_policy.py | not_started |
| 28.2 | Board never canonical truth (tested) | tests/unit/test_control_plane.py | not_started |
| 28.3 | Tasks and memory logically separate | Architecture constraint | not_started |
| 28.4 | Adapters are official access path | adapters/ + no direct DB access | not_started |
| 28.5 | Canonical writes before index writes | writers/ write flow | not_started |
| 28.6 | Memory never full-text dumps by default | recall.py default mode | not_started |
| 28.7 | All memory scopes reachable | memory/facade.py | not_started |
| 28.8 | Agent status queryable without LLM | read adapters | not_started |
| 28.9 | Non-git writers sequential | worker/lifecycle.py | not_started |
| 28.10 | Git parallel writers use worktrees | worktrees/ | not_started |
| 28.11 | Integration worker owns merge queue | worktrees/merge_queue.py | not_started |
| 28.12 | Policy checks pre-execution | policy/engine.py | not_started |
| 28.13 | Secrets guarded/redacted by default | policy/secret_guard.py | not_started |
| 28.14 | Plane never silently overrides local | sync/sync_manager.py | not_started |
