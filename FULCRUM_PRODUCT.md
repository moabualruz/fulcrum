# Fulcrum CLI Agent OS Product Vision

Date: 2026-04-24
Status: clean-slate product definition

## Premise

Fulcrum is a local-first CLI agent operating system for one human operator working across many software projects with many CLI agents.

It is not only a RAG app. It is not only a task tracker. It is not a wrapper around Jira, Linear, GitHub Projects, Plane, or any other online PM system. It should own the local operating layer for human-directed and agent-executed software work.

Fulcrum should feel like:

```text
local agent OS
  + personal project/task cockpit
  + live agent operations center
  + memory/code intelligence graph
  + worktree delivery system
```

The product goal is to let an operator see work, assign work, supervise agents, inspect context, review results, manage queues, and understand why the system made decisions.

## Values

### Local First

Fulcrum should run on a normal developer machine without requiring cloud services, team servers, remote databases, or online PM tools.

Local-first means:

- the operator owns the data
- the system works without network access for core workflows
- remote services are opt-in, visible, and replaceable
- local state can be inspected, backed up, restored, exported, and purged
- missing optional integrations degrade clearly instead of breaking the product

### Operator Control

Fulcrum should be designed for one human who wants leverage over many agents and projects. The operator stays in control of what runs, what changes, what gets merged, and what gets remembered.

The system should make agent work visible instead of hiding it behind logs or opaque automation.

### Durable State

Fulcrum should own canonical local state for workspaces, projects, tasks, runs, events, policies, artifacts, memory sources, graph refs, setup state, and delivery queues.

Derived data such as search indexes, vectors, graph projections, rankings, and context packs can be rebuilt. Canonical state must survive crashes, restarts, backup, restore, and uninstall flows.

### Explainability

Every important answer, context pack, task decision, search result, graph edge, and agent action should be explainable.

Fulcrum should show:

- what evidence was used
- where it came from
- why it was ranked or included
- what is stale, missing, blocked, or degraded
- what action the operator or agent can take next

### Minimum Reinvention

Fulcrum should not rebuild mature product areas unless owning the layer is essential to product identity.

The product should use replaceable engines and integrations where they help, but Fulcrum must keep ownership of local state, workflow semantics, safety, visibility, and operator experience.

No external product should become the hidden source of truth.

## Target User

Primary user:

- one developer/operator
- works across many repositories and projects
- uses CLI agents for coding, review, research, planning, and automation
- wants a local control plane for tasks, context, memory, code search, and delivery
- prefers inspectable local state over SaaS-first workflows

Not the initial target:

- large teams
- hosted multi-tenant service
- enterprise PM replacement
- cloud-only agent orchestration
- plugin marketplace
- CLI-agent-specific integration catalog

## Product Surfaces

Fulcrum should expose the same underlying state through multiple surfaces:

- CLI for fast commands and agent automation
- TUI or terminal dashboard for local supervision
- cockpit UI for rich boards, queues, details, and live activity
- machine-readable JSON/JSONL for agents
- local health and status reports for setup and operations

All surfaces should agree because they read from the same canonical state.

## Core Product Modules

### 1. Core OS Kernel

The kernel owns canonical local state and lifecycle rules.

Capabilities:

- workspace and project registry
- stable IDs for first-class objects
- task lifecycle
- agent run lifecycle
- local event stream
- policy decisions
- artifacts
- setup state
- health status
- backup, restore, export, import, reset, rebuild, and uninstall records

Required behavior:

- state persists across restart
- every long-running operation has status
- every run reaches at most one terminal state
- invalid state transitions are rejected
- status and health are truthful, not optimistic
- recovery paths are explicit

### 2. Owned PM Cockpit

Fulcrum should provide its own local project/task cockpit. It may import/export/sync with online tools later, but the local cockpit is the product center.

Core views:

- global board across all projects
- per-project board
- epics, issues, tasks, and plans
- blockers and dependencies
- task queues
- assigned agents
- running, blocked, failed, cancelled, and completed runs
- review queues
- merge queues
- artifacts and handoffs
- live activity stream
- health and degraded capability status

The cockpit should look and function like an owned local work management system, not like a passive dashboard over another product.

### 3. Agent Orchestration

Fulcrum coordinates CLI agents as workers in the local OS.

Capabilities:

- create work for agents
- start supervised runs
- track heartbeat and progress
- stream live events
- block, fail, cancel, or complete runs
- attach artifacts
- record decisions and handoffs
- enforce policy before dangerous actions
- show current and historical agent activity

Agent orchestration should make it obvious:

- what the agent is doing
- why it is doing it
- what task it belongs to
- what context it received
- what files or artifacts it touched
- what it produced
- whether it needs human review

### 4. Memory OS

Fulcrum should preserve useful project knowledge and make it retrievable with provenance.

Memory should support:

- raw source capture
- curated durable notes
- project decisions
- lessons learned
- task outcomes
- errors and fixes
- procedures
- architecture facts
- imported markdown documentation
- session or agent handoff knowledge

Memory requirements:

- raw sources remain traceable
- curated memory cites sources
- memory updates incrementally
- normal edits do not require full rebuild
- stale or superseded memory is visible
- retrieval explains source, confidence, freshness, and limitations

Early scope should focus on markdown and local text knowledge. PDF and Office document parsing are not required for the early product.

### 5. Code Intelligence

Fulcrum should make code searchable as code, not just text.

Required capabilities:

- exact identifier search
- path and filename search
- string and error search
- symbol extraction
- imports, exports, and dependency awareness
- code chunking
- semantic code retrieval
- hybrid ranking
- source line references
- stale index cleanup after delete or rename
- explanation of why each result was returned

The product should distinguish exact/code-structured evidence from semantic evidence. Exact symbol and file matches should not be buried under weak semantic results.

### 6. Memory-Code-Work Graph

Fulcrum should connect memory, code, tasks, plans, runs, artifacts, and decisions into one local graph.

Useful questions the graph should answer:

- Which code implements this remembered decision?
- Which task introduced this file or symbol?
- Which files are affected by this plan?
- Which memories explain this architecture?
- Which agent changed this behavior?
- Which artifacts came from this run?
- Which failures relate to this subsystem?

Graph links should include:

- memory to raw source
- memory to entity
- memory to task, issue, or plan
- task or plan to file, symbol, or chunk
- file to symbol
- file to dependency
- run to task
- run to artifact
- artifact to file or review
- policy decision to action or run
- context pack to evidence

Graph correctness must update on change. Full rebuild is a repair path, not the normal correctness mechanism.

### 7. Context Builder

Fulcrum should build explainable context packs for agents and operators.

Context packs should combine:

- task details
- recent run state
- relevant memory
- relevant code
- graph evidence
- plans and decisions
- artifacts
- policy constraints

Context packs should show:

- included evidence
- source refs
- ranking reasons
- freshness
- omissions or degraded lanes
- budget limits

The system should avoid letting one source dominate the context unless the query explicitly targets that source.

### 8. Worktree Delivery System

Fulcrum should help move work from task to safe local delivery.

Delivery loop:

```text
task
  -> worktree or branch allocation
  -> supervised agent run
  -> artifacts and changes
  -> review queue
  -> merge queue
  -> merged, blocked, or conflict artifact
```

Capabilities:

- allocate isolated work areas
- track dirty, untracked, conflicted, and unmerged state
- attach run artifacts
- attach review findings
- manage merge queue
- block unsafe merges
- block unsafe cleanup
- preserve user work

The system should never silently delete or overwrite user changes.

### 9. Setup, Doctor, And Recovery

Fulcrum should be easy to set up and easy to diagnose.

Setup should support:

- preview plan
- install selected local assets
- doctor/health check
- repair
- logs
- uninstall
- backup preservation
- JSON output for agents

Doctor should be the readiness authority.

Doctor should classify capabilities as:

- managed
- detected
- guided
- optional
- blocked

Doctor output should explain:

- what is working
- what is missing
- what is optional
- what is blocking
- exact next action
- privacy and remote-use status

Setup must not mutate global host state by surprise. Large, privileged, or preference-heavy dependencies should be guided rather than forced.

### 10. Validation And Release Gates

Fulcrum should not claim readiness without proof.

Validation should cover:

- clean install
- first run
- daemon restart
- task/run lifecycle
- event replay
- cockpit parity
- code index
- memory import
- context pack
- graph update
- worktree delivery
- backup
- restore
- uninstall
- no hidden network access
- secret redaction
- ignore rules
- optional capability degradation

Release bands should be value based:

- Local Alpha: local OS base with live task/run visibility
- Useful Alpha: code context, markdown memory, worktree delivery, setup proof
- Adapter Beta: optional integrations certified or explicitly deferred
- Release Candidate: packaging, privacy, graph correctness, RAG quality, recovery, docs

## Privacy And Safety

Default behavior:

- no remote model by default
- no remote telemetry by default
- no online PM sync by default
- no hidden network calls in core workflows
- local loopback binding for local services
- explicit opt-in for remote endpoints
- visible privacy status for providers and integrations

Safety requirements:

- secrets excluded from indexing and retrieval where possible
- traces, logs, artifacts, and reports redact sensitive values
- ignore rules are respected
- destructive commands require preview and confirmation
- backup purge is explicit
- user work is preserved

## Optional Integrations

Fulcrum can integrate with external products, engines, or services where they add value. These integrations must be optional, replaceable, and bounded.

Integration rules:

- Fulcrum keeps canonical state.
- External systems receive mappings, not ownership.
- Missing integrations degrade clearly.
- Every integration has health checks.
- Every integration has import/export or rebuild story.
- Every integration documents offline behavior.
- Every integration can be disabled without losing Fulcrum identity.

Examples of optional integration categories:

- project management import/export
- action/workflow runners
- code search engines
- vector or semantic stores
- graph retrieval engines
- local or remote model providers
- telemetry exporters

No specific dependency is mandatory in this clean-slate product definition.

## Out Of Scope For Now

- CLI-agent-specific integration catalog
- plugin marketplace
- hosted multi-user service
- enterprise team administration
- cloud-only orchestration
- PDF and Office parsing as early requirement
- hard dependency on any single PM tool, model provider, vector database, graph database, workflow engine, or search engine

## Product Success Criteria

Fulcrum succeeds when:

- a developer can install it locally and run the core workflow without cloud setup
- the operator can see all projects, tasks, agents, runs, artifacts, queues, and health
- agents can receive useful, cited context from tasks, memory, code, and graph
- code search returns exact and semantic evidence with explanations
- memory recall cites provenance and updates incrementally
- graph links update when code, memory, tasks, runs, and artifacts change
- worktree delivery protects user work and makes review/merge state visible
- setup doctor gives exact fixes instead of vague failures
- backup, restore, export, reset, rebuild, and uninstall are safe and understandable
- optional integrations improve the product without owning the product

## Clean-Slate Design Principle

Start from this product definition, not from accumulated implementation assumptions.

When choosing technology later, prefer tools that maximize product value with minimum reinvention. But every technology choice must serve these product rules:

- local-first core
- operator-owned state
- explainable agent work
- durable recovery
- safe setup
- incremental correctness
- no hidden dependency ownership
- replaceable integrations
