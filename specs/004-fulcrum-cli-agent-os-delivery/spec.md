# Feature Specification: Fulcrum CLI Agent OS Full Product Delivery

**Feature Branch**: `004-fulcrum-cli-agent-os-delivery`
**Created**: 2026-04-24
**Status**: Draft
**Input**: User description: "Fulcrum CLI Agent OS full product delivery, based on FULCRUM_PRODUCT.md, SRS.md, SRS-ammend-01.md, SRS-ammend-02.md, and the Fulcrum constitution. Treat as full product delivery spec. SRS-ammend-02 is the final language-direction source when conflicts exist."

## Clarifications

### Session 2026-04-24

- Q: Which task and run lifecycle states must implementation enforce? -> A: SRS-defined task transitions and run statuses.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Install And Prove Local Readiness (Priority: P1)

As a solo developer/operator, I want to install Fulcrum locally, verify what it can and cannot do on my machine, and receive exact next actions for missing capabilities so that I can trust the product before assigning agent work.

**Why this priority**: The product cannot be adopted unless first-run setup proves local ownership, privacy posture, optional dependency status, and recovery basics without requiring cloud setup.

**Independent Test**: Can be fully tested on a clean developer machine by running setup preview, applying selected local setup, opening doctor output, and confirming that all required local capabilities, optional integrations, privacy status, and next actions are visible in human-readable and machine-readable forms.

**Acceptance Scenarios**:

1. **Given** a machine with no Fulcrum state, **When** the operator previews setup, **Then** Fulcrum shows the local state locations, changes it would make, required tools, optional tools, privacy defaults, and no irreversible action is taken.
2. **Given** the operator approves setup, **When** setup completes, **Then** Fulcrum creates inspectable local state, records setup status, and reports a readiness summary.
3. **Given** optional tools or integrations are missing, **When** doctor runs, **Then** each capability is classified as managed, detected, guided, optional, blocked, degraded, disabled, or unknown with an exact next action.
4. **Given** the operator requests machine-readable status, **When** doctor output is requested for automation, **Then** Fulcrum returns the same capability states, blocking flags, next actions, and privacy status as the human surface.
5. **Given** network access is unavailable, **When** setup and doctor inspect core local capabilities, **Then** Fulcrum completes local checks and marks remote-only checks as disabled or degraded instead of failing the product.

---

### User Story 2 - Register Projects And See Local Work Cockpit (Priority: P1)

As an operator working across many repositories, I want a local cockpit that shows projects, tasks, queues, run status, health, blockers, and artifacts from Fulcrum-owned state so that I can supervise software work from one place without relying on an external project management system.

**Why this priority**: SRS-ammend-02 and the product vision make cockpit-first operation central. Fulcrum must own the local work surface rather than act only as a wrapper over Plane or another remote tool.

**Independent Test**: Can be fully tested by registering two local repositories, creating local tasks, opening cockpit and CLI task views, and verifying both surfaces show the same projects, queues, health, and task/run counts from local state.

**Acceptance Scenarios**:

1. **Given** two local Git repositories, **When** the operator registers them, **Then** Fulcrum assigns stable local project IDs and records root path, default branch, worktree policy, enabled tools, ignored paths, quality gates, privacy mode, and health state.
2. **Given** registered projects and local tasks, **When** the operator opens the cockpit, **Then** Fulcrum shows a global board, per-project board, task queues, blockers, review queue, merge queue, live activity, and health/degraded capability status.
3. **Given** the operator uses the CLI, cockpit, and machine-readable output for the same project, **When** each surface lists tasks and runs, **Then** counts, statuses, IDs, and degraded states agree or explicitly show stale/partial data.
4. **Given** an external project management integration is not configured, **When** the operator creates and manages local tasks, **Then** Fulcrum provides full local workflow support without remote setup.

---

### User Story 3 - Mirror Optional External Project Management (Priority: P2)

As an operator who already plans work in an external project management system, I want Fulcrum to import, link, sync, and write back selected work while keeping Fulcrum's local task and run state canonical for execution.

**Why this priority**: Optional PM integration adds adoption value, but the full product must not make any external PM tool the hidden source of truth.

**Independent Test**: Can be fully tested with a simulated or configured PM adapter by importing work, disconnecting the adapter, continuing local runs, reconnecting, and verifying sync status, conflicts, and writeback previews.

**Acceptance Scenarios**:

1. **Given** valid external PM configuration, **When** the operator imports work items, **Then** Fulcrum creates local task mirrors with separate local IDs and external IDs.
2. **Given** imported tasks, **When** the remote system becomes unreachable, **Then** existing local tasks, runs, context packs, artifacts, and queues remain usable.
3. **Given** local and remote task data diverge, **When** sync status is viewed, **Then** Fulcrum shows never synced, synced, local newer, remote newer, conflict, failed, or disabled with provenance and next action.
4. **Given** a run completes and writeback is configured, **When** Fulcrum prepares an external comment or status update, **Then** the operator can preview, approve, deny, or postpone the externally visible action.
5. **Given** a PM integration is disabled, **When** the operator views linked tasks, **Then** Fulcrum preserves local task history and marks external writeback unavailable without data loss.

---

### User Story 4 - Start Supervised Agent Runs (Priority: P1)

As an operator, I want to assign a task to a configured CLI agent and watch a supervised run with status, heartbeat, context, worktree, logs, artifacts, policy decisions, and final outcome so that agent work is visible and recoverable.

**Why this priority**: Agent orchestration is the center of the product identity. Runs are the unit that connects tasks, context, worktrees, evidence, policy, artifacts, and review.

**Independent Test**: Can be fully tested with a deterministic validation agent that emits heartbeat, writes a file, attaches an artifact, runs a quality gate, and completes, while the operator observes consistent run lifecycle data across cockpit, CLI, JSON, and MCP surfaces.

**Acceptance Scenarios**:

1. **Given** a ready task and a configured agent, **When** the operator starts a run, **Then** Fulcrum creates a run linked to task, project, agent, worktree allocation, context pack, policy state, event stream, and artifact location.
2. **Given** a run is active, **When** the agent emits heartbeat and progress events, **Then** Fulcrum updates live status and event history with timestamps and source.
3. **Given** an agent stops unexpectedly, **When** Fulcrum detects process exit or stale heartbeat, **Then** it records a truthful state, preserves logs and file-change evidence, and does not assume the workspace is clean.
4. **Given** the operator cancels a run, **When** cancellation is requested, **Then** Fulcrum records the request, attempts a controlled stop, preserves artifacts, and reaches exactly one terminal state.
5. **Given** a completed run, **When** the operator opens run details, **Then** Fulcrum shows final summary, changed files or diff summary when available, quality gates, policy decisions, artifacts, context reference, and required review actions.

---

### User Story 5 - Build Explainable Context Packs (Priority: P1)

As an operator or agent, I want Fulcrum to build context packs from task details, memory, exact code evidence, structural evidence, recent runs, artifacts, policies, and graph links so that agents receive useful context with traceable reasons and limits.

**Why this priority**: Context quality is where Fulcrum creates leverage. The product must distinguish cited evidence from opaque retrieval and make degraded lanes visible.

**Independent Test**: Can be fully tested by creating a task linked to local memory and code, building a context pack offline, and checking that each included item has source reference, freshness, inclusion reason, evidence type, confidence or limitation, and budget handling.

**Acceptance Scenarios**:

1. **Given** a task with relevant memory and code, **When** a context pack is built, **Then** Fulcrum includes task details, local memory, exact code evidence, structural evidence when available, recent run state, artifacts, quality gates, and policy constraints.
2. **Given** one source has many possible results, **When** the context budget is limited, **Then** Fulcrum avoids letting that source dominate unless the query explicitly targets it.
3. **Given** memory search is unavailable, **When** context is built, **Then** the memory lane is marked degraded and Fulcrum uses documented local fallback evidence where possible.
4. **Given** exact code matches and semantic matches both exist, **When** results are ranked, **Then** exact, path, and structural evidence are clearly distinguished from semantic or ranked evidence.
5. **Given** budget excludes useful items, **When** the context pack is viewed, **Then** Fulcrum reports omitted lanes or items with reasons.

---

### User Story 6 - Search Code With Provenance (Priority: P1)

As an operator or agent, I want code search to find exact identifiers, paths, filenames, strings, errors, symbols, imports, exports, dependencies, and optional semantic results with source references so that work starts from inspectable evidence rather than guesswork.

**Why this priority**: Fulcrum is a code-work operating layer. Exact and structured code evidence must be strong even without a graph database, vector database, or always-on language server.

**Independent Test**: Can be fully tested by searching a local repository for identifiers, paths, error strings, imports, symbols, and optional semantic terms, then checking source-line references, ignored path behavior, result explanations, and stale index cleanup after rename/delete.

**Acceptance Scenarios**:

1. **Given** a local repository, **When** an exact identifier search is requested, **Then** Fulcrum returns matching files and source references with query, evidence type, ignored paths, result count, and freshness.
2. **Given** a file is renamed or deleted, **When** code evidence is refreshed or rebuilt, **Then** stale references are removed or marked stale.
3. **Given** optional semantic search is disabled, **When** exact and structural search are available, **Then** core code search continues without semantic backend failure.
4. **Given** ignored files contain sensitive names or paths, **When** code search runs, **Then** ignored content is excluded and exclusion is reflected in provenance.
5. **Given** a result came from broad repo packaging or repo map evidence, **When** the result is shown, **Then** Fulcrum labels the source and limitations instead of presenting it as exact line evidence.

---

### User Story 7 - Preserve And Recall Project Memory (Priority: P1)

As an operator, I want Fulcrum to capture, curate, search, stale-mark, and export local project memory with raw source provenance so that useful decisions, gotchas, procedures, and handoffs survive across sessions and agents.

**Why this priority**: Cross-agent memory is a core local OS capability. It must be useful without becoming an opaque or unsafe permanent memory sink.

**Independent Test**: Can be fully tested by importing markdown memory, searching it from a task, completing a run with a proposed memory update, approving it, marking linked files stale after rename/delete, and exporting the memory record with source references.

**Acceptance Scenarios**:

1. **Given** local markdown memory files, **When** memory is indexed or searched, **Then** Fulcrum returns entries with title, excerpt, source file, linked tasks/runs/files, freshness, status, backend, rank, and reason when available.
2. **Given** an agent proposes a durable memory update, **When** the run completes, **Then** Fulcrum stores the update as draft until policy and operator approval allow permanent memory.
3. **Given** an approved memory update, **When** Fulcrum writes it, **Then** the memory cites raw sources or declares source unavailability and links back to task/run/artifact IDs.
4. **Given** linked code files are deleted or renamed, **When** Fulcrum detects the change, **Then** related memory is marked stale or needs review.
5. **Given** an operator exports local memory, **When** export completes, **Then** memory entries, source references, statuses, and provenance are included without hidden remote dependency.

---

### User Story 8 - Connect Memory, Code, Work, Runs, And Artifacts (Priority: P2)

As an operator, I want Fulcrum to connect tasks, plans, memory, code, runs, artifacts, policy decisions, context packs, and quality gates into an explainable local graph so that I can answer why work happened and what it affected.

**Why this priority**: The product vision requires a memory-code-work graph, but the product should preserve minimum reinvention by making links and projections rebuildable rather than requiring a custom graph database.

**Independent Test**: Can be fully tested by linking a task to memory, code files, a run, a context pack, artifacts, and a policy decision, then answering traceability questions and rebuilding derived projections from canonical records.

**Acceptance Scenarios**:

1. **Given** a completed run, **When** the operator asks what evidence the agent received, **Then** Fulcrum links the run to the exact context pack and context items.
2. **Given** a memory decision cites code files, **When** the operator inspects the decision, **Then** Fulcrum shows linked files, tasks, runs, artifacts, and freshness.
3. **Given** derived graph data is removed or corrupted, **When** rebuild is requested, **Then** Fulcrum reconstructs links from canonical state and documented external sources.
4. **Given** a graph answer depends on stale or missing evidence, **When** the answer is shown, **Then** Fulcrum marks the limitation and gives a next action.

---

### User Story 9 - Deliver Work Through Safe Worktrees (Priority: P1)

As an operator, I want each agent task to work in an isolated worktree or branch with visible dirty state, artifacts, review status, merge readiness, and cleanup safety so that agent work cannot silently damage my main workspace or delete useful changes.

**Why this priority**: Safe delivery is one of the clearest operator-value promises. Worktree safety failures are product failures.

**Independent Test**: Can be fully tested by allocating a worktree, running a deterministic validation agent that creates tracked and untracked changes, attempting cleanup, reviewing artifacts, approving merge readiness, and verifying unsafe cleanup is blocked.

**Acceptance Scenarios**:

1. **Given** a task is ready for agent work, **When** a run starts, **Then** Fulcrum allocates an isolated work area or records a policy-compliant reason for using an existing one.
2. **Given** a worktree has dirty or untracked files, **When** cleanup is requested, **Then** Fulcrum blocks cleanup, explains the block reason, and preserves the work.
3. **Given** a run produced changes, **When** the operator reviews delivery state, **Then** Fulcrum shows diff summary, linked artifacts, quality gates, review findings, conflicts, and merge readiness.
4. **Given** a branch has unpushed commits or unresolved conflicts, **When** cleanup or merge is requested, **Then** Fulcrum requires explicit approval or blocks the action according to policy.
5. **Given** the operator approves safe cleanup, **When** cleanup completes, **Then** Fulcrum records the event and shows that no user work was silently overwritten or deleted.

---

### User Story 10 - Enforce Policy Gates And Privacy Controls (Priority: P1)

As an operator, I want Fulcrum to require approval for destructive, externally visible, permanent-memory, and trust-boundary-crossing actions so that powerful agents cannot perform unsafe actions without review.

**Why this priority**: Fulcrum coordinates agents over private source trees. Safety, privacy, and policy gates are core product behavior, not optional hardening.

**Independent Test**: Can be fully tested by attempting dangerous actions from CLI, cockpit, and MCP surfaces under default policy, then verifying approvals, denials, redaction, privacy status, audit records, and local-only blocking.

**Acceptance Scenarios**:

1. **Given** default policy, **When** an agent requests worktree deletion, branch reset, untracked cleanup, remote writeback, permanent memory write, merge, backup purge, arbitrary shell execution, remote provider call, or sensitive export, **Then** Fulcrum requires policy approval or denies the request.
2. **Given** the operator enables local-only mode, **When** any remote PM, remote model, remote telemetry, or remote observability action is requested, **Then** Fulcrum blocks the action and records the decision.
3. **Given** sensitive values appear in logs, traces, artifacts, or reports, **When** they are stored or displayed, **Then** Fulcrum redacts known secret patterns where possible and marks redaction status.
4. **Given** MCP tools are available to agents, **When** tool permissions are shown, **Then** dangerous tools are visibly gated and loopback or stdio defaults are clear.
5. **Given** the operator configures a project-specific bypass, **When** a gated action matches that bypass, **Then** Fulcrum records the bypass, action type, requester, reason, and scope.

---

### User Story 11 - Run Quality Gates And Capture Proof (Priority: P1)

As an operator, I want Fulcrum to run project-defined quality gates, attach outputs to runs, and enforce required gates before writeback, review, merge, or completion claims so that readiness is evidence-based.

**Why this priority**: Fulcrum values quality gates over optimistic readiness. A run is not complete unless the relevant passing evidence exists. Operator exceptions are recorded as visible review state and do not satisfy release acceptance.

**Independent Test**: Can be fully tested by defining fast, test, lint, format, security, and custom gates for a project, running them from a task/run, causing pass/fail/timeout/skipped states, and verifying gate outputs appear in run artifacts and readiness decisions.

**Acceptance Scenarios**:

1. **Given** a project has quality gates, **When** an operator or agent runs a gate, **Then** Fulcrum records command name, working context, start/end time, duration, status, output references, parsed summary when available, and linked run/task.
2. **Given** a required quality gate fails, **When** the operator attempts to mark a run ready for writeback or merge, **Then** Fulcrum blocks readiness until passing evidence is recorded.
3. **Given** a heavy gate is configured, **When** the operator views gate options, **Then** Fulcrum marks it explicit or asynchronous rather than surprising the operator during common commands.
4. **Given** quality gate output contains sensitive values, **When** Fulcrum stores artifacts, **Then** redaction status is recorded and raw logs remain separate from summaries.
5. **Given** a project does not use an always-on language server, **When** quality status is shown, **Then** Fulcrum explains that configured gates are the readiness authority.

---

### User Story 12 - Backup, Restore, Export, Rebuild, Reset, And Uninstall Safely (Priority: P1)

As an operator, I want Fulcrum to back up, restore, export, rebuild, reset, and uninstall local state with previews and preservation guarantees so that I can recover from mistakes and leave no opaque state behind.

**Why this priority**: Local-first ownership requires the operator to inspect, move, repair, and remove data safely.

**Independent Test**: Can be fully tested by creating projects, tasks, runs, artifacts, memory, policies, and derived data, then backing up, restoring to a clean state, exporting records, rebuilding projections, resetting derived caches, and uninstalling while preserving backups unless explicitly purged.

**Acceptance Scenarios**:

1. **Given** Fulcrum has local state, **When** backup runs, **Then** canonical state, config, artifacts, logs, managed memory, and requested context packs are captured with a restorable manifest.
2. **Given** a backup exists, **When** restore runs, **Then** Fulcrum restores canonical records and verifies run/task/artifact references.
3. **Given** derived data is stale or missing, **When** rebuild runs, **Then** Fulcrum regenerates indexes, projections, repo maps, memory indexes, and code refs from canonical sources or marks unavailable sources.
4. **Given** the operator requests reset or uninstall, **When** Fulcrum previews the action, **Then** it shows exactly what will be removed, preserved, or purged and requires explicit confirmation for destructive choices.
5. **Given** the operator uninstalls without purge approval, **When** uninstall completes, **Then** backups and user work are preserved.

---

### User Story 13 - Use Agent-Facing MCP And Machine Interfaces (Priority: P2)

As an agent, I want Fulcrum to expose task, run, context, memory, code, artifact, quality gate, and policy capabilities through stable local machine interfaces so that I can work within the same rules and evidence visible to the operator.

**Why this priority**: Agents are first-class users of Fulcrum state. Machine interfaces must match cockpit and CLI behavior to prevent split-brain operation.

**Independent Test**: Can be fully tested by having a deterministic validation agent fetch a task, build context, search memory, search code, emit heartbeat, attach artifact, request a policy check, run a quality gate, and complete a run through machine interfaces while the operator observes identical state.

**Acceptance Scenarios**:

1. **Given** an agent requests task details, **When** it uses the machine interface, **Then** Fulcrum returns task data, source links, current run state, policy constraints, and degraded-state notices.
2. **Given** an agent requests context, **When** context is built or retrieved, **Then** the returned resource includes provenance, budget, stale/degraded lanes, and explainability data.
3. **Given** an agent requests a dangerous action, **When** it calls policy check, **Then** Fulcrum returns allowed, denied, or approval-required with reason and audit record.
4. **Given** an agent attaches an artifact, **When** the artifact is accepted, **Then** the operator sees it on the linked run and task with redaction status.
5. **Given** a machine-interface error occurs, **When** the response is returned, **Then** it is structured, actionable, and consistent with human-visible state.

---

### User Story 14 - Operate With Optional Adapters And Degraded Capabilities (Priority: P2)

As an operator, I want every external tool, agent, memory backend, code search backend, semantic backend, PM system, model provider, and telemetry provider to be optional, health-checked, replaceable, and visibly degraded when unavailable so that Fulcrum remains a local product.

**Why this priority**: Minimum reinvention depends on adapters, but product ownership depends on adapters never becoming hidden requirements.

**Independent Test**: Can be fully tested by enabling and disabling representative adapters, simulating unavailable tools and remote services, and verifying core workflows continue with visible degradation and no data ownership transfer.

**Acceptance Scenarios**:

1. **Given** an optional adapter is disabled, **When** the operator views capability status, **Then** Fulcrum shows the disabled state, affected features, fallback behavior, and whether it blocks any workflow.
2. **Given** an adapter is enabled but unhealthy, **When** a workflow reaches that adapter, **Then** Fulcrum degrades explicitly, records failure evidence, and offers next action.
3. **Given** one agent CLI is unavailable, **When** other configured agents are healthy, **Then** Fulcrum continues to support runs with available agents and marks the missing one blocked or guided.
4. **Given** a semantic backend is unavailable, **When** code or memory context is requested, **Then** Fulcrum uses exact/local evidence and marks semantic capability unavailable.
5. **Given** an adapter is replaced, **When** canonical state is inspected, **Then** Fulcrum-owned tasks, runs, artifacts, policies, and provenance remain intact.

---

### Edge Cases

- Core local workflows must still operate when the network is unavailable, remote DNS fails, external PM is unreachable, or remote providers are disabled.
- Setup must not mutate global host state, install privileged dependencies, change shell profiles, or start remote services without explicit operator approval.
- A run can stop, crash, or be killed after modifying files; Fulcrum must preserve logs, inspect worktree state, and avoid claiming no changes occurred.
- A long-running run can lose heartbeat while the process is still alive; Fulcrum must mark stale or needs attention rather than prematurely completing it.
- A task, run, worktree, artifact, memory entry, or external PM item can be deleted or renamed outside Fulcrum; Fulcrum must mark missing, stale, conflict, or needs repair with next action.
- External PM data can be newer than local data while local runs have progressed; Fulcrum must not overwrite local execution history during sync.
- Context budget can exclude relevant evidence; Fulcrum must show omissions and degraded lanes.
- Exact code evidence can conflict with memory or semantic evidence; Fulcrum must distinguish evidence type and freshness so the operator or agent can decide.
- Secret-like values can appear in user files, logs, gate output, prompts, context packs, or artifacts; Fulcrum must respect ignore rules and redact where possible.
- A required quality gate can fail, time out, be skipped, or be unavailable; Fulcrum must preserve the result and block readiness claims until passing evidence is recorded. Operator exceptions remain visible and cannot satisfy full-product release acceptance.
- Worktree cleanup can encounter dirty files, untracked files, unpushed commits, active runs, merge conflicts, or missing artifacts; Fulcrum must block unsafe cleanup.
- Derived indexes, rankings, projections, repo maps, context previews, and cache files can be stale or corrupted; Fulcrum must rebuild them from canonical state or documented sources.
- Two product surfaces can read different snapshots; Fulcrum must either converge them to the same canonical state or mark one surface stale, partial, or degraded.
- An optional adapter can change behavior, version, credentials, or capability support; Fulcrum must reflect health and boundary status before relying on it.
- The operator can request export, reset, uninstall, or backup purge; Fulcrum must preview affected data and require explicit confirmation for destructive steps.
- Machine-readable consumers can request unavailable or denied actions; Fulcrum must return structured actionable errors without leaking secrets.
- Local-only mode can conflict with an operator-requested remote writeback or remote model action; local-only policy must win unless explicitly changed by the operator.
- Cockpit, terminal dashboard/TUI, CLI, MCP, JSON/JSONL, and local health surfaces can expose different command paths for the same action; policy, provenance, and canonical state requirements must remain identical.

## Requirements *(mandatory)*

### Product And Business Requirements

- **BR-001**: Fulcrum MUST deliver a local-first CLI Agent OS for one human operator supervising many repositories, many tasks, and many CLI agents.
- **BR-002**: Fulcrum MUST make the local cockpit a first-class product surface for boards, queues, task detail, run operations, artifacts, health, and review flow.
- **BR-003**: Fulcrum MUST not require a hosted service, remote database, remote model provider, online PM system, cloud telemetry, graph database, vector database, workflow engine, code search service, or always-on language server for core workflows.
- **BR-004**: Fulcrum MUST keep operator-owned local state as the execution truth for projects, tasks, runs, context packs, artifacts, policy decisions, quality gates, backups, and recovery records.
- **BR-005**: Fulcrum MUST treat external systems as optional adapters with explicit health, privacy, ownership, sync, writeback, disablement, and offline behavior.
- **BR-006**: Fulcrum MUST expose the same canonical state through CLI, cockpit, terminal dashboard/TUI, machine-readable JSON/JSONL, MCP tools/resources, and local health reports.
- **BR-007**: Fulcrum MUST optimize for explainable agent work: the operator can see what ran, why it ran, what evidence it received, what it changed, what gates passed or failed, what was posted externally, and what needs review.
- **BR-008**: Fulcrum MUST preserve user work and never silently overwrite, delete, hide, or clean changes.
- **BR-009**: Fulcrum MUST support a complete full-product delivery scope covering local OS base, useful context and memory, adapter certification, safe delivery, recovery/privacy validation, terminal dashboard/TUI, and final release readiness; partial slices may be sequenced internally but do not satisfy this specification.
- **BR-010**: Fulcrum MUST favor mature local tools and replaceable adapters, while owning Fulcrum-specific semantics such as local state, run lifecycle, worktree safety, context assembly, artifact capture, policy gates, and cross-surface consistency.

### Functional Requirements

- **FR-001**: Fulcrum MUST provide setup preview that shows proposed local state locations, configuration changes, required local capabilities, optional capabilities, privacy defaults, and operator approvals before mutation.
- **FR-002**: Fulcrum MUST provide setup apply that initializes approved local state and records setup status without unapproved global host mutations.
- **FR-003**: Fulcrum MUST provide a doctor/readiness authority that classifies each capability as managed, detected, guided, optional, blocked, degraded, disabled, or unknown.
- **FR-004**: Fulcrum MUST include exact next action, blocking status, privacy status, and freshness in doctor output.
- **FR-005**: Fulcrum MUST provide human-readable and machine-readable doctor/status output with equivalent capability states.
- **FR-006**: Fulcrum MUST maintain a local project registry with stable project IDs, project name, repository path, default branch, worktree base/path policy, external PM mapping when configured, memory path, enabled/disabled capabilities, ignored paths, quality gate configuration, privacy mode, and health state.
- **FR-007**: Fulcrum MUST support adding projects from existing local repositories.
- **FR-008**: Fulcrum MUST detect project readiness signals, including Git status, external PM mapping, memory backend and index state, AGENTS.md, CLAUDE.md, agent availability, MCP configuration for agents, quality gate configuration, worktree base readiness, ignore rules, secret redaction configuration, and remote integration status when configured.
- **FR-009**: Fulcrum MUST provide a local cockpit with global and per-project views for tasks, boards, queues, runs, blockers, review queue, merge queue, artifacts, activity, and health.
- **FR-010**: Fulcrum MUST support local-only tasks with title, description, priority, labels, project link, status, assigned agent, current run, blockers, linked files, linked memory, linked artifacts, and linked worktree.
- **FR-011**: Fulcrum MUST support task lifecycle transitions `pending -> ready`, `ready -> running`, `running -> blocked`, `running -> review`, `running -> failed`, `running -> completed`, `blocked -> ready`, `review -> completed`, `review -> blocked`, `review -> running`, `failed -> ready`, and `completed -> archived`; invalid transitions MUST be rejected unless explicit operator-confirmed override is allowed by policy.
- **FR-012**: Fulcrum MUST support importing external PM work items as local task mirrors with separate Fulcrum IDs and external IDs.
- **FR-013**: Fulcrum MUST track external PM sync/writeback state as never synced, synced, local newer, remote newer, conflict, failed, or disabled.
- **FR-014**: Fulcrum MUST keep existing local projects, tasks, runs, artifacts, and context usable when external PM is unavailable.
- **FR-015**: Fulcrum MUST preview and policy-gate externally visible PM comments, status changes, or writebacks.
- **FR-092**: Fulcrum MUST support configurable external PM status mappings into Fulcrum task states and preserve the mapping used for every import, sync, and writeback.
- **FR-093**: Fulcrum MUST support external PM docs/pages as memory sources when configured, with source provenance and local degradation when the external PM is unavailable.
- **FR-016**: Fulcrum MUST create a run record for each supervised agent execution.
- **FR-017**: Each run MUST include stable run ID, task ID, project ID, agent name, command identity, one of the run statuses `created`, `starting`, `running`, `waiting_for_agent`, `waiting_for_operator`, `blocked`, `cancel_requested`, `cancelled`, `failed`, `succeeded`, `review_required`, or `completed`, timestamps, worktree reference, context pack reference, event stream, artifact references, quality gate references, policy decision references, summary, failure reason, and final outcome.
- **FR-018**: Each run MUST reach at most one terminal state; terminal run statuses are `cancelled`, `failed`, and `completed`.
- **FR-019**: Fulcrum MUST record run events in append-only history with timestamp, source, event type, linked run/task, and redacted payload summary.
- **FR-020**: Fulcrum MUST support agent heartbeat/progress events and stale-run detection.
- **FR-021**: Fulcrum MUST support operator cancellation and record cancellation request, stop result, preserved artifacts, and resulting terminal state.
- **FR-022**: Fulcrum MUST preserve logs, transcript references, artifacts, and worktree state when a run fails, crashes, or is cancelled.
- **FR-023**: Fulcrum MUST support registering multiple CLI agents as replaceable workers with roles, enabled/disabled state, capability notes, health status, and per-project availability.
- **FR-024**: Fulcrum MUST not require deep vendor-specific integration for any agent to participate in the core supervised run lifecycle.
- **FR-025**: Fulcrum MUST treat GitHub Copilot CLI as a standalone `copilot` agent command when configured, not as a `gh copilot` subcommand.
- **FR-094**: Fulcrum MUST support agent role preferences for planner, implementer, reviewer, researcher, tester, and documenter roles.
- **FR-095**: Fulcrum MUST pass task/context information to agents through supported combinations of stdin prompt, prompt file, environment variables, command-line arguments, MCP tools, and agent-specific hook/config integration.
- **FR-026**: Fulcrum MUST expose local agent-facing machine interfaces for doctor status, project list, task retrieval, task claim, task status updates, run start, run heartbeat, run event append, run completion, context building, context retrieval, context explanation, memory search, memory add/draft, code search, repo-map retrieval, repo-pack generation, worktree allocation, worktree status, artifact attachment, quality gate execution, and policy checks.
- **FR-027**: Fulcrum machine interfaces MUST default to local stdio or loopback-only access.
- **FR-028**: Fulcrum MUST provide structured, actionable machine-readable errors for machine interfaces.
- **FR-029**: Fulcrum MUST build context packs linked to tasks and runs.
- **FR-030**: Context packs MUST include relevant lanes for task details, external PM context when linked, local memory, exact code, structural code, repo map/pack evidence, recent runs, artifacts, quality gates, policy constraints, operator notes, and graph links when available.
- **FR-031**: Every context item MUST include source reference, evidence type, freshness, inclusion reason, confidence or limitation when relevant, budget estimate, tool/source identity when applicable, and linked task/run/artifact IDs.
- **FR-032**: Context packs MUST show omitted items, degraded lanes, stale evidence, blocked sources, and budget limits.
- **FR-033**: Context builder MUST distinguish exact code evidence, path evidence, structural evidence, repo map evidence, broad package evidence, memory-linked evidence, agent-selected evidence, quality-gate evidence, and optional semantic evidence.
- **FR-034**: Context builder MUST prioritize exact/path/structural evidence over weak semantic evidence unless the operator explicitly asks for semantic exploration.
- **FR-035**: Context packs MUST be exportable as human-readable markdown, machine-readable JSON, agent prompt file, and local machine resource.
- **FR-036**: Fulcrum MUST provide local code search for exact identifiers, exact strings, paths, filenames, errors, and source-line references when available.
- **FR-037**: Fulcrum MUST provide structural code search when the relevant local capability is available and mark the lane degraded when unavailable.
- **FR-038**: Fulcrum MUST support optional semantic code search without making it required for core workflows.
- **FR-039**: Code search results MUST include query, evidence type, source reference, result count, ignored paths or exclusions, freshness, duration or recency signal, and ranking reason when available.
- **FR-040**: Fulcrum MUST clean up or mark stale code evidence after delete, rename, repository changes, ignored-path changes, or rebuild.
- **FR-096**: Fulcrum MUST support local file discovery, structural search, repo-map generation, and repo-pack generation through replaceable local tools, including cache metadata for tool version, repository commit, config hash, generated time, path, size, and included file count.
- **FR-097**: Fulcrum MUST invalidate repo maps, repo packs, and code-context caches when repository HEAD changes, included working-tree content changes, ignore rules change, or code-context configuration changes.
- **FR-041**: Fulcrum MUST support local markdown memory as preferred canonical memory format.
- **FR-042**: Memory entries MUST support durable IDs, title, body or excerpt, status, freshness, source references, linked tasks, linked runs, linked files/symbols, linked artifacts, and update timestamps.
- **FR-043**: Memory search results MUST include memory ID, title, excerpt, source file, linked refs, freshness, status, backend/source, rank, and reason or limitation when available.
- **FR-044**: Fulcrum MUST support memory statuses including active, draft, superseded, stale, archived, and deleted.
- **FR-045**: Permanent memory writes MUST be policy-gated and require operator approval unless a scoped policy explicitly allows them.
- **FR-046**: Memory updates MUST cite raw sources or explicitly declare when a source is unavailable.
- **FR-047**: Fulcrum MUST mark linked memory stale or needs review when linked files, tasks, runs, or source documents are missing, deleted, renamed, or superseded.
- **FR-048**: Fulcrum MUST support local memory export with provenance.
- **FR-049**: Fulcrum MUST maintain links among tasks, plans, memory, code files/symbols, runs, context packs, artifacts, quality gates, policy decisions, writebacks, and backups.
- **FR-050**: Graph-like answers MUST show evidence, freshness, and limitations and must be rebuildable from canonical state and documented external sources.
- **FR-051**: Fulcrum MUST allocate isolated work areas for agent runs or record a policy-compliant reason for using an existing branch/worktree.
- **FR-052**: Worktree records MUST include project, task, run, path, branch, base branch, base commit, status, dirty state, untracked count, conflict state, cleanup eligibility, block reason, and last check time.
- **FR-053**: Fulcrum MUST show diff summary, file-change summary, linked artifacts, quality gate state, review findings, merge readiness, and cleanup state for worktree delivery.
- **FR-054**: Fulcrum MUST block cleanup when a worktree has dirty files, untracked files, uncommitted changes, unpushed commits, unresolved conflicts, active runs, missing required artifacts, or missing operator approval.
- **FR-055**: Fulcrum MUST require policy approval for destructive actions, including worktree deletion, branch reset, cleaning untracked files, memory removal, backup purge, branch merge, arbitrary shell execution from agent-facing interfaces, external writeback, remote provider calls blocked by privacy mode, and sensitive export.
- **FR-056**: Policy decisions MUST record action, subject, requester, run/task link when applicable, allowed/denied state, reason, approval requirement, approver, approval time, and scope.
- **FR-057**: Fulcrum MUST provide preview for destructive, externally visible, or large-scope actions.
- **FR-058**: Fulcrum MUST provide local-only mode that blocks remote PM, remote model, telemetry, remote observability, and other network-dependent actions unless the operator changes policy.
- **FR-059**: Fulcrum MUST default to no remote telemetry, no remote model calls by Fulcrum core, no online PM sync, and no hidden network access in core workflows.
- **FR-060**: Fulcrum MUST make remote endpoint, provider, telemetry, external PM, and privacy status visible in cockpit, CLI, doctor, and machine-readable output.
- **FR-061**: Fulcrum MUST respect ignore rules and exclude ignored or sensitive paths from indexing, context packs, logs, traces, artifacts, and reports where possible.
- **FR-062**: Fulcrum MUST redact known secret patterns from logs, events, artifacts, context packs, reports, and writebacks where possible and record redaction status.
- **FR-063**: Fulcrum MUST support project-defined quality gates with statuses not run, running, passed, failed, skipped, timeout, cancelled, and degraded.
- **FR-064**: Quality gate results MUST include gate identity, working context, start/end time, duration, status, exit or failure summary when applicable, output references, parsed summary when available, and linked task/run/artifact IDs.
- **FR-065**: Fulcrum MUST allow operators to require quality gates before writeback, review completion, merge readiness, or run completion claims.
- **FR-098**: Fulcrum MUST support language-aware quality gate presets, including Rust-oriented gates that prefer cargo check, targeted cargo test, cargo clippy, and cargo fmt --check over always-on LSP validation.
- **FR-066**: Fulcrum MUST store artifacts locally with stable ID, type, path or local reference, content hash when available, size, created time, redaction status, summary, linked refs, and retention/export status.
- **FR-099**: Fulcrum MUST support artifact types for transcript, stdout, stderr, diff, patch, test log, quality gate report, context pack, repo map, repo pack, memory note, external PM writeback, review report, optional screenshot, and other local evidence.
- **FR-100**: Fulcrum MUST support attaching artifacts to configured external PM writebacks while keeping raw logs separate from summarized external content.
- **FR-067**: Fulcrum MUST keep raw logs separate from summarized external writebacks.
- **FR-068**: Fulcrum MUST support backup of canonical state, configuration, artifacts, logs, managed memory, and requested generated context packs.
- **FR-069**: Fulcrum MUST support restore that validates task/run/artifact/policy/context references.
- **FR-070**: Fulcrum MUST support export to local machine-readable records with provenance and redaction status.
- **FR-071**: Fulcrum MUST support rebuild of derived data, including indexes, projections, repo maps, broad repo packs, memory indexes, graph-like links, rankings, and context previews.
- **FR-072**: Fulcrum MUST support reset and uninstall previews that list data to remove, preserve, or purge.
- **FR-073**: Backup purge, destructive reset, and destructive uninstall choices MUST require explicit confirmation.
- **FR-074**: Cross-surface disagreement among cockpit, terminal dashboard/TUI, CLI, MCP, JSON/JSONL, and local health reports MUST be treated as a defect unless a surface explicitly marks data stale, partial, or degraded.
- **FR-075**: Fulcrum MUST expose stable IDs for first-class records so operators, agents, exports, artifacts, policy decisions, and provenance links can reference the same objects.
- **FR-076**: Fulcrum MUST provide live activity streams for runs, policy decisions, quality gates, sync/writeback attempts, context builds, artifact attachments, backup/restore, and capability changes.
- **FR-077**: Fulcrum MUST provide review queues for completed or blocked agent work, quality-gate failures, memory drafts, external writebacks, merge readiness, cleanup requests, and policy approvals.
- **FR-078**: Fulcrum MUST present degraded states as explicit product states with cause, impact, affected workflows, and next action.
- **FR-079**: Fulcrum MUST not claim readiness or completion for a feature, run, delivery, or release band unless required evidence exists. Operator exceptions MUST remain visible as exceptions and MUST NOT satisfy completion claims.
- **FR-080**: Fulcrum MUST document adapter ownership boundaries, health checks, offline behavior, disablement behavior, and import/export or rebuild strategy for every optional adapter.
- **FR-081**: Cockpit information architecture MUST include a global overview, per-project board, task detail, run detail, worktree delivery state, context/evidence view, artifacts, quality gates, doctor/health, review queues, policy approvals, adapter settings, and privacy status.
- **FR-082**: Cockpit and machine-readable surfaces MUST represent loading, empty, success, partial, degraded, denied, approval-required, conflict, error, and stale states for applicable workflows.
- **FR-083**: Cockpit interactions MUST support keyboard navigation, readable labels, non-color-only status communication, accessible status updates, and usable focus order for primary task/run/review workflows.
- **FR-084**: State-changing actions in cockpit, CLI, and machine interfaces MUST provide previews or summaries of expected effects, affected records, policy requirements, and external visibility before execution when the action is destructive, remote, permanent, or broad-scope.
- **FR-085**: Adapter credentials and secrets MUST be stored or referenced through operator-approved local mechanisms, excluded from plaintext exports/logs/context/artifacts where possible, and shown through health/privacy status without revealing secret values.
- **FR-086**: Any non-loopback service bind, public exposure, or remote endpoint enablement MUST require explicit operator approval, be visible in doctor and privacy status, and be reversible.
- **FR-087**: Fulcrum MUST support credential rotation, revocation, or replacement workflows for configured external adapters without deleting Fulcrum-owned local task, run, artifact, or provenance history.
- **FR-088**: Fulcrum MUST define retention, export, reset, and purge behavior for logs, transcripts, artifacts, memory, backups, and generated context packs in operator-visible terms.
- **FR-089**: Fulcrum MUST provide a terminal dashboard/TUI with dashboard, projects, tasks, runs, worktrees, artifacts, context packs, quality gates, doctor, and event stream views over the same core services as CLI, cockpit, MCP, and JSON.
- **FR-090**: Fulcrum MUST write local logs and event mirrors to operator-visible local paths and link run traces to run ID, task ID, agent, command, context pack, worktree, event timeline, quality gates, artifacts, and writeback status.
- **FR-091**: Fulcrum MUST support optional OpenTelemetry, Langfuse, and Helicone-style observability integrations as disabled-by-default adapters with explicit operator opt-in, privacy status, redaction, and local-only blocking.

### Key Entities *(include if feature involves data)*

- **Project**: A local registered software workspace. Key attributes include Fulcrum project ID, name, root path, default branch, worktree base path, external PM workspace/project mapping, memory path, quality gates, enabled/disabled capabilities, ignored paths, privacy mode, health state, and optional external mappings.
- **Task**: A unit of work owned or mirrored locally by Fulcrum. Key attributes include task ID, project ID, title, description snapshot, status, priority, labels, blocker state, assigned agent, current run, linked files, linked memory, linked artifacts, linked worktree, external source, and external ID.
- **External Work Item Mirror**: A local representation of an optional external PM item. Key attributes include external system, external ID, source timestamps, sync status, conflict status, last import/export/writeback state, and mapping to a local task.
- **Run**: A supervised agent execution linked to a task and project. Key attributes include run ID, agent identity, lifecycle status, timestamps, heartbeat state, worktree reference, context pack reference, events, logs, artifacts, quality gates, policy decisions, summary, and terminal outcome.
- **Run Event**: A timestamped append-only fact about a run or operation. Key attributes include event ID, run/task/project refs, source, event type, redacted payload summary, timestamp, and artifact or policy links when relevant.
- **Agent**: A configured CLI worker or role-capable tool. Key attributes include name, command identity, roles, capability notes, health status, enabled/disabled state, project availability, privacy notes, and adapter boundary.
- **Context Pack**: A curated evidence bundle for a task or run. Key attributes include context pack ID, linked task/run, included lanes, item references, budget, omissions, degraded lanes, freshness, generated time, and export formats.
- **Context Item**: A single piece of evidence in a context pack. Key attributes include item ID, type, source, reference, title, excerpt, inclusion reason, freshness, confidence or limitation, evidence type, tool/source identity, and budget estimate.
- **Memory Entry**: A durable or draft local knowledge record. Key attributes include memory ID, status, title, body/excerpt, source refs, linked tasks/runs/files/symbols/artifacts, freshness, created/updated times, and export status.
- **Code Evidence**: A code-related finding or reference. Key attributes include evidence ID, project ID, file path, line reference when available, symbol/path/query, evidence type, freshness, source tool, ignored-path status, rank/reason, and linked context/task/run.
- **Graph Link**: A rebuildable relationship among entities. Key attributes include source entity, target entity, relationship type, evidence, freshness, provenance, confidence/limitation, and rebuild source.
- **Worktree Allocation**: An isolated or approved work area for agent work. Key attributes include worktree ID, project/task/run refs, path, branch, base branch, base commit, dirty state, untracked count, conflict state, cleanup eligibility, block reason, and timestamps.
- **Artifact**: A local output or evidence file associated with work. Key attributes include artifact ID, type, local reference, linked project/task/run, content hash, size, redaction status, summary, linked refs, retention/export status, and created time.
- **Quality Gate**: A project-defined validation check. Key attributes include gate ID, name, description, required/optional state, status, working context, timing, result summary, output artifacts, linked task/run, and release-exception status.
- **Policy Decision**: A recorded allow/deny/approval-required result for a sensitive action. Key attributes include decision ID, action, subject, requester, linked run/task, allowed state, reason, approval requirement, approver, approval time, bypass scope, and timestamp.
- **Capability Health Record**: A current or historical status for a local or optional capability. Key attributes include capability ID, state, blocking status, cause, next action, privacy status, last check time, affected workflows, and degraded behavior.
- **Adapter Configuration**: A replaceable boundary to an external tool, service, agent, backend, or provider. Key attributes include adapter ID, category, enabled state, ownership boundary, health check, offline behavior, disablement behavior, import/export or rebuild strategy, credential status, and privacy notes.
- **Backup Manifest**: A record of captured state for recovery. Key attributes include backup ID, created time, included records, artifact/log/memory coverage, redaction status, integrity status, restore target, and purge approval state.
- **Export Record**: A machine-readable local export of Fulcrum records. Key attributes include export ID, format, included entity classes, redaction status, provenance coverage, created time, and local path/reference.
- **Terminal Dashboard View**: A terminal-native surface over canonical state. Key attributes include view ID, view type, active project/task/run filters, selected record ID, stale/partial/degraded state, keyboard action map, privacy status, and last refresh time.

## Fulcrum Constitution Alignment *(mandatory)*

### Local-First And Degraded Behavior

- Core workflow without network access: Setup preview/apply, doctor for local capabilities, project registry, local cockpit, local tasks, run visibility, context from local memory/code, supervised local agent runs, worktree delivery, artifact capture, quality gates, backup, restore, export, reset, rebuild, and uninstall must work without network access.
- Optional remote services or integrations: External PM systems, remote model providers used by configured agents, remote telemetry/observability, optional semantic backends, optional memory/code/search engines, and hosted provider integrations are opt-in. Missing or unhealthy integrations degrade to explicit local states with affected workflows and next actions.
- Hidden network prevention: Core workflows default to no hidden network calls. Any network-dependent action must show provider, purpose, data shared, privacy state, and approval or opt-in requirement before use. Local-only mode blocks remote actions.

### Operator Control And Policy

- Human approval required for: Worktree deletion, branch reset, cleaning untracked files, merge, external PM writeback, permanent memory write, memory deletion, arbitrary shell execution from agent-facing interfaces, remote provider call blocked by privacy mode, sensitive export, backup purge, destructive reset, destructive uninstall, and any configured high-risk adapter action.
- Run/task visibility: Every run is task-linked and visible with lifecycle status, heartbeat/stale state, event history, context pack reference, worktree reference, logs, artifacts, quality gate results, policy decisions, review state, and final outcome. Tasks and queues expose blockers, assigned agents, active runs, review needs, merge readiness, and degraded capability impact.
- User work preservation: Fulcrum must block unsafe cleanup, never silently delete or overwrite user changes, preserve artifacts and logs after failure/cancellation, preview destructive changes, show dirty/untracked/conflicted/unpushed state, and record approvals for destructive actions.

### Canonical State And Provenance

- Canonical local records: Projects, local tasks, external task mirrors, runs, run events, worktree allocations, context packs, artifacts, quality gate results, policy decisions, setup state, health/capability records, adapter configuration, sync/writeback records, memory drafts/metadata, backups, exports, reset/uninstall records, and graph links.
- External source-of-truth boundaries: Git remains authoritative for repository content and commit history. External PM systems remain authoritative for their remote work-item text/status only when configured, while Fulcrum remains authoritative for local execution, runs, policies, artifacts, context, worktrees, and review state. Agent providers remain authoritative for their own internal model behavior, while Fulcrum records prompts, context, visible events, artifacts, and policy decisions.
- Rebuildable derived data: Search indexes, semantic indexes, graph projections, rankings, repo maps, broad repo packs, context previews, cache files, stale-link reports, and health summaries must be rebuildable from canonical records or documented source systems.
- Evidence shown to operator/agent: Important outputs include source refs, timestamps or freshness, inclusion reason, evidence type, confidence or limitation when relevant, budget/omission notes, degraded-state reasons, redaction status, and linked task/run/artifact/policy IDs.

### Security And Privacy

- Sensitive data handled: Repository paths, private source files, ignored files, secrets, credentials, tokens, private keys, environment variables, logs, transcripts, prompts, context packs, artifacts, quality gate output, external PM credentials, remote provider configuration, and exports.
- Redaction and ignore behavior: Fulcrum respects `.gitignore`, `.ignore`, `.fulcrumignore`, `.repomixignore`, backend-specific ignore files, and configured redaction patterns. Sensitive values are excluded from indexing/context/logs/artifacts/reports where possible and redacted when captured.
- Trust boundaries: Local loopback and stdio machine interfaces, external PM APIs, remote model providers used by configured agents, optional telemetry/exporters, local filesystem, Git repositories, subprocess agents, and adapter credentials. Loopback/stdio are defaults for local service exposure.
- Policy-gate tests required: Deny or approval-required cases for worktree deletion, untracked cleanup, branch reset, merge, arbitrary shell execution, permanent memory write, memory deletion, external writeback, backup purge, sensitive export, remote provider call in local-only mode, public service bind, and disabled adapter access.

### TypeScript Boundary Discipline

- Packages touched: Product delivery is expected to cover the cockpit, CLI, local server/MCP surface, core domain services, local state layer, adapter wrappers, context builder, doctor, and shared schemas/contracts. These map to the constitution's TypeScript-first monorepo boundary expectations for `apps/*` and `packages/*`.
- Shared schemas/contracts: Project, task, external mirror, run, run event, agent, context pack, context item, memory entry, code evidence, graph link, worktree allocation, artifact, quality gate, policy decision, capability health, adapter configuration, backup manifest, export record, doctor output, machine-interface errors, and cross-surface event contracts.
- Adapter boundaries: External PM, memory backends, code tools, semantic backends, repo map/pack providers, CLI agents, quality gate runners, telemetry/exporters, remote model/provider status, and packaging/runtime surfaces must be replaceable with declared ownership, health, offline, disablement, and rebuild/export behavior.
- Non-TypeScript or Bun-only exceptions: No exception is assumed for  Go or other languages may be introduced only if implementation evidence shows TypeScript fails on reliable process supervision, packaging, memory use, filesystem safety, long-running daemon reliability, or single-binary distribution. Bun-only behavior must not become a product requirement until packaging and subprocess reliability are proven.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new operator can complete setup preview, approved setup, project registration, and local doctor review in under 15 minutes on a clean supported developer machine without creating any cloud account.
- **SC-002**: In local-only mode with network unavailable, an operator can create a local task, build a context pack from local sources, start a deterministic local validation agent run, capture artifacts, run a quality gate, and view the completed run from cockpit, terminal dashboard, and CLI.
- **SC-003**: 100% of destructive, externally visible, permanent-memory, remote-provider, sensitive-export, and backup-purge actions are either denied or require recorded approval by default.
- **SC-004**: 100% of runs have at most one terminal state and preserve an auditable event history after normal completion, failure, cancellation, and process crash simulation.
- **SC-005**: 95% of common local status operations, including project list, task list, run status, and local health summary, return user-visible results within 1 second on a typical registered project cache.
- **SC-006**: Doctor quick checks complete within 3 seconds excluding explicit deep checks and report exact next actions for all blocked or guided required capabilities.
- **SC-007**: Context packs include provenance for 100% of included items and show degraded lanes, omissions, freshness, and evidence type whenever applicable.
- **SC-008**: Exact code search results include source reference, evidence type, ignored-path behavior, and freshness metadata for 100% of returned results where the underlying local source provides that information.
- **SC-009**: Memory entries created through approved writeback cite at least one raw source reference or explicitly declare missing source provenance in 100% of cases.
- **SC-010**: Unsafe worktree cleanup attempts with dirty files, untracked files, unpushed commits, conflicts, active runs, or missing approval are blocked in 100% of validation cases.
- **SC-011**: Required quality gates block readiness, external writeback, merge readiness, or completion claims in 100% of failing, timed-out, cancelled, or missing required-gate cases until passing evidence is recorded. Operator exceptions are audited separately and do not count as passing readiness.
- **SC-012**: Cockpit, CLI, JSON/JSONL, MCP, and local health surfaces show matching IDs, statuses, and degraded states for project, task, run, artifact, quality gate, and policy records in cross-surface parity tests.
- **SC-013**: Backup and restore validation recovers canonical projects, tasks, runs, events, artifacts, policies, context references, memory metadata, and health records with no broken required references in the test fixture.
- **SC-014**: Rebuild validation regenerates derived indexes, projections, context previews, and graph-like links from canonical state or marks unavailable source systems with actionable degraded status.
- **SC-015**: Secret-redaction validation removes or masks configured sensitive values from logs, artifacts, context packs, reports, and writebacks in 100% of known-pattern test cases.
- **SC-016**: At least two different configured real CLI agents and the deterministic SRS validation agent can complete the supervised run lifecycle through the same task/run/context/artifact/quality/policy model.
- **SC-017**: Optional integration outage validation shows explicit degraded or disabled state and preserves local workflows for external PM, semantic search, memory backend, telemetry, and agent-provider categories.
- **SC-018**: At least 90% of release acceptance review scenarios allow operators to identify from Fulcrum surfaces what task an agent worked on, what context it received, what files or artifacts it produced, what gates ran, what policy decisions occurred, and what next action is required without reading raw logs first.
- **SC-019**: Cross-surface validation remains usable and internally consistent with at least 25 registered projects, 1,000 local or mirrored tasks, 10,000 run events, 500 artifacts, and 100 memory entries in the local fixture.
- **SC-020**: Primary cockpit workflows for setup, project registration, task review, run supervision, policy approval, quality gate review, and worktree cleanup are completable by keyboard and expose non-color-only status indicators in accessibility checks.
- **SC-021**: Terminal dashboard/TUI workflows expose dashboard, projects, tasks, runs, worktrees, artifacts, context packs, quality gates, doctor, and event stream views with IDs/statuses matching CLI, cockpit, MCP, JSON/JSONL, and local health reports.
- **SC-022**: CLI and MCP coverage tests verify every SRS command group and every SRS MCP tool has a documented contract, shared schema, core-service implementation path, policy behavior, structured error, and release evidence.

## Assumptions

- Fulcrum targets one local human operator, not multi-user team administration or hosted SaaS workflows.
- Cockpit-first is the final product direction. External PM systems are optional integrations, not the primary cockpit or hidden product center.
- SRS-ammend-02 supersedes SRS-ammend-01 on implementation-language direction: the product is TypeScript-first with Go retained only as a later escape hatch if justified by evidence.
- Core workflow support includes CLI, cockpit, terminal dashboard/TUI, machine-readable JSON/JSONL, and MCP/local machine interfaces.
- Local machine interfaces default to stdio or loopback-only access.
- Markdown and local text are sufficient early memory sources. PDF and Office parsing are out of scope for early delivery.
- Custom graph database, custom vector database, hosted workflow engine, plugin marketplace, enterprise PM administration, and cloud-only orchestration are out of scope for this product delivery unless separately specified by a future constitution amendment.
- Semantic code or memory retrieval may improve the product but is optional; exact, path, structural, markdown, and local evidence must keep core workflows useful.
- Optional adapters may include external PM systems, code tools, memory backends, semantic backends, CLI agents, telemetry/exporters, and remote providers, but each must be replaceable and bounded.
- Product readiness is validated through observable local workflows, cross-surface parity, policy-gate behavior, evidence/provenance, degraded-state handling, backup/restore, rebuild, and worktree safety.
- The operator is expected to have local repositories and at least two configured real CLI agents for full acceptance validation; the deterministic SRS validation agent exists only to make failure, heartbeat, and recovery tests repeatable.
- Fulcrum should guide installation of large, privileged, preference-heavy, or external dependencies rather than silently installing them.

## Full Product Completion Contract

This specification is complete only when Fulcrum implements the full product
surface described by `FULCRUM_PRODUCT.md`, `SRS.md`, `SRS-ammend-01.md`, and
`SRS-ammend-02.md`. The final deliverable is not a pilot, prototype, preview-only workflow, mock-only workflow, partial adapter shell, or narrow slice. Internal previews remain product safety features, but preview mode
does not count as implementation of the corresponding real action.

Full completion requires all of the following:

- CLI, cockpit, terminal dashboard/TUI, MCP, JSON/JSONL, local health reports,
  and exports expose the same canonical IDs, statuses, policy decisions,
  degraded states, artifacts, quality gates, and provenance.
- Every SRS CLI command group is implemented: setup, doctor, repair, uninstall,
  project, external PM/Plane, task, context, code, memory, run, worktree,
  quality gate, artifact, backup, restore, export, and rebuild.
- Every SRS MCP tool is implemented or has an equivalent documented alias:
  `fulcrum_doctor_status`, `fulcrum_project_list`, `fulcrum_task_get`,
  `fulcrum_task_claim`, `fulcrum_task_update_status`, `fulcrum_run_start`,
  `fulcrum_run_heartbeat`, `fulcrum_run_event`, `fulcrum_run_complete`,
  `fulcrum_context_build`, `fulcrum_context_get`,
  `fulcrum_context_explain`, `fulcrum_memory_search`, `fulcrum_memory_add`,
  `fulcrum_code_search`, `fulcrum_repo_map_get`, `fulcrum_repomix_pack`,
  `fulcrum_worktree_allocate`, `fulcrum_worktree_status`,
  `fulcrum_artifact_attach`, `fulcrum_quality_gate_run`, and
  `fulcrum_policy_check`.
- Project registry, external PM/Plane sync/writeback, local-only tasks, run
  lifecycle, agent adapters, MCP logging, memory OS, code context, context
  builder, worktree delivery, quality gates, artifacts, policy/privacy,
  doctor/setup, backup/restore/export/rebuild/reset/uninstall, observability,
  and release validation are all implemented with operator-visible evidence.
- External PM/Plane, memsearch, Engram, code tools, semantic retrieval,
  telemetry, remote providers, and CLI agents are bounded, health-checked
  adapters. Optional means replaceable or disableable, not missing from the
  product.
- Real configured CLI agents complete acceptance scenarios through the same
  run/context/artifact/quality/policy model. The deterministic SRS validation
  agent is only a test harness and cannot substitute for real-agent acceptance.
- No success criterion may be satisfied by a stub, placeholder, generated
  sample, documentation-only claim, preview-only behavior, or unexecuted
  validation. Completion requires passing evidence linked from release records.

## Recommended Skill Calls

Use [skill-calls.md](skill-calls.md) as the full catalog. For this requirements
spec, prioritize [$speckit-specify](/home/mkh/.agents/skills/speckit-specify/SKILL.md),
[$speckit-clarify](/home/mkh/.agents/skills/speckit-clarify/SKILL.md),
[$spec-flow-analyzer](/home/mkh/.raise/profiles/vanilla/codex/skills/spec-flow-analyzer/SKILL.md),
[$document-review](/home/mkh/.raise/profiles/vanilla/codex/skills/document-review/SKILL.md),
[$product-lens-reviewer](/home/mkh/.raise/profiles/vanilla/codex/skills/product-lens-reviewer/SKILL.md),
[$scope-guardian-reviewer](/home/mkh/.raise/profiles/vanilla/codex/skills/scope-guardian-reviewer/SKILL.md),
[$security-lens-reviewer](/home/mkh/.raise/profiles/vanilla/codex/skills/security-lens-reviewer/SKILL.md),
and [$adversarial-document-reviewer](/home/mkh/.raise/profiles/vanilla/codex/skills/adversarial-document-reviewer/SKILL.md).
