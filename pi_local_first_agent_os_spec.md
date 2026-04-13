
# PI Local-First Agent Operating System Spec
Version: 0.2  
Status: Active — updated to reflect CLI agent integration  
Audience: Local CLI agents, maintainers, reviewers  
Date: 2026-04-13

---

## 0. Purpose

This document specifies a local-first agent operating system built around PI as the runtime host. It defines the architecture, data model, workflows, orchestration, memory, monitoring, security, sync, testing, and phased implementation plan.

This spec is intended to be saved locally, reviewed in full, and used as the implementation contract for local CLI agents.

This document is authoritative over prior conversational fragments unless explicitly superseded by a later version of this spec.

---

## 1. Goals

### 1.1 Primary goals
- Use PI as the execution host and extension runtime.
- Keep the system local-first and inspectable.
- Reuse PI-native capabilities and existing PI extensions whenever feasible.
- Avoid MCP for core browser/tool integrations (web search, fetch, Playwright).
- Use MCP only as an interoperability interface exposing PI-unique control plane tools to external CLI agents (Claude CLI, Gemini CLI). This is not a core architecture dependency — it is an optional bridge for external agent integration.
- Prefer native tools, local CLIs, native libraries, and REST APIs.
- Make memory first-class across project, file, and global scopes.
- Make project/code memory ingestion first-class.
- Support single-agent, workflow, and team execution.
- Keep all important state queryable without requiring an LLM.
- Provide both CLI and read-only web monitoring over the same state.
- Use a local GitHub-like workflow model without GitHub as the working system.
- Use Plane as the only external sync/visualization target currently in scope.

### 1.2 Non-goals
- Do not build a second agent runtime separate from PI.
- Do not replace PI-native profile/provider/agent facilities with a custom registry.
- Do not make GitHub or OpenProject part of the current implementation scope.
- Do not make memory or vector stores the control-plane source of truth.
- Do not rely on chat transcript forwarding as the main handoff mechanism.
- Do not build a giant general-purpose workflow platform comparable to Temporal/Prefect/Dagster.
- Do not optimize first for benchmark vanity metrics, token counts, or flashy UI over correctness and inspectability.

### 1.3 Design principles
- Reuse first.
- Local first.
- Control plane separate from memory plane.
- Structured state over transcript state.
- Deterministic policy enforcement over conversational safety prompts.
- Read adapters for every major state surface.
- Human-readable artifacts plus machine-readable sidecars where useful.
- Canonical writes first, indexes second.
- Board is a projection, not source of truth.
- Teams are powerful but not the default unit of work.
- Only L1 may create or invoke teams.

---

## 2. System overview

The system has six major planes:

1. Dispatcher plane  
   The L1 Chief of Staff / Executive Assistant agent.

2. Workflow plane  
   Native skills by default, with a small promoted subset of coded workflows.

3. Control plane  
   Tasks, issues, epics, plans, reviews, worktrees, merge queue, orchestration state.

4. Execution plane  
   Single workers, teams, workflow-bound agents, integration worker.

5. Memory plane  
   Global/project/file/task-linked memory, indexing, retrieval, path-based full reads.

6. Observability plane  
   Event log, state projections, CLI status, read-only web monitor, analytics, replay.

PI remains the runtime host. The system layers routing, governance, orchestration policy, storage, and monitoring around PI-native execution.

---

## 3. Runtime foundations and external dependencies

### 3.1 PI runtime role
PI is the authoritative runtime for:
- native agent definitions
- model/provider assignment
- extension registration
- skill loading
- subagent execution capabilities
- related extension-driven tool/runtime behavior

The system must not build a replacement agent runtime.

### 3.2 Reuse-first extension substrate
Prefer reusing or adapting these types of PI extension capabilities where sufficient:
- tasks substrate
- subagents runtime
- team runtime
- supervisor / drift control
- code graph helpers
- session/handoff aids
- monitor/session analytics helpers

### 3.3 Local web stack
Preferred local architecture:
- search via a local/self-hosted search layer
- fetch/crawl/extract via a local crawl/extract layer
- browser automation via native Playwright library
- no MCP dependency in the core architecture for browser/web integrations

### 3.6 External CLI agent integration

Claude CLI (`claude`) and Gemini CLI (`gemini`) may be used as chat providers alongside PI.
This enables OAuth-based execution without API key billing for those providers.

**Model spec prefix routing** (in agent `.md` frontmatter):
- `claude-cli/<model>` → `ClaudeCLIAdapter` (Claude Code OAuth session)
- `gemini-cli/<model>` → `GeminiCLIAdapter` (Gemini CLI OAuth session)
- anything else → `PIRPCBridge` (PI native execution, default)

The `RoutingAdapter` selects the correct backend at spawn time based on the first `models:` entry
in the agent definition file. `auto_configure_pi_runtime()` wires this automatically.

**MCP control plane bridge** (`pi-os` MCP server):
Exposes PI-unique tools (`create_task`, `update_task`, `list_tasks`, `recall_memory`,
`write_memory`, `list_agent_profiles`, `get_agent_run_status`) to Claude and Gemini under
the `mcp__pi-os__*` namespace (Claude) or `mcp_pi-os_*` namespace (Gemini).
This avoids tool name conflicts with built-in CLI tools and gives agents access to the
control plane without requiring PI.

**Pre-execution interception**:
- Claude: `PreToolUse` command hook (`python -m pi_agent_os.hooks.claude_hook`) — runs before
  every tool call, logs to event store, runs policy check, exits 0 (allow) or 2 (deny).
- Gemini: `BeforeTool` extension hook (`python -m pi_agent_os.hooks.gemini_hook`) — same logic.
- PI: observe-only (PI RPC has no pre-execution gate in its protocol).

**Integration packages**:
- `agent-integration/claude/` — `CLAUDE.md`, `.mcp.json`, hook settings snippet, `install.sh`
- `agent-integration/gemini/` — `GEMINI.md`, `gemini-extension.json`, `install.sh`

**CoS coherence**:
The Chief of Staff is stateless per invocation. `WorkerLifecycle` injects a full world-state
snapshot (tasks, recent events, recalled memories) into every `chief_of_staff` task packet via
`CoSContextBuilder`. The CoS produces a structured JSON response that `CoSResponseParser` applies
back to the control plane (create/update tasks, write memories, emit events).

**Observability**:
All adapter invocations (PIRPCBridge, ClaudeCLIAdapter, GeminiCLIAdapter) emit OTel spans using
GenAI semantic conventions (`gen_ai.system`, `gen_ai.request.model`, `gen_ai.agent.name`,
`gen_ai.usage.input_tokens/output_tokens`). Configure OTLP export via standard env vars.

### 3.4 Local code/project indexing
Preferred stack:
- lexical code search
- fast grep fallback
- incremental syntax parsing
- symbol extraction
- optional deeper code-intelligence helpers where available

### 3.5 Storage engines
- SQLite with FTS5 for operational truth, projections, FTS, analytics state
- filesystem for artifacts and source/project files
- Qdrant for vector retrieval index
- graph memory backend for temporal meaning/provenance memory only

---

## 4. Agent hierarchy

### 4.1 L1 Chief of Staff / Executive Assistant
This is the top-level user-facing agent.

#### Responsibilities
- understand user requests
- ask clarifying questions
- search memory and the web
- choose the correct execution shape:
  - native skill
  - single specialized agent
  - coded workflow
  - team
- create and update tasks/issues/plans
- assign work
- monitor work
- summarize results back to the user

#### Hard prohibitions
- no direct code implementation
- no project file editing
- no merge operations
- no direct heavy execution
- no bypassing task creation for non-trivial work

#### Special authority
Only L1 may:
- create teams
- invoke teams
- modify team composition
- choose team templates

Other agents may only recommend team usage back to L1.

### 4.2 Planning/discovery agents
Examples:
- context gatherer
- PRD planner
- implementation planner
- architecture reviewer
- issue decomposer
- research worker

These may read memory, search project state, use web search/fetch, and produce planning artifacts and task graphs.

### 4.3 Execution agents
Examples:
- backend implementer
- frontend implementer
- refactor worker
- browser worker
- validation worker
- reviewer
- integration worker

These perform concrete work under task/workflow/team control.

---

## 5. Local GitHub-like domain model

### 5.1 Core object types
- Workspace
- Project
- Epic
- Issue
- Task
- PRD
- Plan
- AgentRun
- Worktree
- Review
- Artifact
- MemoryLink
- Comment
- StatusEvent
- BoardView
- Cycle
- Milestone
- TeamTemplate
- TeamInstance
- HandoffPacket
- ArtifactContract
- SyncState
- PolicyRule
- WorkflowRun

### 5.2 Semantics
- Issue = tracking object
- Task = execution object
- AgentRun = one concrete attempt by an agent/profile/team member on a task
- Review = validation/integration decision object
- Artifact = durable output
- Board = projection over operational state, never canonical truth

### 5.3 Object lifecycle graph
Canonical maximal flow:

Request → PRD? → Plan → Issue(s) → Task(s) → AgentRun(s) → Review → Merge/Close → Outcome Memory

Not every request needs every object, but the control plane must support the full graph.

### 5.4 Project semantics
A Project is a logical execution scope. It may map to:
- a git repo
- a non-git folder
- a submodule repo
- a logical project under a workspace

### 5.5 Workspace semantics
A Workspace is the top-level grouping for:
- multiple projects
- global monitoring
- cross-project boards/views
- shared teams/templates
- shared memory scope
- global policy overlays

### 5.6 Epics
Epics are first-class and support issue grouping and progress rollups.

### 5.7 Non-git folders
Non-git projects are fully supported.
They lose branch/worktree semantics and use weaker write isolation.

### 5.8 Submodules
Submodules are linked nested projects.
They keep their own project identity and are not flattened into the parent project.

---

## 6. ID strategy

### 6.1 Typed prefixed IDs
All first-class objects require typed prefixed IDs.

Examples:
- ws_
- proj_
- epic_
- iss_
- task_
- subtask_
- prd_
- plan_
- run_
- wt_
- rev_
- art_
- mem_
- hof_
- ac_
- evt_
- team_
- agent_
- cycle_
- mile_
- wf_

### 6.2 Human-facing display IDs
Each major object also has a human display ID such as:
- ISS-143
- TASK-882
- EPIC-12
- PRD-4
- PLAN-9

### 6.3 Artifact filenames
Artifact paths and filenames must include the owning object ID.

Examples:
- plan_01ABC.md
- task_01XYZ__run_01LMN.diff
- rev_01QWE.md

### 6.4 Invariants
- no object exists without a typed ID
- no artifact exists without ownership metadata
- no projection row exists without stable backing object IDs

---

## 7. Status model

### 7.1 Issue statuses
- backlog
- ready
- in_progress
- blocked
- in_review
- done
- cancelled

### 7.2 Task statuses
- queued
- ready
- claimed
- running
- blocked
- failed
- completed
- cancelled

### 7.3 AgentRun statuses
- created
- starting
- running
- waiting
- blocked
- failed
- finished
- aborted

### 7.4 WorkflowRun statuses
- created
- ready
- running
- waiting_input
- waiting_dependency
- blocked
- failed
- completed
- cancelled

### 7.5 Workflow step statuses
- pending
- ready
- running
- retrying
- waiting_input
- waiting_dependency
- blocked
- failed
- completed
- skipped

### 7.6 Review statuses
- pending
- changes_requested
- approved
- rejected

### 7.7 Worktree statuses
- allocated
- dirty
- ready_for_merge
- merged
- discarded

### 7.8 Sync statuses
- never_synced
- queued
- syncing
- synced
- conflicted
- failed
- disabled

### 7.9 Team instance statuses
- created
- ready
- spawning
- running
- waiting
- blocked
- completed
- failed
- cancelled

---

## 8. Storage architecture

### 8.1 Canonical split
Filesystem:
- source code and project files
- PRDs
- plans
- reviews
- patches
- reports
- logs
- templates
- skills and workflow source files

SQLite:
- operational truth
- object registries
- relations
- statuses
- projections
- event index/metadata
- FTS
- metrics rollups
- sync state
- policy state

Qdrant:
- vector embeddings and semantic retrieval index only

Graph memory backend:
- temporal memory entities/edges/episodes/provenance only

### 8.2 Hard rule
Qdrant and graph are not the control-plane source of truth.

### 8.3 Global agent-home layout
All agent state/config/control artifacts live under a global agent-home.

Reference layout:

```text
<agent-home>/
  state.db
  workspace.yaml
  config/
  teams/
  agents/
  skills/
  workflows/
  registry/
  data/
  artifacts/
    <project-id>/
      prds/
      plans/
      reviews/
      reports/
      patches/
      research/
      outcomes/
  events/
  caches/
  exports/
  imports/
```

Project source files stay in project roots.

### 8.4 SQLite schema groups
#### Core object tables
- workspaces
- projects
- epics
- issues
- tasks
- prds
- plans
- agent_runs
- worktrees
- reviews
- artifacts
- teams
- team_instances
- handoffs
- artifact_contracts
- workflow_runs
- cycles
- milestones

#### Relation tables
- issue_subissues
- issue_tasks
- task_dependencies
- task_memory_links
- artifact_memory_links
- agentrun_artifacts
- review_targets
- project_submodules
- team_members
- plan_issues
- prd_plans

#### Projection tables
- board_items
- task_state_projection
- issue_state_projection
- agent_state_projection
- team_state_projection
- merge_queue_projection
- review_queue_projection
- memory_trace_projection
- sync_projection

#### Analytics tables
- analytics_daily
- analytics_cycle
- analytics_project
- analytics_agent
- analytics_team

#### Policy and sync tables
- policy_rules
- policy_events
- sync_states
- sync_conflicts
- sync_queue

#### FTS tables
- issues_fts
- tasks_fts
- artifacts_fts
- plans_fts
- prds_fts
- selected_events_fts

### 8.5 Qdrant schema strategy
Use one typed collection first, with payload fields including:
- object_id
- object_type
- workspace_id
- project_id
- scope
- status
- artifact_type
- memory_kind
- task_id
- issue_id
- path
- symbol
- created_at
- updated_at
- tags

### 8.6 Graph memory boundaries
Graph memory stores:
- entities
- relationships
- temporal episodes
- provenance links

It ingests:
- task outcomes
- decisions
- failures
- project facts
- code/file summaries
- selected artifacts
- user preferences
- research findings

It does not replace SQLite relations or raw artifact truth.

### 8.7 Versioning
Every major schema must carry versioning:
- DB schema version
- object schema version
- workflow schema version
- artifact schema version

SQLite must have a migrations table.

### 8.8 Backup/export rule
Backups must be restorable from canonical sources.
Do not require raw vector/graph internals for portability.

---

## 9. Read/write adapter boundaries

### 9.1 Rule
No UI, skill, workflow, or agent may rely on direct raw store access as its primary interface.
Use adapters/services.

### 9.2 Write-side services
Minimum writers:
- WorkspaceWriter
- ProjectWriter
- EpicWriter
- IssueWriter
- TaskWriter
- PlanWriter
- PRDWriter
- ArtifactWriter
- ReviewWriter
- WorkflowRunWriter
- TeamWriter
- TeamInstanceWriter
- PolicyWriter
- SyncWriter
- MemoryWriter
- VectorIndexWriter
- GraphMemoryWriter

### 9.3 Read adapters
Minimum read adapters:
- WorkspaceReadAdapter
- ProjectReadAdapter
- EpicReadAdapter
- IssueReadAdapter
- TaskReadAdapter
- PRDReadAdapter
- PlanReadAdapter
- BoardReadAdapter
- AgentRunReadAdapter
- AgentStatusReadAdapter
- AgentHeartbeatReadAdapter
- AgentProgressReadAdapter
- TeamReadAdapter
- TeamInstanceReadAdapter
- WorktreeReadAdapter
- MergeQueueReadAdapter
- ReviewReadAdapter
- ArtifactReadAdapter
- ReplayReadAdapter
- EventReadAdapter
- MetricsReadAdapter
- MemoryTraceReadAdapter
- SyncStateReadAdapter
- SyncConflictReadAdapter
- PolicyReadAdapter
- PolicyDecisionReadAdapter
- WorkflowReadAdapter
- WorkflowRunReadAdapter
- SkillReadAdapter

### 9.4 Adapter minimum interface
For each adapter:
- get(id)
- list(filters)
- search(query|filters)
- related(id)
- for_project(project_id)
- for_workspace(workspace_id)
- current() where relevant
- between(start, end) where time-based
- tail(...) where stream-like

### 9.5 Canonical write flow
1. write canonical object/state to SQLite or filesystem
2. emit event
3. update projections
4. update FTS/vector/graph indexes

Never make vector/graph the first successful write path.

---

## 10. Memory architecture

### 10.1 Unified memory fabric
The system uses one unified memory fabric with scopes:
- global
- project
- file

All scopes must be searchable from anywhere.

### 10.2 Recall modes
- relevant compact recall (default)
- total recall ranked
- total recall timeline
- total recall sourcemap

### 10.3 Default recall behavior
Default returns top 8 compact memory results with:
- memory id
- summary
- scope
- file path
- symbol path if applicable
- optional span
- why it matched
- score or ranking hints

No full text by default.

### 10.4 Path-based full reads
If more detail is required, the system opens the file/artifact/path directly using path/span references.

### 10.5 Memory kinds
Suggested kinds:
- fact
- summary
- symbol
- decision
- procedure
- error
- diff
- doc
- code
- task_goal
- task_decision
- task_failure
- task_outcome

### 10.6 Memory fields
Each memory record should support:
- memory_id
- scope
- kind
- workspace_id
- project_id
- file_path
- symbol_path
- title
- summary
- canonical_text
- tags
- entities
- created_at
- event_time
- last_seen_at
- importance
- freshness
- content_hash
- provenance refs
- task_id
- issue_id
- artifact_id

### 10.7 Memory retrieval ranking
Combine:
- semantic relevance
- lexical relevance
- recency
- importance
- task match
- entity overlap
- current project/file bias
- graph distance if available

### 10.8 Task-memory relation
Tasks are control state. Memory is durable intelligence.
Task events write selective memories:
- goal summary
- key decisions
- discoveries
- failures
- outcomes

### 10.9 Project/code memory ingestion
Project and code memory are first-class ingestion streams.

Ingestion sources:
- project docs
- configs
- READMEs
- scripts
- build files
- code files
- symbols
- tests
- errors
- diffs
- selected command/test outputs

### 10.10 Indexing policy
For git projects:
- respect .gitignore
- overlay with .piinclude and .piignore

For non-git projects:
- use PI overlays and binary/generated heuristics

### 10.11 Code indexing pipeline
Code gets:
- lexical indexing
- metadata indexing
- file/symbol/module summaries
- AST/symbol indexing

Desired stack:
- lexical search engine
- grep fallback
- Tree-sitter parsing
- tags/symbol tools
- optional deeper code-intelligence helpers

### 10.12 Ingestion triggers
- live watch for local changes
- git diff catch-up on session start
- scheduled integrity refresh
- incremental parse/index updates only where possible

---

## 11. Task management and board model

### 11.1 Core split
- Issues: human-facing work tracking
- Tasks: executable units for agents
- Subtasks: child execution units or smaller tracking units where needed

### 11.2 Board rule
The board is a projection over issues/tasks/state.
It is never the source of truth.

### 11.3 Dependencies
Task dependencies are explicit and typed.

Suggested relation types:
- blocks
- requires_context_from
- must_merge_before
- conflicts_with
- reviewed_by
- verifies

### 11.4 Till-done philosophy
Non-trivial work should be task-aware and remain visible until:
- done criteria are met
- blocked state is reached
- user stops it

### 11.5 Board projection types
- issue board
- task board
- blocked board
- review queue
- merge queue
- cycle board
- workload board

### 11.6 Planning artifacts
The board system integrates with:
- PRDs
- plans
- issue decomposition artifacts
- task outcome artifacts
- review artifacts

### 11.7 Estimates
Optional lightweight size/weight fields exist for tasks/issues/cycle analytics.

---

## 12. Skills strategy

### 12.1 Default stance
Use native skills for almost everything.

### 12.2 Coded workflow promotion rule
Promote a skill into a coded workflow only when it needs:
- deterministic outputs
- structured state transitions
- artifact contracts
- task/board integration
- orchestration hooks
- stronger validation

### 12.3 Promoted workflows
Promote these first:
- grill-me
- write-a-prd
- prd-to-plan
- prd-to-issues
- selected gstack planning/context flows

### 12.4 Imported skills governance
Keep imported skill repos mostly intact.
Use light governance only:
- source
- version pin
- enabled/disabled
- reviewed/trusted
- local override

### 12.5 Execution preference
- native skill first
- coded workflow only for promoted skills

### 12.6 Override precedence
Local always wins.

---

## 13. Workflow engine

### 13.1 Runtime philosophy
Use a thin local workflow runner.
Do not adopt a giant external orchestrator.

### 13.2 Workflow shape
- ordered steps or DAG
- DAG support required

### 13.3 Workflow files
Each coded workflow should include:
- SKILL.md (entrypoint/description)
- workflow.yaml
- schemas/
- scripts/
- templates/

### 13.4 Built-in step types
- prompt_user
- read_memory
- search_web
- read_project
- run_skill
- run_script
- create_issue
- create_task
- spawn_agent
- invoke_team
- wait_for_task
- review_artifact
- write_memory
- write_artifact
- validate_schema
- gate
- complete

### 13.5 Human-input steps
First-class.
Used for flows like grill-me and clarification.

### 13.6 Retries
Step-level only.

### 13.7 Timeouts
- per step
- per workflow

### 13.8 Failure semantics
Blocked and failed remain separate.

### 13.9 Resumability
Persist:
- workflow state
- step states
- inputs/outputs
- retry counts
- artifact refs
- handoff refs
- linked task ids

### 13.10 Agent binding
Role/profile based, not hardcoded raw provider/model by default.

### 13.11 Team invocation constraint
Only L1 may invoke teams.
Workflow/runtime/policy must enforce this.

### 13.12 Task hooks
Required hook points:
- on_workflow_created
- on_workflow_started
- on_step_completed
- on_workflow_blocked
- on_workflow_failed
- on_workflow_completed

### 13.13 Artifact and memory declarations
Workflow steps must declare what artifacts/memory kinds they may write.

---

## 14. Handoff packets and artifact contracts

### 14.1 Rule
Every non-trivial delegation uses a structured handoff packet.

### 14.2 Default handoff mode
artifact_first_brief

### 14.3 Handoff modes
- brief
- contextual
- artifact_first_brief
- branched_session

Transcript forwarding is allowed only in branched_session mode.

### 14.4 Handoff packet minimum fields
- handoff_id
- from
- to
- task_id
- issue_id
- project_id
- workspace_id
- goal
- task_type
- priority
- scope
- inputs
- constraints
- done_criteria
- artifact_contract_id
- handoff_mode
- created_at

### 14.5 Artifact contracts
Every workflow/task requiring outputs should have an artifact contract.

Fields:
- artifact_contract_id
- task_id
- required artifacts
- optional artifacts
- final summary artifact
- review inputs
- merge readiness rules

### 14.6 Artifact catalog
Standard artifact types include:
- prd
- plan
- issue_breakdown
- context_gathering_report
- patch
- changed_files_manifest
- command_log
- test_report
- benchmark_report
- review_report
- integration_report
- merge_conflict_report
- risk_report
- research_note
- source_digest
- comparison_matrix
- memory_promotion_summary
- task_outcome_summary

### 14.7 Artifact formats
Use:
- Markdown for human-readable artifacts
- JSON sidecars where useful
- diff files for patches
- logs where needed

### 14.8 Worker return object
Every worker returns structured output with:
- run_id
- task_id
- status
- summary
- artifacts
- files_changed
- tests
- memory_writes
- merge_readiness
- risks

### 14.9 Validation
Deterministic schema validation is mandatory pre-dispatch and on completion.

### 14.10 Failure artifacts
Blocked/failed runs must produce failure artifacts.

---

## 15. Team composition and routing

### 15.1 Team system
Use:
- TeamTemplate
- TeamInstance

### 15.2 Team invocation rule
Only L1 may create or invoke teams.

### 15.3 Slot-based composition
Teams are composed of member slots, not loose lists.

Each slot includes:
- slot_id
- role
- required/optional
- agent_profile binding
- provider/model defaults via PI profile mapping
- count_min
- count_max
- spawn_mode
- allowed_tools
- write_level
- team_permissions
- fallbacks

### 15.4 Role vocabulary
Suggested starting roles:
- chief_of_staff
- context_gatherer
- prd_planner
- implementation_planner
- issue_decomposer
- architecture_reviewer
- research_worker
- implementer_backend
- implementer_frontend
- refactor_worker
- browser_worker
- tester
- reviewer
- security_reviewer
- performance_reviewer
- integration_worker

### 15.5 Team selection logic
L1 decides among:
- native skill
- single specialized agent
- coded workflow
- team

### 15.6 Team selection conditions
Use a team when:
- work is multi-phase
- multiple specialties are required
- parallelism is useful
- review/integration complexity is meaningful
- planning + implementation + validation are all needed

### 15.7 PI-native profile mapping
Roles map to PI-native profiles.
Your system does not replace PI profiles.

### 15.8 Routing target
PI-native profile first.
Use explicit fallback chains.

### 15.9 Fallbacks
Fallbacks degrade by:
- cost/latency
- specialization
Never silently escalate privileges.

### 15.10 Concurrency policy
Enforce caps at:
- per slot
- per team instance
- per project
- global

### 15.11 Team policies
Each team may define:
- communication mode
- memory policy
- worktree policy
- review policy
- budget class
- latency class
- quality class

### 15.12 Cross-team scheduler
Use centralized cross-team scheduling, not first-come-first-served by teams.

### 15.13 Team observability
Monitor/board/tasks must show:
- team template
- team instance id
- purpose
- active members
- role per member
- resolved PI profile per member
- provider/model as exposed by PI/run state
- blocked reason
- current tasks
- concurrency usage
- worktrees in use

---

## 16. PI-native profile usage and routing constraints

### 16.1 Base truth
PI-native profiles/providers remain the runtime truth.

### 16.2 Your layer adds only
- semantic roles
- routing decisions
- fallback chains
- concurrency caps
- governance
- visibility

### 16.3 Role mapping
Use roles mapped to PI profiles.
Do not hardcode raw model/provider strings across workflow logic unless absolutely required.

### 16.4 Routing order
1. task/workflow requirement
2. team slot preferred PI profile
3. role default PI profile
4. explicit fallback PI profile
5. escalate back to L1 if no fit

### 16.5 Visibility
Monitor must show:
- semantic role
- resolved PI profile
- current task/run
- heartbeat
- status
- blocker
- worktree if any
- model/provider in use if PI exposes it

### 16.6 Concurrency
Policy layer decides spawn allowance.
PI executes.

---

## 17. Orchestration, workers, and communication

### 17.1 Default orchestration
Single lead plus isolated workers.

### 17.2 Worker communication
Direct worker messaging is only allowed in team mode.

### 17.3 Handoff default
artifact_first_brief

### 17.4 Merge ownership
Dedicated integration worker.

### 17.5 Non-git fallback
Sequential writers only by default.

### 17.6 Worker session/state
Each worker receives:
- task packet
- project/workspace scope
- memory refs
- file/symbol refs
- constraints
- done criteria
- artifact contract
- worktree info if applicable

### 17.7 Worker outputs
Workers produce:
- structured run result
- artifacts
- memory updates
- task status events
- risks/blockers

### 17.8 Optional team/sprint extensions
If supported by available PI extensions, include:
- side-agent sprint style runs
- long-lived team messaging mode
- worktree-backed agent runs
but still under the core constraints above

---

## 18. Worktrees, branches, merge queue, integration

### 18.1 Worktree rule
Worktrees are used only for parallel write runs in git repos.

### 18.2 Branch strategy
Short-lived topic branches.

### 18.3 Merge queue
Required for all git-backed write work.

### 18.4 Merge ownership
Integration worker owns merge/rebase integration.

### 18.5 Conflict handling
Agent first, human on risky/unresolved.

### 18.6 Worktree cleanup
Temporary by default.

### 18.7 Non-git writing
Sequential by default.

### 18.8 Worktree lifecycle
1. validate repo state
2. allocate worktree and branch
3. execute task
4. capture patch/diff/artifacts
5. queue for review/integration
6. merge or discard
7. cleanup worktree
8. prune/repair metadata as needed

### 18.9 Preconditions
Before allocating worktree:
- repo exists
- clean working tree for parallel write mode
- task eligible
- branch naming resolved
- dependencies satisfied

### 18.10 Merge readiness requirements
- patch artifact exists
- review approved
- required test/report artifacts exist
- dependency blockers cleared
- integration validation passes

### 18.11 Submodule integration
Treat submodule as separate project scope.
Merge submodule work first, then parent pointer update.

---

## 19. Monitor, observability, and live status

### 19.1 Architecture
- append-only event stream
- materialized projections
- read-only local monitor
- CLI summaries over same state

### 19.2 Monitor scope
Global + project filter.

### 19.3 Transport
SSE first.

### 19.4 Event storage
Both DB and append-only log.

### 19.5 Replay
Both task and run replay supported.

### 19.6 Alerts
Passive dashboard alerts.

### 19.7 Plane visibility
Only selected planning views and planning analytics sync outward.

### 19.8 Hard rule
Every agent/run must expose queryable progress without requiring an LLM.

#### Required queryable state
- current status
- current task/subtask
- current workflow step
- progress percent or stage
- latest heartbeat
- current file/path/scope
- current artifact being produced
- blocker if any
- recent tool/action summary
- queue/wait state
- worktree/branch if applicable

### 19.9 Event schema
Every event should include:
- evt_id
- evt_type
- ts
- workspace_id
- project_id
- optional object refs
- actor_type
- actor_id
- payload
- severity
- trace_id
- span_id
- correlation_id

### 19.10 Key event types
- project_registered
- epic_created
- issue_created
- task_created
- task_status_changed
- team_created
- team_invoked
- agent_run_created
- agent_run_started
- agent_run_progress
- agent_run_blocked
- agent_run_failed
- agent_run_finished
- handoff_created
- handoff_consumed
- artifact_written
- artifact_validated
- memory_written
- memory_recalled
- worktree_allocated
- merge_queued
- merge_started
- merge_conflicted
- merge_completed
- review_created
- validation_started
- validation_finished
- policy_denied
- hook_executed

### 19.11 Required monitor views
- global command center
- project board
- agent fleet view
- merge queue
- artifact browser
- memory trace
- session/run replay
- burndown/cycle analytics

### 19.12 Read adapters
All major state/data sources must have read adapters.
This includes agent status/session/progress.

---

## 20. Metrics and analytics

### 20.1 Metric families
- planning metrics
- execution flow metrics
- quality/integration metrics
- agent/orchestration metrics
- memory/recall analytics

### 20.2 Burndown
Support:
- issue burndown
- task burndown
- optional points/weights

Track:
- committed work
- added scope
- done work
- blocked fraction

### 20.3 Planning metrics
Examples:
- issues_created_per_cycle
- tasks_created_per_issue
- subtasks_created_per_task
- planned_vs_completed_items
- scope_change_count
- rollover_items
- plan_revision_count
- prd_to_plan_latency
- plan_to_issue_latency

### 20.4 Flow metrics
Examples:
- task_cycle_time
- issue_cycle_time
- lead_time
- time_in_status
- blocked_duration
- queue_wait_time
- review_wait_time
- merge_wait_time
- WIP count
- tasks completed per day

### 20.5 Quality/integration metrics
Examples:
- review turns per task
- review rejection rate
- merge conflict rate
- conflict resolution time
- validation failure rate
- reopen rate
- retry rate
- failed run rate
- post-merge failure rate

### 20.6 Agent/orchestration metrics
Examples:
- runs started/completed/blocked/failed per agent
- average run duration
- handoff count per task
- provider/model usage
- concurrency usage
- team invocations per project

### 20.7 Memory analytics
Examples:
- memory recalls per task
- memory hit rate
- memory promotions per cycle
- scope distribution
- recall_to_open_path_ratio
- duplicate_memory rate
- failed recall escalations

### 20.8 Forecasting
Advisory only.

### 20.9 Plane sync of analytics
Planning analytics only.

---

## 21. Security, policy, secrets, and execution boundaries

### 21.1 Default model
Default allow.

### 21.2 Policy scopes
Layered scopes:
1. system
2. user
3. workspace
4. project
5. team/agent
6. workflow step

More specific deny wins.
Later scopes may tighten but not loosen hard denies.

### 21.3 Rule actions
- allow
- deny
- audit_only

### 21.4 Matchers
Support matchers for:
- tool
- command
- path
- regex
- domain/network
- agent/team
- workflow/step
- artifact
- secret-content

### 21.5 Enforcement
Deterministic pre-execution checks required before:
- tool invocation
- shell/script execution
- browser/network action
- file writes/deletes/moves
- artifact export
- team invocation
- workflow step execution

### 21.6 Secret guard
Dedicated secret guard required.

Rules:
- no secret storage in memory by default
- no secret sync to Plane
- no secret placement in artifacts/logs by default
- no unauthorized outbound secret use
- secret redaction in logs/events by default

### 21.7 Path/workspace boundaries
Distinguish:
- project roots
- agent-home roots
- worktree/temp roots
- external filesystem paths

### 21.8 Network boundaries
Policy must support domain/host/scheme/port restrictions.

### 21.9 Sandboxing
Optional selective only.

### 21.10 Hard orchestration invariants
Enforce in policy:
- only L1 can invoke teams
- only integration worker can merge queue entries
- non-authorized roles cannot mutate protected areas
- non-authorized roles cannot modify team registry

### 21.11 Audit events
Log policy events such as:
- policy_checked
- policy_denied
- policy_audited
- secret_redacted
- secret_blocked
- boundary_violation_detected

### 21.12 Security read adapters
Required:
- PolicyReadAdapter
- PolicyDecisionReadAdapter
- SecretEventReadAdapter
- BoundaryViolationReadAdapter

---

## 22. Plane adapter and sync boundaries

### 22.1 Scope
Plane is the only external adapter currently in scope.

### 22.2 Authority
Local system remains authoritative.

### 22.3 Direction
Default local → Plane.
Architecture can support two-way later, but current default remains local-primary.

### 22.4 Conflict policy
Local wins by default.
No silent destructive external overwrite.

### 22.5 Artifact sync
Summaries/links by default, not full raw content.

### 22.6 Adapter structure
Split into:
- mapping layer
- transport layer
- sync-policy layer

### 22.7 Trigger model
Mixed triggers:
- manual
- event-driven
- batch
- scheduled reconciliation

### 22.8 Sync state fields
Each synced object should track:
- sync_target
- external_id
- last_synced_at
- sync_status
- last_sync_hash
- last_sync_error
- direction
- conflict_state

### 22.9 What may sync to Plane
- project
- epic
- issue
- task summaries
- cycles/milestones
- statuses
- priorities
- blocked reasons
- assignee/team labels
- selected comments/summaries
- artifact links
- planning analytics

### 22.10 What must not sync by default
- raw memory entries
- raw event stream
- low-level agent chatter
- provider/model internals
- full worker transcripts
- secret-bearing artifacts
- security internals

### 22.11 Sync read adapters
- SyncStateReadAdapter
- SyncConflictReadAdapter
- SyncQueueReadAdapter
- ExportHistoryReadAdapter

---

## 23. Native and coded workflow catalog

### 23.1 Native skills by default
Use native skills for most:
- process guidance
- playbooks
- conventions
- lightweight advisory flows
- checklists
- review heuristics

### 23.2 Promoted coded workflows
Required initial coded workflows:
- grill-me
- write-a-prd
- prd-to-plan
- prd-to-issues
- selected gstack planning/context flows

### 23.3 grill-me requirements
- first-class human-input
- resumable
- structured output artifact
- task context memory write
- updates plan/PRD draft where needed

### 23.4 write-a-prd requirements
- template-backed
- may call context gathering
- outputs PRD artifact and linked objects

### 23.5 prd-to-plan requirements
- input PRD artifact
- output plan artifact + tasks/issues

### 23.6 prd-to-issues requirements
- input PRD/plan
- output issue/task graph + board updates

---

## 24. Queryable live status contract

### 24.1 Hard requirement
At any point the system must expose enough tools/APIs to:
- check the status of each agent
- read the live state of its session/run
- get a quick update without using LLM summarization

### 24.2 Three inspection levels
1. Quick status
2. Structured live state
3. Session read/event tail

### 24.3 Required CLI/API surfaces
Examples:
- agent status <agent|run>
- agent tail <agent|run>
- agent session <agent|run>
- agent blockers
- agent heartbeats
- agent artifacts <run>

### 24.4 Required data
- status
- assignment
- current step
- heartbeat
- blockers
- current paths/files
- artifacts
- worktree
- model/profile
- recent event tail

---

## 25. Testing and validation

### 25.1 Validation style
Layered tests + scenario evals.

### 25.2 Done definition
A feature/subsystem is done only when it has:
- implementation
- read path
- observability path
- tests

### 25.3 Required golden scenarios
1. research-only request
2. grill-me planning flow
3. single-agent implementation
4. team feature build
5. non-git project flow
6. submodule-aware change
7. deny-rule trip
8. Plane sync drift/conflict

### 25.4 Acceptance tests by subsystem
Must exist for:
- core objects/state
- tasks/board
- memory
- code/project indexing
- workflows
- teams/routing
- worktrees/integration
- monitor/analytics
- security/policy
- Plane sync

### 25.5 Evaluation priorities
1. correctness
2. observability
3. speed

---

## 26. Phased implementation plan

### Phase 0: skeleton and contracts
Build:
- typed IDs
- object schemas
- SQLite schema skeleton
- adapter interfaces
- event schema
- artifact path rules
- policy skeleton

Exit:
- create/read/update for main objects
- basic read adapters
- static monitor current state

### Phase 1: core control plane
Build:
- workspaces/projects/issues/tasks/subtasks/epics
- event log + projections
- board projection
- read adapters
- monitor basic views

Exit:
- local GitHub-like workflow model works
- board updates from state
- CLI and monitor inspection work

### Phase 2: memory + indexing
Build:
- project/code ingestion
- ignore overlay behavior
- lexical/symbol/summary indexing
- memory facade
- Qdrant + graph integration
- recall APIs

Exit:
- project/file/global memory works
- total recall works
- git and non-git indexing works

### Phase 3: workflows
Build:
- thin DAG workflow runner
- handoff packets
- artifact contracts
- human-input steps
- promoted coded workflows

Exit:
- planning flows run end-to-end
- artifacts and tasks generated correctly

### Phase 4: routing and single-worker execution
Build:
- role mapping to PI profiles
- routing policy
- fallback chains
- single-worker lifecycle
- live status without LLM

Exit:
- L1 routes correctly
- runs observable and queryable

### Phase 5: teams and orchestration
Build:
- team templates/instances
- slot-based resolution
- concurrency caps
- L1-only team invocation
- team monitor views

Exit:
- teams run correctly
- visible and governed

### Phase 6: worktrees and integration
Build:
- worktree allocator
- merge queue
- integration worker
- review/test artifacts
- conflict handling

Exit:
- git-backed parallel write flow works safely
- non-git fallback works

### Phase 7: security and policy hardening
Build:
- deny rules
- secret guard
- pre-execution enforcement
- audit views
- policy read adapters

Exit:
- deterministic blocking works
- audit visible
- invariants enforced

### Phase 8: Plane adapter
Build:
- local → Plane sync
- sync state tracking
- conflict tracking
- planning analytics sync
- artifact summary/link sync

Exit:
- Plane reflects local planning state
- local stays authoritative

### Phase 9: analytics and polish
Build:
- burndown
- throughput
- blocked time
- review/merge metrics
- memory effectiveness analytics
- forecasting advisories
- UX polish

Exit:
- monitor gives useful operational insight
- planning analytics are stable enough to rely on

---

## 27. Immediate implementation backlog

### Wave 1
- finalize object schema and IDs
- create SQLite schema skeleton
- create agent-home layout
- implement read/write adapter interfaces
- implement event schema/projections skeleton

### Wave 2
- tasks/issues/epics/subtasks/board core
- monitor basic read-only UI
- live agent status model/adapters
- CLI inspection tools

### Wave 3
- memory facade
- code/project ingestion
- recall APIs
- Qdrant and graph boundaries

### Wave 4
- workflow runner
- handoff packets
- artifact contracts
- promoted coded workflows

### Wave 5
- L1 routing layer
- role → PI profile mapping
- single-worker execution
- team composition/scheduling

### Wave 6
- worktrees
- merge queue
- integration worker
- review/test artifacts

### Wave 7
- deny rules
- secret guard
- audit views

### Wave 8
- Plane adapter
- analytics
- polish

---

## 28. Implementation invariants checklist

These are hard invariants and should be tested explicitly:

- only L1 can invoke teams
- board is never canonical truth
- tasks and memory remain logically separate
- adapters are the official access path
- canonical writes happen before index writes
- memory never defaults to full text dumping
- project/file/global scopes are all reachable
- agent status is queryable without LLM
- non-git writers are sequential by default
- git parallel writers use worktrees
- integration worker owns merge queue
- policy checks occur pre-execution
- secrets are guarded/redacted by default
- Plane never silently overrides local truth

---

## 29. Open implementation details to finalize during build

These are not unresolved architectural debates; they are concrete implementation details to freeze during engineering:

- exact local search/crawl package choices and wrappers
- exact initial graph backend implementation behind the memory facade
- exact agent-home folder naming/versioning
- exact Plane field mapping
- initial shipped team templates
- initial canonical role vocabulary
- hook catalog and default enabled gates
- exact estimate field representation
- canonical adapter method signatures and schemas

These should be finalized in an implementation appendix or v0.2 spec update, not by changing the core decisions.

---

## 30. Final summary

This system is a local-first PI-based agent operating system with:
- PI as runtime base
- native skills by default
- selected coded workflows for planning/context-intensive flows
- a strong local control plane
- unified but scoped memory
- project/code ingestion as first-class memory
- task-aware orchestration
- worktree-backed git integration
- read-only mission control UI
- deterministic policy/secret enforcement
- Plane as the only external sync target in current scope
- full read adapters and live status visibility without LLM dependence

This spec is intended to be executable as an engineering contract.

