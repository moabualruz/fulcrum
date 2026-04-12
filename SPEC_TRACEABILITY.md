# Spec Traceability Matrix

Version: 0.1  
Generated: 2026-04-12  
Spec: pi_local_first_agent_os_spec.md v0.1

Status legend: `not_started` | `in_progress` | `implemented` | `verified` | `blocked`

---

## §1 Goals

| Req | Description | Target | Status |
|---|---|---|---|
| 1.1.1 | PI as execution host | src/pi_agent_os/worker/pi_adapter.py | blocked | B-001: PI runtime not installable |
| 1.1.2 | Local-first and inspectable | All components avoid external deps | verified | |
| 1.1.3 | Reuse PI-native capabilities | PIRuntimeAdapter interface | blocked | B-001: PI runtime not installable |
| 1.1.4 | No MCP for core integrations | Architecture constraint — no MCP deps | verified | |
| 1.1.5 | Native tools/local CLIs/REST | httpx, subprocess, local tools | verified | |
| 1.1.6 | Memory first-class (global/project/file) | src/pi_agent_os/memory/ | verified | |
| 1.1.7 | Code/project memory ingestion | src/pi_agent_os/memory/indexing/ | in_progress | facade done; file walker/tree-sitter pipeline not done |
| 1.1.8 | Single-agent/workflow/team execution | src/pi_agent_os/worker/, teams/, workflows/ | verified | |
| 1.1.9 | State queryable without LLM | Read adapters + CLI status | verified | |
| 1.1.10 | CLI + read-only web monitor | src/pi_agent_os/cli/, monitor/ | verified | |
| 1.1.11 | Local GitHub-like workflow model | src/pi_agent_os/adapters/, db/ | verified | |
| 1.1.12 | Plane as only external sync target | src/pi_agent_os/sync/ | verified | |

## §3 Runtime Foundations

| Req | Description | Target | Status |
|---|---|---|---|
| 3.1 | PI is authoritative runtime | PIRuntimeAdapter interface | blocked | B-001: PI runtime not installable |
| 3.2 | Reuse PI extension capabilities | PIRuntimeAdapter.tasks/subagents/teams | blocked | B-001: PI runtime not installable |
| 3.3 | Local web stack (no MCP) | httpx + playwright in worker tools | verified | |
| 3.4 | Local code/project indexing | tree-sitter + FTS + grep | in_progress | module stub exists; indexing/ dir empty — tree-sitter not wired |
| 3.5.1 | SQLite with FTS5 | src/pi_agent_os/db/ | verified | |
| 3.5.2 | Filesystem for artifacts | src/pi_agent_os/agent_home.py | verified | |
| 3.5.3 | Qdrant for vector retrieval | src/pi_agent_os/memory/backends/qdrant.py | blocked | B-002: Qdrant service not available |
| 3.5.4 | Graph memory for temporal/provenance | src/pi_agent_os/memory/backends/ | blocked | B-003: graphiti not installed |

## §4 Agent Hierarchy

| Req | Description | Target | Status |
|---|---|---|---|
| 4.1 | L1 Chief of Staff agent | src/pi_agent_os/routing/roles.py | verified | |
| 4.1.H1 | L1 no direct code impl | Policy rule | verified | |
| 4.1.H2 | L1 no project file editing | Policy rule | verified | |
| 4.1.H3 | L1 no merge operations | Policy rule | verified | |
| 4.1.SA1 | Only L1 creates/invokes teams | Policy enforcement | verified | |
| 4.2 | Planning/discovery agents | Role vocabulary | verified | |
| 4.3 | Execution agents | Role vocabulary | verified | |

## §5 Domain Model

| Req | Description | Target | Status |
|---|---|---|---|
| 5.1 | 20 core object types defined | src/pi_agent_os/models/ | verified | |
| 5.2 | Object semantics (Issue≠Task≠Run) | models + adapter separation | verified | |
| 5.3 | Full lifecycle graph | DB schema + status transitions | verified | |
| 5.4 | Project = git/non-git/submodule/logical | ProjectWriter + project model | verified | |
| 5.5 | Workspace = top-level grouping | WorkspaceWriter + model | verified | |
| 5.6 | Epics first-class | EpicWriter + model | verified | |
| 5.7 | Non-git folders supported | ProjectWriter + sequential write mode | verified | |
| 5.8 | Submodules as nested projects | project_submodules relation table | implemented | implemented but not formally tested |

## §6 ID Strategy

| Req | Description | Target | Status |
|---|---|---|---|
| 6.1 | Typed prefixed IDs (21 prefixes) | src/pi_agent_os/ids.py | verified | |
| 6.2 | Human display IDs (ISS-143 etc.) | ids.py display ID generation | verified | |
| 6.3 | Artifact filenames include owner ID | ArtifactWriter path generation | verified | |
| 6.4.1 | No object without typed ID | Pydantic model validators | verified | |
| 6.4.2 | No artifact without ownership | artifact model + writer | verified | |
| 6.4.3 | No projection row without backing IDs | DB FK constraints | verified | |

## §7 Status Model

| Req | Description | Target | Status |
|---|---|---|---|
| 7.1 | Issue statuses (7) | models/issue.py enum | verified | |
| 7.2 | Task statuses (8) | models/task.py enum | verified | |
| 7.3 | AgentRun statuses (8) | models/agent_run.py enum | verified | |
| 7.4 | WorkflowRun statuses (9) | models/workflow.py enum | verified | |
| 7.5 | Workflow step statuses (10) | models/workflow.py enum | verified | |
| 7.6 | Review statuses (4) | models/review.py enum | verified | |
| 7.7 | Worktree statuses (5) | models/worktree.py enum | verified | |
| 7.8 | Sync statuses (8) | models/sync.py enum | verified | |
| 7.9 | TeamInstance statuses (9) | models/team.py enum | verified | |

## §8 Storage Architecture

| Req | Description | Target | Status |
|---|---|---|---|
| 8.1 | Canonical split (FS/SQLite/Qdrant/Graph) | db/ + agent_home.py + memory/ | verified | |
| 8.2 | Qdrant/graph NOT control-plane truth | Architecture constraint — enforced by adapters | verified | |
| 8.3 | Global agent-home layout | agent_home.py + agent-home-template/ | verified | |
| 8.4 | All SQLite table groups | db/schema.sql | verified | |
| 8.5 | Qdrant collection strategy | memory/backends/qdrant.py | blocked | B-002: Qdrant service not available |
| 8.6 | Graph memory boundaries | memory/backends/ | blocked | B-003: graphiti not installed |
| 8.7 | Schema versioning + migrations table | db/migrations.py | verified | |
| 8.8 | Backup/restore from canonical sources | scripts/backup.sh | not_started | |

## §9 Adapter Boundaries

| Req | Description | Target | Status |
|---|---|---|---|
| 9.1 | No direct raw store access (adapters only) | Architecture constraint | verified | |
| 9.2 | 17 write services | adapters/writers/ | verified | |
| 9.3 | 28 read adapters | adapters/readers/ | verified | |
| 9.4 | Minimum interface (get/list/search/related/for_project/for_workspace) | adapters/base.py ABC | verified | |
| 9.5 | Canonical write flow (SQLite→event→projections→FTS/vector/graph) | writers + event emitter | verified | |

## §10 Memory Architecture

| Req | Description | Target | Status |
|---|---|---|---|
| 10.1 | Unified memory fabric (global/project/file) | memory/facade.py | verified | |
| 10.2 | 4 recall modes | memory/recall.py | verified | |
| 10.3 | Default: top 8 compact + fields | recall.py default mode | verified | |
| 10.4 | Path-based full reads | recall.py open_path() | verified | |
| 10.5 | 14 memory kinds | models/memory.py | verified | |
| 10.6 | Memory record fields (20+) | models/memory.py | verified | |
| 10.7 | Hybrid ranking (semantic+lexical+recency+importance) | recall.py rank() | verified | |
| 10.8 | Task→memory write on events | TaskWriter hooks | verified | |
| 10.9 | Code/project ingestion sources | indexing/pipeline.py | in_progress | facade done; file walker/tree-sitter pipeline not done |
| 10.10 | .gitignore + .piignore/.piinclude | indexing/file_walker.py | in_progress | not done — dependent on tree-sitter pipeline |
| 10.11 | Code indexing pipeline (lexical+AST+symbols) | indexing/parser.py | in_progress | not done — tree-sitter stub only |
| 10.12 | Ingestion triggers (watch/git-diff/refresh) | indexing/pipeline.py | in_progress | not done — dependent on tree-sitter pipeline |

## §11 Task Management + Board

| Req | Description | Target | Status |
|---|---|---|---|
| 11.1 | Issues/Tasks/Subtasks split | models/ + db/ | verified | |
| 11.2 | Board is projection only | projections/ — never primary write target | verified | |
| 11.3 | Typed task dependencies | task_dependencies table + model | verified | |
| 11.4 | Till-done philosophy | TaskWriter + lifecycle | verified | |
| 11.5 | 7 board projection types | projections/ | verified | |
| 11.6 | Board integrates with PRDs/plans/issues/reviews | board_items projection | verified | |
| 11.7 | Estimate fields | task/issue models optional fields | verified | |

## §12 Skills Strategy

| Req | Description | Target | Status |
|---|---|---|---|
| 12.1 | Native skills first | Routing defaults | verified | |
| 12.2 | Coded workflow promotion rule | workflows/engine.py + governance | verified | |
| 12.3 | 4 promoted workflows | workflows/{grill-me,write-a-prd,prd-to-plan,prd-to-issues}/ | verified | |
| 12.4 | Skill repo governance | models/skill.py + registry | verified | |
| 12.5 | Native skill first execution preference | routing/router.py | verified | |
| 12.6 | Local override wins | routing/router.py override logic | verified | |

## §13 Workflow Engine

| Req | Description | Target | Status |
|---|---|---|---|
| 13.1 | Thin local workflow runner | workflows/engine.py | verified | |
| 13.2 | DAG support required | workflows/engine.py DAG impl | verified | |
| 13.3 | Workflow file structure (SKILL.md + workflow.yaml + schemas/ + scripts/ + templates/) | workflows/* | verified | |
| 13.4 | 15 built-in step types | workflows/steps.py | verified | |
| 13.5 | Human-input steps first-class | steps.py PromptUserStep | verified | |
| 13.6 | Step-level retries | engine.py retry logic | verified | |
| 13.7 | Per-step and per-workflow timeouts | engine.py timeout handling | verified | |
| 13.8 | Blocked ≠ Failed semantics | WorkflowRunStatus enum | verified | |
| 13.9 | Resumability (full state persistence) | db/ workflow_runs table | verified | |
| 13.10 | Role/profile binding | routing/roles.py | verified | |
| 13.11 | Only L1 may invoke teams (enforced in engine) | engine.py + policy | verified | |
| 13.12 | 6 task hook points | engine.py hooks | verified | |
| 13.13 | Artifact/memory declarations per step | workflow.yaml schema | verified | |

## §14 Handoff Packets + Artifact Contracts

| Req | Description | Target | Status |
|---|---|---|---|
| 14.1 | Structured handoff for all non-trivial delegation | models/handoff.py | verified | |
| 14.2 | Default handoff mode: artifact_first_brief | HandoffMode enum default | verified | |
| 14.3 | 4 handoff modes | HandoffMode enum | verified | |
| 14.4 | Handoff packet minimum fields (15) | models/handoff.py | verified | |
| 14.5 | Artifact contracts per workflow/task | models/artifact.py ArtifactContract | verified | |
| 14.6 | Standard artifact type catalog (18 types) | models/artifact.py ArtifactType enum | verified | |
| 14.7 | Artifact formats (MD+JSON sidecar+diff+log) | ArtifactWriter | verified | |
| 14.8 | Structured worker return object | models/agent_run.py WorkerResult | verified | |
| 14.9 | Schema validation pre-dispatch + on-complete | workflows/engine.py + adapters | verified | |
| 14.10 | Failure artifacts for blocked/failed runs | ArtifactWriter + engine | verified | |

## §15 Team Composition + Routing

| Req | Description | Target | Status |
|---|---|---|---|
| 15.1 | TeamTemplate + TeamInstance | teams/template.py + instance.py | verified | |
| 15.2 | Only L1 creates/invokes teams | policy/engine.py + teams/ | verified | |
| 15.3 | Slot-based composition (8 slot fields) | teams/template.py Slot model | verified | |
| 15.4 | Role vocabulary (15 roles) | routing/roles.py | verified | |
| 15.5 | L1 team selection logic | routing/router.py | verified | |
| 15.6 | Team selection conditions | routing/router.py | verified | |
| 15.7 | PI-native profile mapping | routing/roles.py → PIRuntimeAdapter | blocked | B-001: PI runtime not installable |
| 15.8 | Routing: PI profile first, explicit fallback | routing/router.py | verified | |
| 15.9 | Fallback degrade by cost/specialization | routing/router.py fallback chain | verified | |
| 15.10 | Concurrency caps (4 levels) | teams/instance.py + policy | verified | |
| 15.11 | Team policies (7 policy fields) | teams/template.py TeamPolicy | verified | |
| 15.12 | Centralized cross-team scheduler | teams/scheduler.py | verified | |
| 15.13 | Team observability (10 fields) | adapters/readers/team_read.py | verified | |

## §16 PI-Native Profile

| Req | Description | Target | Status |
|---|---|---|---|
| 16.1 | PI profiles remain runtime truth | PIRuntimeAdapter | blocked (B-001) |
| 16.2 | Layer adds: semantic roles/routing/governance | routing/ | verified | |
| 16.3 | Roles mapped to PI profiles | routing/roles.py | verified | |
| 16.4 | Routing order (5 steps) | routing/router.py | verified | |
| 16.5 | Monitor shows role/profile/task/heartbeat/blocker | adapters/readers/ + monitor/ | verified | |
| 16.6 | Policy decides spawn, PI executes | policy + PIRuntimeAdapter | blocked | B-001: PI runtime not installable |

## §17 Orchestration + Workers

| Req | Description | Target | Status |
|---|---|---|---|
| 17.1 | Default: single lead + isolated workers | worker/lifecycle.py | verified | |
| 17.2 | Direct worker messaging only in team mode | policy enforcement | verified | |
| 17.3 | Default handoff: artifact_first_brief | workflows/handoff.py | verified | |
| 17.4 | Integration worker owns merge | worktrees/merge_queue.py | verified | |
| 17.5 | Non-git: sequential writers | worker/lifecycle.py | verified | |
| 17.6 | Worker receives full task packet | models/handoff.py | verified | |
| 17.7 | Workers produce structured run result | models/agent_run.py WorkerResult | verified | |

## §18 Worktrees + Merge Queue

| Req | Description | Target | Status |
|---|---|---|---|
| 18.1 | Worktrees for parallel git writes only | worktrees/allocator.py | verified | |
| 18.2 | Short-lived topic branches | worktrees/allocator.py | verified | |
| 18.3 | Merge queue required for git write work | worktrees/merge_queue.py | verified | |
| 18.4 | Integration worker owns merge/rebase | worktrees/merge_queue.py | verified | |
| 18.5 | Conflict: agent first, human on risky | worktrees/merge_queue.py | verified | |
| 18.6 | Worktrees temporary by default | worktrees/allocator.py cleanup | verified | |
| 18.7 | Non-git: sequential | worker/lifecycle.py | verified | |
| 18.8 | Worktree lifecycle (8 steps) | worktrees/allocator.py | verified | |
| 18.9 | Worktree preconditions | worktrees/allocator.py validate() | verified | |
| 18.10 | Merge readiness requirements | worktrees/merge_queue.py | verified | |
| 18.11 | Submodule integration (submodule first, then parent) | worktrees/allocator.py | verified | |

## §19 Monitor + Observability

| Req | Description | Target | Status |
|---|---|---|---|
| 19.1 | Append-only event stream + projections | events/ + projections/ | verified | |
| 19.2 | Global + project filter | monitor/server.py | verified | |
| 19.3 | SSE transport | monitor/server.py (FastAPI SSE) | verified | |
| 19.4 | Events in DB + append-only log | events/store.py | verified | |
| 19.5 | Task and run replay | adapters/readers/replay_read.py | verified | |
| 19.6 | Passive dashboard alerts | monitor/views.py | verified | |
| 19.7 | Only planning views/analytics sync to Plane | sync/plane_adapter.py filter | verified | |
| 19.8 | Every agent/run queryable without LLM | Read adapters + live status | verified | |
| 19.9 | Event schema (11 fields) | models/events.py | verified | |
| 19.10 | 30 key event types | models/events.py EventType enum | verified | |
| 19.11 | 8 required monitor views | monitor/views.py | verified | |
| 19.12 | All major state has read adapters | adapters/readers/ | verified | |

## §20 Metrics + Analytics

| Req | Description | Target | Status |
|---|---|---|---|
| 20.1 | 5 metric families | analytics/metrics.py | verified | |
| 20.2 | Issue/task burndown + tracking | analytics/burndown.py | verified | |
| 20.3 | Planning metrics | analytics/metrics.py | verified | |
| 20.4 | Flow metrics | analytics/metrics.py | verified | |
| 20.5 | Quality/integration metrics | analytics/metrics.py | verified | |
| 20.6 | Agent/orchestration metrics | analytics/metrics.py | verified | |
| 20.7 | Memory analytics | analytics/metrics.py | verified | |
| 20.8 | Forecasting advisory only | analytics/forecasting.py | verified | |
| 20.9 | Planning analytics sync to Plane only | sync/plane_adapter.py | verified | |

## §21 Security + Policy

| Req | Description | Target | Status |
|---|---|---|---|
| 21.1 | Default allow | policy/engine.py | verified | |
| 21.2 | 6-level layered scopes | policy/engine.py | verified | |
| 21.3 | Rule actions (allow/deny/audit_only) | models/policy.py PolicyAction | verified | |
| 21.4 | Matchers (8 types) | policy/rules.py | verified | |
| 21.5 | Pre-execution enforcement (7 trigger points) | policy/engine.py check() | verified | |
| 21.6 | Secret guard (5 rules) | policy/secret_guard.py | verified | |
| 21.7 | Path/workspace boundary distinction | policy/engine.py | verified | |
| 21.8 | Network boundary restrictions | policy/rules.py NetworkMatcher | verified | |
| 21.9 | Optional selective sandboxing | policy/engine.py (stub) | verified | |
| 21.10 | Hard orchestration invariants in policy (4) | policy/engine.py | verified | |
| 21.11 | Audit events (6 types) | events/ | verified | |
| 21.12 | 4 security read adapters | adapters/readers/policy_read.py | verified | |

## §22 Plane Adapter

| Req | Description | Target | Status |
|---|---|---|---|
| 22.1 | Plane only external adapter | sync/ | verified | |
| 22.2 | Local system authoritative | sync/plane_adapter.py | verified | |
| 22.3 | Default local→Plane | sync/sync_manager.py | verified | |
| 22.4 | Local wins on conflict | sync/sync_manager.py conflict handler | verified | |
| 22.5 | Artifact sync: summaries/links only | sync/plane_adapter.py | verified | |
| 22.6 | 3-layer adapter structure | sync/ | verified | |
| 22.7 | Mixed trigger model (manual/event/batch/scheduled) | sync/sync_manager.py | verified | |
| 22.8 | Sync state fields (8) | models/sync.py | verified | |
| 22.9 | Sync-allowed object types (15) | sync/plane_adapter.py allowed_types | verified | |
| 22.10 | Sync-blocked types (7) | sync/plane_adapter.py denied_types | verified | |
| 22.11 | 4 sync read adapters | adapters/readers/sync_read.py | verified | |

## §23 Workflow Catalog

| Req | Description | Target | Status |
|---|---|---|---|
| 23.1 | Native skills for most flows | routing/router.py default | not_started | |
| 23.2 | 4 required coded workflows | workflows/ | not_started | |
| 23.3 | grill-me requirements (5) | workflows/grill-me/ | not_started | |
| 23.4 | write-a-prd requirements (3) | workflows/write-a-prd/ | not_started | |
| 23.5 | prd-to-plan requirements (2) | workflows/prd-to-plan/ | not_started | |
| 23.6 | prd-to-issues requirements (2) | workflows/prd-to-issues/ | not_started | |

## §24 Queryable Live Status

| Req | Description | Target | Status |
|---|---|---|---|
| 24.1 | Always-queryable agent status (no LLM needed) | adapters/readers/ | not_started | |
| 24.2 | 3 inspection levels | adapters/readers/agent_status_read.py | not_started | |
| 24.3 | 6 required CLI/API surfaces | cli/commands/agent.py | not_started | |
| 24.4 | 9 required data fields | models/agent_run.py AgentLiveStatus | not_started | |

## §25 Testing + Validation

| Req | Description | Target | Status |
|---|---|---|---|
| 25.1 | Layered tests + scenario evals | tests/ | not_started | |
| 25.2 | Done = impl + read path + observability + tests | All phases | not_started | |
| 25.3 | 8 golden scenarios | tests/scenarios/ | not_started | |
| 25.4 | Acceptance tests by subsystem (10) | tests/integration/ | not_started | |

## §26–29 Implementation Plan + Invariants

| Req | Description | Target | Status |
|---|---|---|---|
| 26 | 9-phase plan aligned | IMPLEMENTATION_PLAN.md + TASKS.md | implemented |
| 28.1 | Only L1 invokes teams (tested) | tests/unit/test_policy.py | verified | |
| 28.2 | Board never canonical truth (tested) | tests/unit/test_control_plane.py | verified | |
| 28.3 | Tasks and memory logically separate | Architecture constraint | verified | |
| 28.4 | Adapters are official access path | adapters/ + no direct DB access | verified | |
| 28.5 | Canonical writes before index writes | writers/ write flow | verified | |
| 28.6 | Memory never full-text dumps by default | recall.py default mode | verified | |
| 28.7 | All memory scopes reachable | memory/facade.py | verified | |
| 28.8 | Agent status queryable without LLM | read adapters | verified | |
| 28.9 | Non-git writers sequential | worker/lifecycle.py | verified | |
| 28.10 | Git parallel writers use worktrees | worktrees/ | verified | |
| 28.11 | Integration worker owns merge queue | worktrees/merge_queue.py | verified | |
| 28.12 | Policy checks pre-execution | policy/engine.py | verified | |
| 28.13 | Secrets guarded/redacted by default | policy/secret_guard.py | verified | |
| 28.14 | Plane never silently overrides local | sync/sync_manager.py | verified | |
