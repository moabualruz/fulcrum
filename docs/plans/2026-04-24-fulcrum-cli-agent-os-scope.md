# Fulcrum CLI Agent OS Scope

Date: 2026-04-24
Status: discussion draft

Canonical roadmap: `docs/plans/2026-04-24-fulcrum-cli-agent-os-roadmap.md`.

## Premise

Fulcrum is a CLI agent operating system.

It is not only a RAG app. It is not only a task tracker. It is not a sync client for Jira, Linear, GitHub Projects, or Plane. It should own the local operating layer for human-directed and agent-executed software work.

Target:

- local-first by default
- one human/operator
- many projects
- many CLI agents
- live work visibility
- durable state
- memory and code intelligence
- owned PM cockpit
- real orchestration, not passive notes

Ignore for now:

- CLI-agent-specific integrations
- plugins
- extension packaging
- runtime fanout

Those matter later, but this scope pass is about what Fulcrum is building.

## North Star

Fulcrum should feel like:

```text
local agent OS
  + personal Linear/Jira/GitHub Projects
  + live agent operations center
  + memory/code intelligence graph
  + worktree delivery system
```

The operator should see global and per-project work, assign or delegate tasks, watch agents act in real time, inspect context, review outputs, manage queues, and understand why the system made decisions.

## System Modules

### 1. Core OS Kernel

Purpose:

- own canonical local state
- provide stable IDs, roles, capabilities, config, migrations, and events
- track tasks and agent run lifecycle
- enforce workspace/project isolation
- keep runs alive with heartbeat/janitor behavior

Existing package:

- `packages/core`

Current responsibilities:

- SQLite schema and migrations
- tasks
- agent runs
- handoffs
- events
- advisory locks
- roles and capability helpers
- workspace/project status
- telemetry spans
- embedding provider registry
- janitor

Open architecture question:

- What belongs in the kernel versus higher modules?

### 2. Memory OS

Purpose:

- preserve raw knowledge
- curate useful project memory
- retrieve relevant historical context
- track provenance from raw source to answer/context

Existing package:

- `packages/memory`

Current responsibilities:

- L0 raw vault docs
- L1 curated/searchable memory
- L2 vector/graph memory
- recall
- write
- rebuild
- doctor
- evals
- query traces

Desired direction:

- L0 remains canonical.
- Memory must work incrementally.
- Normal edits must not require full rebuild.
- Retrieval should explain source and confidence.

### 3. Code Intelligence

Purpose:

- make code searchable as code, not just text
- support agent context packing for implementation work
- answer exact and semantic questions about the codebase

Required capabilities:

- exact identifier search
- path and filename search
- string/error search
- AST/symbol extraction
- imports/exports/dependencies
- semantic code chunk retrieval
- hybrid ranking
- stale index cleanup on delete/rename

Desired stack shape:

```text
AST layer
  -> symbols, definitions, imports, code chunks

lexical layer
  -> exact/BM25/path/string search

semantic layer
  -> behavior/meaning search over code chunks

fusion layer
  -> rank, dedupe, explain, pack context
```

Open architecture question:

- Should code intelligence stay inside memory, or become its own package/module with memory integration?

### 4. Memory-Code Graph

Purpose:

- link memory and code into one navigable knowledge graph
- connect decisions, plans, issues, tasks, files, symbols, chunks, entities, and agent actions

Examples:

- Which code implements this remembered decision?
- Which task introduced this symbol?
- Which files are affected by this plan?
- Which memories explain this architecture?
- Which agent changed this behavior?

Required graph edges:

- memory -> source L0 doc
- memory -> entity
- memory -> task/issue/plan
- task/issue/plan -> code file/symbol/chunk
- code symbol -> file
- code file -> import/dependency
- agent run -> task
- agent run -> artifact
- artifact -> code file

Design constraint:

- Graph must update on change.
- Graph must not depend on periodic full rebuild for correctness.

Open architecture question:

- One graph for memory+code+PM, or separate graphs with shared IDs?

### 5. Owned PM Cockpit

Purpose:

- local Linear/Jira/GitHub Projects-like interface owned by Fulcrum
- system of record for human tasks and agent tasks
- global and per-project management

This is not primarily sync with online providers.

Core views:

- global board across all projects
- per-project board
- epics/issues/tasks/plans
- blockers/dependencies
- assigned agents
- running/blocked/completed agent runs
- task queues
- review queues
- merge queues
- artifacts and handoffs
- current live activity

Existing packages involved:

- `packages/planning`
- `packages/core`
- `packages/monitor`
- `packages/worktrees`
- `packages/workflows`
- `packages/teams`

Existing planning responsibilities:

- epics
- issues
- PRDs
- plans
- task relations
- reviews

Desired direction:

- Fulcrum should own the PM experience.
- External Jira/Linear/GitHub/Plane sync is optional import/export, not the core.
- One-off sync with online providers can be agent tasks.

### 6. Agent Orchestration

Purpose:

- coordinate CLI agents as workers in the OS
- manage tasks, runs, teams, slots, workflows, handoffs, and budgets

Existing packages:

- `packages/core`
- `packages/worker`
- `packages/teams`
- `packages/workflows`

Current responsibilities:

- task lifecycle
- run lifecycle
- adapter contract
- team templates
- team instances
- slot policies
- workflow DAGs
- workflow step handlers
- prompt_user/wait_for_task flows

Desired direction:

- agent work should always map to visible task/run state
- actions should stream into cockpit/monitor
- handoffs and artifacts should be first-class
- orchestration should be understandable after the fact

### 7. Worktree Delivery System

Purpose:

- isolate implementation work
- manage agent branches/worktrees
- track artifacts
- review and merge safely

Existing package:

- `packages/worktrees`

Current responsibilities:

- git worktree allocation
- dirty/ready/merged/discarded lifecycle
- artifacts
- review records
- merge queue
- conflict handling

Desired direction:

- integrate with PM cockpit
- show worktree state next to task/agent run
- show artifacts and review gates
- make merge queue operationally visible

### 8. Policy / Governance

Purpose:

- enforce boundaries
- block unsafe actions
- audit decisions
- protect secrets

Existing package:

- `packages/policy`

Current responsibilities:

- system invariants
- custom policy rules
- role boundary checks
- secret detection/redaction
- audit log

Desired direction:

- policy should gate orchestration and action execution
- policy outcomes should be visible in live UI/logs
- agent violations should explain exact rule and action

### 9. Dashboard / Monitoring / Reporting

Purpose:

- show live and historical operating state
- make agent work observable while it happens

Existing package:

- `packages/monitor`

Current responsibilities:

- metrics
- burndown
- WIP
- agent stats
- SSE event stream
- HTTP control API
- dashboard
- analytics summaries

Desired live surfaces:

- active agents
- current agent step/action
- task progress
- events stream
- blocked work
- failed runs
- policy denials
- memory/RAG health
- code index health
- merge/review queues
- throughput and cycle time

### 10. Action Orchestration Interface

Purpose:

- expose Fulcrum operations as canonical actions
- power CLI, TUI, monitor controls, and MCP-compatible surfaces

Existing package:

- `packages/cli`

Current responsibilities:

- command groups
- canonical actions
- MCP tool compatibility
- action registry
- auto-init
- hooks
- TUI
- serve monitor/MCP

Desired direction:

- actions are the control plane API
- UI and CLI should call same actions
- actions should emit events and audit trails
- action results should be observable in PM cockpit

### 11. Optional External Sync / Import-Export

Purpose:

- bridge with outside systems when useful
- not the system of record

Existing package:

- `packages/sync`

Current responsibilities:

- Plane adapter
- queue/offline mode
- conflict detection
- push/pull
- secret scan before outbound push

Desired direction:

- demote from core architecture to optional bridge
- Jira/GitHub/Linear/Plane import/export can be explicit agent tasks
- sync must not define Fulcrum's PM model

### 12. Telemetry

Purpose:

- record spans and traces for system actions
- support debugging and observability

Existing location:

- mainly `packages/core`
- surfaced through monitor/CLI

Current responsibilities:

- trace events
- spans
- optional OTLP export

Desired direction:

- trace orchestration decisions
- trace agent run steps
- trace indexing/retrieval actions
- connect traces to tasks, runs, artifacts, and policy events

## Product Shape

Fulcrum should provide these operator surfaces:

### CLI

For fast direct control:

- create task
- assign agent
- run workflow
- inspect memory/code context
- reindex
- view status
- process queues

### TUI

For terminal cockpit:

- active agents
- boards
- events
- queues
- health
- logs

### Web Dashboard

For rich PM/orchestration interface:

- global and per-project board
- live agent activity
- issue/task/plan hierarchy
- dependency map
- memory/code graph inspection
- review/merge queues
- reports

### Agent-Facing APIs

For agents to:

- get current context
- search memory
- search code
- claim work
- update progress
- write artifacts
- complete/block runs

## Core Principle

Fulcrum owns the work operating model.

External tools can be sources or sinks, but Fulcrum should be able to run fully without them.

```text
Fulcrum = local source of operational truth
External PM tools = optional bridges
Agent runtimes = replaceable workers
Memory/code graph = owned intelligence layer
Dashboards = owned operator interface
```

## Discussion Questions Before Research

1. What is the exact boundary between memory and code intelligence?
2. Should code intelligence be a separate package?
3. Should there be one unified graph across memory/code/PM/events?
4. What is the minimum PM cockpit needed for daily use?
5. What live agent action stream should be visible?
6. What actions must be first-class in the owned PM interface?
7. Which current package boundaries are wrong for this OS framing?
8. Which data should be canonical, derived, or ephemeral?
9. What does "global across projects" require in schema and UI?
10. Which parts need product/tech research after scope is agreed?
