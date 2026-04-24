# Fulcrum CLI Agent OS
# Software Requirements Specification + Technical Design
# Version: 0.1.0
# Date: 2026-04-24
# Status: Product/architecture SRS draft
# Authoring basis: Conversation requirements + current public tool research
# Primary goal: Maximum leverage, minimum custom code, local-first operator control

---

## 0. Executive Summary

Fulcrum is a local-first control layer for one human operator working across many software projects with many CLI agents.

The product is not primarily a RAG app, not primarily a PM app, and not a new graph database. Fulcrum is a thin local operating layer that coordinates existing high-quality tools:

- Plane for project/task/document cockpit.
- memsearch for markdown-first shared memory across coding agents.
- Engram as simpler fallback memory backend.
- ripgrep, fd, ast-grep, Aider repo maps, Repomix, Semgrep, CodeQL, and configured quality gates for code context and validation.
- git worktree for isolated delivery.
- MCP, hooks, and CLI wrappers for agent integration.
- SQLite for Fulcrum-owned canonical local run/worktree/artifact/context state.
- Optional process-compose, tmux, watchexec, Langfuse, Helicone, OpenTelemetry, Goose, OpenHands, Plandex, and Aider as integrations rather than required dependencies.

The revised value-driven principle is:

> Build as little custom infrastructure as possible.
> Own only the state and workflow semantics that no existing tool should own:
> agent runs, worktree allocations, context packs, artifacts, quality-gate results, doctor status, policies, and sync/writeback.

Fulcrum should not build a custom graph database in v0. Instead, it should use stable IDs, structured links, markdown frontmatter, searchable memory, and relational references. A graph database may be introduced only if concrete queries cannot be answered with links, search, and simple refs.

---

## 1. Product Vision

Fulcrum should feel like:

```text
local agent control layer
  + Plane-powered project cockpit
  + shared memory and context system
  + code context and validation pipeline
  + supervised multi-agent run tracker
  + worktree delivery and review queue
````

Fulcrum should let a single operator:

* see work across projects;
* select or create work items;
* build explainable context for an agent;
* allocate safe isolated worktrees;
* launch and supervise CLI agents;
* capture run output, artifacts, diffs, test results, and decisions;
* write summaries back to Plane;
* persist useful memory in markdown;
* preserve local state;
* avoid custom heavyweight graph/RAG systems unless they prove necessary.

---

## 2. Core Product Philosophy

### 2.1 Local-first

Fulcrum must run on a developer machine.

Local-first means:

* Core workflows work without cloud dependencies.
* No remote telemetry by default.
* No remote model calls by default unless user configures agent/model.
* Local state is inspectable, exportable, backup-able, and purgeable.
* Remote integrations are optional, visible, and replaceable.
* Missing optional integrations degrade clearly.

### 2.2 Minimum custom code

Fulcrum should integrate mature open-source tools where possible.

Custom Fulcrum code should focus on:

* local canonical run state;
* worktree lifecycle;
* context pack assembly;
* agent launch/supervision wrappers;
* artifact capture;
* doctor/health status;
* policy/safety checks;
* integration sync/writeback.

Fulcrum should avoid building:

* custom PM UI in v0;
* custom vector database;
* custom graph database;
* custom code search engine;
* custom LSP replacement;
* custom agent framework;
* custom hosted orchestration platform.

### 2.3 Explainability over magic

Every meaningful output should show:

* source;
* tool used;
* timestamp;
* command/query;
* inclusion reason;
* freshness;
* confidence or limitation;
* linked task/run/artifact when relevant.

### 2.4 Quality gates over always-on LSP

For agents, especially with Rust and large workspaces, always-on LSP can be too expensive.

Fulcrum should prefer:

* exact search;
* structural search;
* repo maps;
* repo packs;
* targeted build/test/lint commands;
* quality gate evidence.

LSP may be optional per project, disabled by default for heavy workspaces.

---

## 3. Target Users

### 3.1 Primary human user

One developer/operator who:

* works across multiple repositories;
* uses CLI agents such as Codex, Claude Code, Gemini CLI, OpenCode, Copilot CLI, Aider, Goose, OpenHands, Plandex, or similar;
* wants local control over agent work;
* wants visibility into what agents are doing;
* wants useful memory and code context without maintaining a custom RAG/graph system;
* wants Plane or another PM system as a cockpit but does not want PM software to own execution truth.

### 3.2 Agent users

Agents are also first-class users of Fulcrum.

Agent users need:

* task details;
* context packs;
* memory search;
* code search;
* artifact attach;
* run heartbeat/event tools;
* policy checks;
* quality-gate commands;
* writeback instructions.

### 3.3 Non-target users for v0

Fulcrum v0 is not designed for:

* large teams;
* SaaS multi-tenancy;
* enterprise administration;
* cloud-only agent execution;
* plugin marketplace;
* full PM replacement;
* hosted GitHub Agent HQ clone;
* autonomous swarm orchestration without operator supervision.

---

## 4. Recommended Default Stack

### 4.1 Recommended v0 stack

```text
PM cockpit:
  Plane self-hosted or local dev instance

Memory:
  Primary: memsearch
  Fallback: Engram
  Optional mature general memory: Mem0

Code context:
  ripgrep
  fd
  ast-grep
  Aider repo map
  Repomix
  Semgrep optional
  CodeQL optional
  LSP optional/off by default

Validation:
  project-defined quality gates
  Rust example: cargo check, cargo test, cargo clippy, cargo fmt --check

Delivery:
  git worktree

Agent integration:
  MCP server
  CLI wrappers
  Claude Code hooks
  Copilot custom agents/hooks/MCP where available
  OpenCode MCP
  Gemini CLI MCP
  Codex MCP
  generic stdin/stdout wrappers

Process supervision:
  process-compose optional
  tmux optional
  watchexec optional

Fulcrum-owned state:
  SQLite
  append-only event table
  projection tables
  artifacts directory
  logs directory

Observability:
  local JSONL logs by default
  optional OpenTelemetry export
  optional Langfuse/Helicone for LLM trace workflows
```

### 4.2 Why not a graph DB in v0?

A graph DB is not required to link memories and files.

Fulcrum v0 should use:

* markdown frontmatter;
* stable IDs;
* `refs` table;
* links between tasks, runs, artifacts, files, symbols, and memory notes;
* memory backend search;
* code search evidence.

Only introduce graph DB if simple refs cannot answer real operational questions.

### 4.3 Why not always-on LSP?

LSP is not rejected; it is optional.

Default is off because:

* some language servers consume large memory;
* agents need validation more than autocomplete;
* exact/structural search plus tests are often more reliable;
* quality gates provide proof.

LSP can be enabled per project only if doctor confirms it is healthy and not memory-dangerous.

---

## 5. Tool Options, Pros, Cons, and Recommendations

### 5.1 Project cockpit / PM

#### Option A: Plane

Recommendation: DEFAULT

Pros:

* open-source PM platform;
* issues/tasks, cycles, modules, docs, triage;
* self-hostable;
* API surface;
* official MCP server;
* good cockpit candidate for humans and agents.

Cons:

* heavier than a local CLI task file;
* must not become Fulcrum execution truth;
* self-hosting adds operational overhead;
* AGPL license considerations if bundling/distributing modifications.

Use for:

* projects;
* work items;
* docs;
* issue status;
* human planning;
* agent-visible PM context.

Do not use for:

* local run execution truth;
* worktree lifecycle;
* context-pack internals;
* artifact storage;
* safety policy.

#### Option B: Taskwarrior

Recommendation: FALLBACK / minimal mode

Pros:

* local CLI;
* JSON export;
* simple;
* mature;
* low infra.

Cons:

* no rich PM cockpit;
* not agent-run-native;
* docs/triage/cycles are limited compared with Plane.

Use when:

* user refuses PM server;
* terminal-only mode is desired.

#### Option C: OpenProject

Recommendation: OPTIONAL heavier PM alternative

Pros:

* mature open-source PM;
* enterprise-grade project management;
* task/work-package model;
* self-hosted.

Cons:

* heavier than Plane for this use case;
* less agent-native;
* likely more custom adapter work.

#### Option D: Huly

Recommendation: WATCH / optional alternative

Pros:

* all-in-one project/process/knowledge platform;
* self-hosted path;
* modern UI.

Cons:

* heavier and broader than Fulcrum needs;
* adapter maturity uncertain compared with Plane MCP/API path.

### 5.2 Memory

#### Option A: memsearch

Recommendation: DEFAULT

Pros:

* markdown-first;
* cross-agent memory target;
* designed around coding agents;
* source of truth remains editable markdown;
* index is rebuildable;
* fits local-first and minimum-custom-code principle.

Cons:

* newer;
* Milvus/vector layer may add moving parts;
* still requires Fulcrum to manage run/task/worktree semantics.

Use for:

* durable memory notes;
* cross-agent recall;
* project decisions;
* lessons learned;
* session handoffs;
* memory-to-file links via markdown frontmatter.

#### Option B: Engram

Recommendation: SIMPLE FALLBACK

Pros:

* local SQLite + FTS5;
* MCP server;
* HTTP API;
* CLI and TUI;
* simple infra.

Cons:

* less markdown-first by default;
* may require wrapper/export to align with Fulcrum memory files;
* less specialized for cross-agent coding memory.

Use when:

* user wants no vector infra;
* simple local full-text memory is enough.

#### Option C: Mem0

Recommendation: OPTIONAL mature/general memory

Pros:

* mature general agent memory ecosystem;
* strong personalization/long-term memory story;
* useful for user preferences and application memory.

Cons:

* not naturally markdown-first;
* can become opaque;
* more infra;
* less directly aligned with local coding-agent memory.

Use when:

* automatic extraction/personalization matters more than local markdown ownership.

#### Option D: Redis Agent Memory Server / mcp-memory-service / agentmemory

Recommendation: EVALUATE, not default

Pros:

* MCP/REST shared memory patterns;
* useful for multi-agent pipelines.

Cons:

* may add infrastructure;
* may be less aligned with markdown source of truth;
* uncertain maturity relative to Fulcrum needs.

### 5.3 Code context and search

#### Exact search: ripgrep

Recommendation: DEFAULT

Pros:

* fast;
* respects ignore rules by default;
* exact identifier/error/string search;
* easy provenance.

Cons:

* needs query terms;
* weak for conceptual search.

#### File discovery: fd

Recommendation: DEFAULT

Pros:

* fast;
* user-friendly file search;
* good replacement for complex find commands.

Cons:

* not a semantic code tool.

#### Structural search: ast-grep

Recommendation: DEFAULT

Pros:

* AST-based structural search/replace;
* lighter than LSP;
* good for patterns and refactors;
* useful for agent-generated precise searches.

Cons:

* pattern syntax requires learning;
* language coverage varies.

#### Repo map: Aider

Recommendation: DEFAULT

Pros:

* concise whole-repo map;
* symbols/functions/classes/call signatures;
* useful for context budget;
* reduces need for custom symbol index.

Cons:

* not proof of correctness;
* may not capture runtime behavior;
* should be refreshed.

#### Repo pack: Repomix

Recommendation: DEFAULT ON DEMAND

Pros:

* packages repo into AI-friendly output;
* useful for review/refactor/research;
* easy to feed across many agents.

Cons:

* can be too large;
* must honor ignore/secrets rules;
* not needed for every run.

#### Static/security analysis: Semgrep

Recommendation: OPTIONAL QUALITY GATE

Pros:

* lightweight static analysis;
* supports many languages;
* CLI-friendly;
* can enforce standards.

Cons:

* rule tuning required;
* false positives possible.

#### Semantic/security analysis: CodeQL

Recommendation: OPTIONAL QUALITY GATE

Pros:

* strong security analysis;
* query code as data;
* useful for vulnerability classes.

Cons:

* heavier;
* setup per language/repo;
* overkill for small v0 flows.

#### LSP

Recommendation: OPTIONAL / DISABLED BY DEFAULT

Pros:

* definitions/references/types;
* useful when healthy and cheap.

Cons:

* memory-heavy for some languages/workspaces;
* agents can over-trust it;
* quality gates are more valuable for correctness.

### 5.4 Agent workers

Fulcrum should not replace agents. It should orchestrate them.

Supported categories:

* Codex CLI
* Claude Code
* Gemini CLI
* OpenCode
* GitHub Copilot CLI
* Aider
* Goose
* OpenHands CLI/SDK
* Plandex
* generic shell command agent

#### Codex CLI

Use via:

* MCP config;
* CLI wrapper;
* AGENTS.md.

#### Claude Code

Use via:

* MCP;
* hooks;
* CLAUDE.md;
* auto memory awareness;
* CLI wrapper.

#### Gemini CLI

Use via:

* MCP settings;
* CLI wrapper;
* GEMINI.md or project instruction equivalent if used.

#### OpenCode

Use via:

* MCP config;
* agent configuration;
* CLI wrapper.

#### GitHub Copilot CLI

Use via:

* custom agents;
* MCP where available;
* hooks where available;
* CLI wrapper.

#### Aider

Use as:

* worker agent;
* repo map provider;
* optional edit agent.

#### Goose / OpenHands / Plandex

Use as optional workers for:

* autonomous coding tasks;
* large codebase planning;
* alternate model/tool stacks.

Do not build agent-specific deep integration in v0 unless needed.

### 5.5 Supervision and processes

#### process-compose

Recommendation: OPTIONAL

Pros:

* local process orchestration;
* TUI;
* logs;
* can supervise non-containerized apps.

Cons:

* extra dependency;
* Fulcrum still needs run state.

Use for:

* starting local Plane, memory server, Fulcrum MCP, workers.

#### tmux

Recommendation: OPTIONAL

Pros:

* persistent terminal sessions;
* attach/detach;
* battle-tested.

Cons:

* scripting can be brittle;
* per-agent output capture still needs wrappers.

#### watchexec

Recommendation: OPTIONAL

Pros:

* run commands on file changes;
* useful for test/watch modes.

Cons:

* not a run state engine.

---

## 6. System Boundary

### 6.1 Fulcrum owns

Fulcrum owns:

* project registry;
* local links to Plane projects/work items;
* local run records;
* run lifecycle;
* worktree allocation records;
* artifact records;
* context pack records;
* quality gate results;
* local event log;
* policy decisions;
* doctor/health checks;
* adapter configuration;
* sync/writeback records;
* local backups/exports.

### 6.2 Fulcrum does not own

Fulcrum does not own:

* PM board UI if Plane is configured;
* memory index implementation;
* vector DB internals;
* code search engine internals;
* agent reasoning;
* Git itself;
* language build tools;
* remote model provider;
* remote PM data.

### 6.3 Canonical truth split

Plane is canonical for:

* human project planning;
* Plane issue title/status/description/comments/docs.

memsearch/Engram is canonical for:

* memory content, unless Fulcrum stores markdown directly and indexes through it.

Git is canonical for:

* repository content;
* branches;
* commits;
* worktree status.

Fulcrum is canonical for:

* local run state;
* context packs;
* artifacts;
* quality gate results;
* worktree allocation metadata;
* execution safety decisions.

---

## 7. High-Level Architecture

```text
┌────────────────────────────────────────────────────────────┐
│ Human Operator                                             │
│ - Plane cockpit                                            │
│ - Fulcrum CLI/TUI                                          │
│ - local editor/terminal                                    │
└──────────────────────────────┬─────────────────────────────┘
                               │
┌──────────────────────────────▼─────────────────────────────┐
│ Fulcrum Thin Control Layer                                 │
│                                                            │
│ Owns:                                                      │
│ - SQLite local state                                       │
│ - run lifecycle                                            │
│ - worktree lifecycle                                       │
│ - context pack assembly                                    │
│ - artifact capture                                         │
│ - quality gate orchestration                               │
│ - policy checks                                            │
│ - doctor                                                   │
│ - sync/writeback                                           │
│ - MCP server                                               │
└───────┬─────────────┬─────────────┬──────────────┬─────────┘
        │             │             │              │
        ▼             ▼             ▼              ▼
┌────────────┐ ┌─────────────┐ ┌────────────┐ ┌───────────────┐
│ Plane      │ │ Memory      │ │ Code Tools │ │ CLI Agents    │
│ API/MCP    │ │ memsearch   │ │ rg/fd/sg   │ │ Claude/Codex  │
│            │ │ Engram      │ │ aider map  │ │ Gemini/etc    │
│            │ │ markdown    │ │ repomix    │ │               │
└────────────┘ └─────────────┘ └────────────┘ └───────────────┘
        │             │             │              │
        └─────────────┴─────────────┴──────────────┘
                         │
                         ▼
                 ┌──────────────┐
                 │ Git worktree │
                 │ delivery     │
                 └──────────────┘
```

---

## 8. Functional Requirements

### 8.1 Project registry

FR-PROJ-001:
Fulcrum shall maintain a local registry of projects.

Each project shall include:

* Fulcrum project ID;
* name;
* root repo path;
* default branch;
* worktree base path;
* Plane workspace/project mapping if configured;
* memory path;
* quality gate config;
* ignored paths;
* enabled tools;
* disabled tools;
* privacy mode.

FR-PROJ-002:
Fulcrum shall support adding a project from an existing Git repository.

FR-PROJ-003:
Fulcrum shall detect whether a project has:

* git repo;
* Plane mapping;
* memory backend;
* AGENTS.md;
* CLAUDE.md;
* quality gate config;
* worktree path;
* required CLI tools.

FR-PROJ-004:
Fulcrum shall expose project registry through:

* CLI;
* JSON;
* MCP resource/tool.

### 8.2 Plane integration

FR-PLANE-001:
Fulcrum shall support connecting to Plane through API credentials or local/self-hosted instance configuration.

FR-PLANE-002:
Fulcrum shall import Plane projects and work items as local task mirrors.

FR-PLANE-003:
Fulcrum shall store external Plane IDs separately from local Fulcrum IDs.

FR-PLANE-004:
Fulcrum shall never require Plane to be reachable for existing local run state to function.

FR-PLANE-005:
Fulcrum shall write back agent run summaries to Plane as comments or structured updates when configured.

FR-PLANE-006:
Fulcrum shall map Plane work-item status to Fulcrum task state using configurable mappings.

Example:

```yaml
plane_status_map:
  backlog: pending
  todo: pending
  in_progress: active
  blocked: blocked
  done: completed
```

FR-PLANE-007:
Fulcrum shall support Plane docs/pages as memory sources if configured.

FR-PLANE-008:
Fulcrum shall show sync status:

* never synced;
* synced;
* local newer;
* remote newer;
* conflict;
* failed;
* disabled.

### 8.3 Task model

FR-TASK-001:
Fulcrum shall maintain local task mirrors.

Fields:

* task_id;
* external_source;
* external_id;
* project_id;
* title;
* description_snapshot;
* status;
* priority;
* labels;
* created_at;
* updated_at;
* source_updated_at;
* local_updated_at;
* blocked_reason;
* assigned_agent;
* current_run_id;
* linked_memory_refs;
* linked_artifacts;
* linked_files;
* linked_worktree.

FR-TASK-002:
Fulcrum shall support local-only tasks if Plane is not configured.

FR-TASK-003:
Fulcrum shall support status transitions:

```text
pending -> ready
ready -> running
running -> blocked
running -> review
running -> failed
running -> completed
blocked -> ready
review -> completed
review -> blocked
review -> running
failed -> ready
completed -> archived
```

FR-TASK-004:
Fulcrum shall reject invalid state transitions unless forced with explicit operator confirmation.

FR-TASK-005:
Fulcrum shall expose task details to agents through MCP.

### 8.4 Run lifecycle

FR-RUN-001:
Fulcrum shall create a run for each agent execution.

Run fields:

* run_id;
* task_id;
* project_id;
* agent_name;
* agent_command;
* status;
* created_at;
* started_at;
* ended_at;
* worktree_id;
* context_pack_id;
* parent_run_id;
* log_path;
* transcript_path;
* artifact_refs;
* quality_gate_refs;
* policy_decision_refs;
* summary;
* failure_reason;
* exit_code.

FR-RUN-002:
Run statuses shall be:

```text
created
starting
running
waiting_for_agent
waiting_for_operator
blocked
cancel_requested
cancelled
failed
succeeded
review_required
completed
```

FR-RUN-003:
Each run shall reach at most one terminal state.

Terminal states:

```text
cancelled
failed
completed
```

FR-RUN-004:
Fulcrum shall record run events in append-only event log.

FR-RUN-005:
Fulcrum shall allow agents to emit heartbeat events.

FR-RUN-006:
Fulcrum shall detect stale runs with no heartbeat after configurable timeout.

FR-RUN-007:
Fulcrum shall support manual cancellation.

FR-RUN-008:
Fulcrum shall not assume a killed process means no file changes were made.

FR-RUN-009:
Fulcrum shall record process ID and process group where possible.

FR-RUN-010:
Fulcrum shall capture stdout/stderr to logs.

FR-RUN-011:
Fulcrum shall capture final agent summary.

### 8.5 Agent adapters

FR-AGENT-001:
Fulcrum shall support registering agents.

Agent config fields:

```yaml
agents:
  claude:
    command: "claude"
    type: "cli"
    supports_mcp: true
    supports_hooks: true
    supports_noninteractive: true
    default_args: []
  codex:
    command: "codex"
    type: "cli"
    supports_mcp: true
  gemini:
    command: "gemini"
    type: "cli"
    supports_mcp: true
  opencode:
    command: "opencode"
    type: "cli"
    supports_mcp: true
  copilot:
    command: "gh copilot"
    type: "cli"
    supports_mcp: partial
  aider:
    command: "aider"
    type: "cli"
    roles:
      - worker
      - repo_map_provider
```

FR-AGENT-002:
Fulcrum shall launch any configured agent through a generic command wrapper.

FR-AGENT-003:
Fulcrum shall pass task/context information to agents by one of:

* stdin prompt;
* prompt file;
* environment variables;
* MCP tools;
* agent-specific hook/config;
* command-line argument.

FR-AGENT-004:
Fulcrum shall not require deep vendor-specific integration for any agent.

FR-AGENT-005:
Fulcrum shall record which context pack was given to each run.

FR-AGENT-006:
Fulcrum shall support agent role preferences:

* planner;
* implementer;
* reviewer;
* researcher;
* tester;
* documenter.

FR-AGENT-007:
Fulcrum shall support disabling an agent per project.

### 8.6 MCP server

FR-MCP-001:
Fulcrum shall expose an MCP server.

FR-MCP-002:
The Fulcrum MCP server shall default to local stdio or loopback-only HTTP.

FR-MCP-003:
The MCP server shall expose tools:

```text
fulcrum_doctor_status
fulcrum_project_list
fulcrum_task_get
fulcrum_task_claim
fulcrum_task_update_status
fulcrum_run_start
fulcrum_run_heartbeat
fulcrum_run_event
fulcrum_run_complete
fulcrum_context_build
fulcrum_context_get
fulcrum_context_explain
fulcrum_memory_search
fulcrum_memory_add
fulcrum_code_search
fulcrum_repo_map_get
fulcrum_repomix_pack
fulcrum_worktree_allocate
fulcrum_worktree_status
fulcrum_artifact_attach
fulcrum_quality_gate_run
fulcrum_policy_check
```

FR-MCP-004:
Dangerous MCP tools shall require policy approval unless explicitly configured otherwise.

Dangerous actions include:

* deleting worktrees;
* running arbitrary shell;
* writing memory marked permanent;
* modifying Plane status;
* posting Plane comment;
* merging branches;
* cleaning untracked files.

FR-MCP-005:
All MCP calls shall be logged with:

* tool name;
* caller if known;
* run ID if known;
* parameters hash;
* redacted parameters;
* result summary;
* timestamp.

FR-MCP-006:
MCP errors shall be machine-readable.

### 8.7 Memory OS

FR-MEM-001:
Fulcrum shall treat markdown memory as the preferred canonical memory format.

Memory file types:

```text
session.md
decisions.md
gotchas.md
procedures.md
codemap.md
lessons.md
handoffs.md
```

FR-MEM-002:
Fulcrum shall support memsearch as default memory index/search backend.

FR-MEM-003:
Fulcrum shall support Engram as alternative memory backend.

FR-MEM-004:
Fulcrum shall not require a vector store to run.

FR-MEM-005:
Fulcrum shall support memory entries with frontmatter.

Example:

```md
---
id: mem_2026_04_24_auth_refresh
project_id: proj_myapp
plane_issue: PLANE-123
runs:
  - run_2026_04_24_001
files:
  - src/auth/session.ts
  - src/billing/page.tsx
symbols:
  - refreshSession
  - BillingPage
status: active
freshness: fresh
created_at: 2026-04-24T12:30:00+02:00
updated_at: 2026-04-24T12:30:00+02:00
source_refs:
  - plane:PLANE-123
  - run:run_2026_04_24_001
---

# Auth refresh billing logout issue

## Summary

Refreshing billing could clear session state because transient 401s were treated as permanent logout events.

## Decision

Session refresh errors must distinguish transient auth API failure from confirmed invalid credentials.

## Evidence

- Plane issue: PLANE-123
- Run: run_2026_04_24_001
- Files: `src/auth/session.ts`, `src/billing/page.tsx`
```

FR-MEM-006:
Memory search results shall include:

* memory ID;
* title;
* content excerpt;
* source file;
* linked task/run/file refs;
* freshness;
* status;
* search backend;
* rank;
* reason if available.

FR-MEM-007:
Fulcrum shall support memory writeback after run completion.

FR-MEM-008:
Memory writeback shall not silently create permanent memory unless policy allows it.

FR-MEM-009:
Memory entries shall support statuses:

```text
active
draft
superseded
stale
archived
deleted
```

FR-MEM-010:
Fulcrum shall support marking memory stale when linked files are deleted or renamed if detected.

FR-MEM-011:
Fulcrum shall support local memory export.

FR-MEM-012:
Fulcrum shall not index secrets when ignore/redaction rules match.

### 8.8 Code context

FR-CODE-001:
Fulcrum shall provide exact search using ripgrep or git grep.

FR-CODE-002:
Fulcrum shall provide file search using fd or equivalent.

FR-CODE-003:
Fulcrum shall provide structural search using ast-grep if installed.

FR-CODE-004:
Fulcrum shall support Aider repo map generation.

FR-CODE-005:
Fulcrum shall support Repomix repo pack generation.

FR-CODE-006:
Fulcrum shall cache repo maps and repo packs with:

* tool version;
* repo commit hash;
* config hash;
* generated_at;
* path;
* size;
* included files count.

FR-CODE-007:
Fulcrum shall invalidate cached context when:

* repo HEAD changes;
* working tree changes if pack includes dirty files;
* ignore rules change;
* config changes.

FR-CODE-008:
Fulcrum shall classify code evidence as:

```text
exact_identifier
exact_string
path_match
filename_match
structural_match
repo_map
repo_pack
memory_linked_file
plane_linked_file
agent_selected_file
quality_gate_output
semantic_optional
```

FR-CODE-009:
Exact/path/structural matches shall not be buried under weak semantic matches.

FR-CODE-010:
Fulcrum shall support semantic code search only as optional backend.

FR-CODE-011:
Fulcrum shall support project-level disabling of LSP.

FR-CODE-012:
Fulcrum shall record code-search provenance:

* command;
* query;
* working directory;
* result count;
* ignored paths;
* duration;
* exit code.

FR-CODE-013:
Fulcrum shall support source line references when tool output includes line numbers.

### 8.9 Context Builder

FR-CTX-001:
Fulcrum shall build context packs for tasks/runs.

FR-CTX-002:
A context pack shall include multi-lane evidence:

```text
task_lane
plane_lane
memory_lane
exact_code_lane
structural_code_lane
repo_map_lane
repo_pack_lane
recent_run_lane
artifact_lane
quality_gate_lane
policy_lane
operator_note_lane
```

FR-CTX-003:
Each context item shall include:

```json
{
  "id": "ctx_item_...",
  "type": "memory|code|task|plane|run|artifact|quality_gate|policy",
  "source": "...",
  "ref": "...",
  "title": "...",
  "excerpt": "...",
  "reason": "...",
  "freshness": "fresh|stale|unknown",
  "confidence": 0.0,
  "budget_tokens_estimate": 0,
  "created_at": "...",
  "tool": "...",
  "query": "..."
}
```

FR-CTX-004:
Context pack shall have a budget.

FR-CTX-005:
Context pack shall show omissions when budget is exceeded.

FR-CTX-006:
Context pack shall show degraded lanes.

Example:

```json
{
  "lane": "memory",
  "status": "degraded",
  "reason": "memsearch not running; used markdown grep fallback"
}
```

FR-CTX-007:
Context pack shall be exportable as:

* markdown;
* JSON;
* agent prompt file;
* machine-readable MCP resource.

FR-CTX-008:
Context pack shall be explainable.

FR-CTX-009:
Context builder shall avoid one source dominating unless the task explicitly targets that source.

FR-CTX-010:
Context builder shall include exact code evidence before semantic evidence.

### 8.10 Worktree delivery

FR-WT-001:
Fulcrum shall use git worktree for isolated agent work.

FR-WT-002:
Fulcrum shall allocate a worktree per run or per task, configurable.

FR-WT-003:
Worktree fields:

* worktree_id;
* project_id;
* task_id;
* run_id;
* path;
* branch;
* base_branch;
* base_commit;
* status;
* created_at;
* last_checked_at;
* dirty_status;
* untracked_count;
* conflict_status;
* cleanup_allowed;
* cleanup_block_reason.

FR-WT-004:
Fulcrum shall never silently delete or overwrite user changes.

FR-WT-005:
Before cleanup, Fulcrum shall check:

* dirty files;
* untracked files;
* uncommitted changes;
* unpushed commits;
* branch merged status;
* attached artifacts;
* active runs;
* operator approval.

FR-WT-006:
Fulcrum shall support branch naming template.

Example:

```yaml
worktrees:
  branch_template: "fulcrum/{task_key}-{short_title}"
  path_template: "~/.fulcrum/worktrees/{project_slug}/{task_key}"
```

FR-WT-007:
Fulcrum shall show worktree diff summary.

FR-WT-008:
Fulcrum shall support linking worktree changes to artifacts.

### 8.11 Quality gates

FR-QG-001:
Fulcrum shall support project-defined quality gates.

Quality gate config example:

```yaml
quality_gates:
  fast:
    description: "cheap local correctness check"
    commands:
      - name: "cargo check"
        cmd: "cargo check --workspace"
        timeout_seconds: 600

  test:
    description: "targeted tests"
    commands:
      - name: "cargo test targeted"
        cmd: "cargo test {{test_filter}}"
        timeout_seconds: 900
        optional_args:
          test_filter: ""

  lint:
    commands:
      - name: "cargo clippy"
        cmd: "cargo clippy --workspace --all-targets -- -D warnings"

  format:
    commands:
      - name: "cargo fmt"
        cmd: "cargo fmt --check"

  security:
    optional: true
    commands:
      - name: "semgrep"
        cmd: "semgrep scan --config auto"
      - name: "codeql"
        cmd: "codeql database analyze ..."
        enabled: false
```

FR-QG-002:
Quality gate results shall include:

* command;
* working directory;
* start/end time;
* duration;
* exit code;
* stdout path;
* stderr path;
* parsed summary if available;
* status.

Statuses:

```text
not_run
running
passed
failed
skipped
timeout
cancelled
degraded
```

FR-QG-003:
Fulcrum shall support quality gate presets by language.

FR-QG-004:
For Rust projects, Fulcrum shall prefer `cargo check`, targeted `cargo test`, `cargo clippy`, and `cargo fmt --check` over always-on LSP validation.

FR-QG-005:
Fulcrum shall allow operator to require quality gates before writeback/merge.

FR-QG-006:
Fulcrum shall record quality gate output as artifacts.

### 8.12 Artifacts

FR-ART-001:
Fulcrum shall store artifacts locally.

Artifact types:

```text
transcript
stdout
stderr
diff
patch
test_log
quality_gate_report
context_pack
repo_map
repo_pack
memory_note
plane_writeback
review_report
screenshot_optional
other
```

FR-ART-002:
Artifact fields:

* artifact_id;
* run_id;
* task_id;
* project_id;
* type;
* path;
* content_hash;
* size_bytes;
* created_at;
* redaction_status;
* summary;
* linked_refs.

FR-ART-003:
Fulcrum shall support attaching artifacts to Plane writeback when configured.

FR-ART-004:
Fulcrum shall redact secrets from artifacts where possible.

FR-ART-005:
Fulcrum shall keep raw logs separate from summarized writebacks.

### 8.13 Policies and safety

FR-POL-001:
Fulcrum shall require explicit operator approval for destructive actions unless configured.

Destructive actions:

* delete worktree;
* reset branch;
* clean untracked files;
* remove memory;
* purge backup;
* merge branch;
* run arbitrary shell from MCP;
* post to remote PM;
* call remote model/provider if privacy mode forbids it.

FR-POL-002:
Fulcrum shall expose policy checks to agents.

FR-POL-003:
Fulcrum shall log policy decisions.

Policy decision fields:

* decision_id;
* action;
* subject;
* requested_by;
* run_id;
* allowed;
* reason;
* approval_required;
* approved_by;
* approved_at.

FR-POL-004:
Fulcrum shall support dry-run/preview.

FR-POL-005:
Fulcrum shall keep privacy status visible.

Privacy states:

```text
local_only
local_with_optional_remote_disabled
remote_pm_enabled
remote_model_enabled
remote_observability_enabled
unknown
```

FR-POL-006:
Fulcrum shall warn when MCP server exposes dangerous tools.

FR-POL-007:
Fulcrum shall bind local services to loopback by default.

FR-POL-008:
Fulcrum shall respect `.gitignore`, `.ignore`, `.fulcrumignore`, `.repomixignore`, and backend-specific ignore files where applicable.

### 8.14 Doctor and setup

FR-DOC-001:
Fulcrum shall provide:

```bash
fulcrum doctor
fulcrum doctor --json
```

FR-DOC-002:
Doctor shall classify capabilities as:

```text
managed
detected
guided
optional
blocked
degraded
disabled
unknown
```

FR-DOC-003:
Doctor shall check:

* SQLite state path;
* event log integrity;
* Plane connectivity;
* memory backend;
* memsearch index status;
* Engram status if used;
* rg installed;
* fd installed;
* ast-grep installed;
* aider installed;
* repomix installed;
* git installed;
* git worktree support;
* project repo status;
* worktree base path;
* quality gates;
* agent commands;
* MCP server config for agents;
* Claude hooks if configured;
* Copilot agent/MCP config if configured;
* Gemini MCP config if configured;
* OpenCode MCP config if configured;
* ignored paths;
* secret redaction config;
* remote endpoint/privacy status.

FR-DOC-004:
Doctor shall show exact next action.

Example:

```text
Capability: memsearch
State: guided
Problem: memsearch executable not found
Next action: uv tool install "memsearch[onnx]"
Blocking: no
```

FR-DOC-005:
Doctor shall not mutate global host state without explicit operator confirmation.

FR-DOC-006:
Setup shall support preview mode.

```bash
fulcrum setup preview
fulcrum setup apply
```

FR-DOC-007:
Uninstall shall preserve backups unless user explicitly purges.

### 8.15 Backup, restore, export

FR-BACKUP-001:
Fulcrum shall support backup of:

* SQLite DB;
* artifacts;
* logs;
* config;
* memory markdown if managed by Fulcrum;
* generated context packs if requested.

FR-BACKUP-002:
Fulcrum shall support restore.

FR-BACKUP-003:
Fulcrum shall support export to JSON/JSONL.

FR-BACKUP-004:
Fulcrum shall support rebuild of derived data:

* projections;
* repo map cache;
* repomix cache;
* memory index;
* code refs.

FR-BACKUP-005:
Backup purge shall require explicit confirmation.

---

## 9. Non-Functional Requirements

### 9.1 Local-first

NFR-LOCAL-001:
Core operations shall work without network:

* list projects/tasks from local cache;
* list runs;
* inspect artifacts;
* allocate worktree if repo local;
* build context from local memory/code;
* run local agents if configured;
* run quality gates;
* backup/export.

NFR-LOCAL-002:
Remote dependencies shall be optional.

### 9.2 Reliability

NFR-REL-001:
Fulcrum shall survive process crash without corrupting run history.

NFR-REL-002:
Run state shall be recoverable after restart.

NFR-REL-003:
Fulcrum shall use transactional writes for canonical state.

NFR-REL-004:
Event log shall be append-only except maintenance/compaction operations.

NFR-REL-005:
Projections shall be rebuildable from events.

### 9.3 Performance

NFR-PERF-001:
Common CLI commands shall return quickly:

* project list: < 500ms from local cache;
* task list: < 1s from local cache;
* run status: < 500ms;
* doctor quick: < 3s excluding optional deep checks.

NFR-PERF-002:
Heavy operations shall be explicit or async:

* Repomix pack;
* Aider repo map refresh;
* Semgrep/CodeQL;
* full test suite;
* Plane full sync.

NFR-PERF-003:
LSP shall not be automatically started unless enabled.

### 9.4 Security

NFR-SEC-001:
No hidden network access in core workflows.

NFR-SEC-002:
Secrets shall be redacted from logs/artifacts where possible.

NFR-SEC-003:
MCP tools that can mutate state shall be policy-gated.

NFR-SEC-004:
Remote PM and remote observability credentials shall be stored securely or configured through environment variables.

NFR-SEC-005:
Fulcrum shall support `--local-only` mode.

NFR-SEC-006:
Fulcrum shall warn if configured agents may call remote models.

### 9.5 Usability

NFR-USE-001:
Fulcrum shall produce useful human-readable CLI output.

NFR-USE-002:
Fulcrum shall support JSON output for agents.

NFR-USE-003:
Error messages shall include next actions.

NFR-USE-004:
Default commands shall not require the user to understand internal event sourcing or graph concepts.

### 9.6 Extensibility

NFR-EXT-001:
Every external tool shall be configured through adapter settings.

NFR-EXT-002:
Adapters shall be replaceable.

NFR-EXT-003:
Fulcrum shall expose stable CLI and MCP surfaces.

---

## 10. Data Model

### 10.1 Directory layout

Recommended:

```text
~/.fulcrum/
  fulcrum.db
  config.yaml
  logs/
    fulcrum.log
    events.jsonl
  artifacts/
    {project_id}/
      {task_id}/
        {run_id}/
  cache/
    repo_maps/
    repomix/
    search/
  backups/
  worktrees/
    {project_slug}/
  memory/
    user/
      preferences.md
      profile.md
    projects/
      {project_slug}/
        session.md
        decisions.md
        gotchas.md
        codemap.md
        procedures.md
        lessons.md
```

Optional per-repo:

```text
repo/
  AGENTS.md
  CLAUDE.md
  .fulcrum/
    project.yaml
    memory -> ~/.fulcrum/memory/projects/{project_slug}
```

### 10.2 SQLite schema draft

```sql
CREATE TABLE events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  project_id TEXT,
  task_id TEXT,
  run_id TEXT,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  causation_id TEXT,
  correlation_id TEXT
);

CREATE INDEX idx_events_aggregate ON events(aggregate_type, aggregate_id, created_at);
CREATE INDEX idx_events_run ON events(run_id, created_at);
CREATE INDEX idx_events_task ON events(task_id, created_at);

CREATE TABLE projects (
  project_id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  repo_path TEXT NOT NULL,
  default_branch TEXT,
  worktree_base_path TEXT,
  memory_path TEXT,
  plane_workspace_id TEXT,
  plane_project_id TEXT,
  status TEXT NOT NULL,
  config_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE tasks (
  task_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  external_source TEXT,
  external_id TEXT,
  title TEXT NOT NULL,
  description_snapshot TEXT,
  status TEXT NOT NULL,
  priority TEXT,
  labels_json TEXT,
  assigned_agent TEXT,
  current_run_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  source_updated_at TEXT,
  local_updated_at TEXT,
  blocked_reason TEXT,
  FOREIGN KEY(project_id) REFERENCES projects(project_id)
);

CREATE INDEX idx_tasks_project_status ON tasks(project_id, status);
CREATE UNIQUE INDEX idx_tasks_external ON tasks(external_source, external_id);

CREATE TABLE runs (
  run_id TEXT PRIMARY KEY,
  task_id TEXT,
  project_id TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  agent_command TEXT,
  status TEXT NOT NULL,
  worktree_id TEXT,
  context_pack_id TEXT,
  parent_run_id TEXT,
  process_id INTEGER,
  process_group_id INTEGER,
  log_path TEXT,
  transcript_path TEXT,
  summary TEXT,
  failure_reason TEXT,
  exit_code INTEGER,
  created_at TEXT NOT NULL,
  started_at TEXT,
  ended_at TEXT,
  last_heartbeat_at TEXT,
  FOREIGN KEY(project_id) REFERENCES projects(project_id),
  FOREIGN KEY(task_id) REFERENCES tasks(task_id)
);

CREATE INDEX idx_runs_project_status ON runs(project_id, status);
CREATE INDEX idx_runs_task ON runs(task_id);

CREATE TABLE worktrees (
  worktree_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  task_id TEXT,
  run_id TEXT,
  path TEXT NOT NULL,
  branch TEXT NOT NULL,
  base_branch TEXT,
  base_commit TEXT,
  status TEXT NOT NULL,
  dirty_status TEXT,
  untracked_count INTEGER DEFAULT 0,
  conflict_status TEXT,
  cleanup_allowed INTEGER DEFAULT 0,
  cleanup_block_reason TEXT,
  created_at TEXT NOT NULL,
  last_checked_at TEXT,
  FOREIGN KEY(project_id) REFERENCES projects(project_id)
);

CREATE TABLE artifacts (
  artifact_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  task_id TEXT,
  run_id TEXT,
  type TEXT NOT NULL,
  path TEXT NOT NULL,
  content_hash TEXT,
  size_bytes INTEGER,
  summary TEXT,
  redaction_status TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(project_id),
  FOREIGN KEY(task_id) REFERENCES tasks(task_id),
  FOREIGN KEY(run_id) REFERENCES runs(run_id)
);

CREATE TABLE context_packs (
  context_pack_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  task_id TEXT,
  run_id TEXT,
  title TEXT,
  status TEXT NOT NULL,
  budget_tokens INTEGER,
  output_markdown_path TEXT,
  output_json_path TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT,
  summary TEXT
);

CREATE TABLE context_items (
  context_item_id TEXT PRIMARY KEY,
  context_pack_id TEXT NOT NULL,
  lane TEXT NOT NULL,
  type TEXT NOT NULL,
  source TEXT NOT NULL,
  ref TEXT,
  title TEXT,
  excerpt TEXT,
  reason TEXT,
  freshness TEXT,
  confidence REAL,
  rank REAL,
  budget_tokens_estimate INTEGER,
  tool TEXT,
  query TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(context_pack_id) REFERENCES context_packs(context_pack_id)
);

CREATE TABLE refs (
  ref_id TEXT PRIMARY KEY,
  project_id TEXT,
  from_type TEXT NOT NULL,
  from_id TEXT NOT NULL,
  to_type TEXT NOT NULL,
  to_id TEXT NOT NULL,
  label TEXT,
  evidence_ref TEXT,
  confidence REAL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE INDEX idx_refs_from ON refs(from_type, from_id);
CREATE INDEX idx_refs_to ON refs(to_type, to_id);

CREATE TABLE quality_gate_results (
  gate_result_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  task_id TEXT,
  run_id TEXT,
  gate_name TEXT NOT NULL,
  command TEXT NOT NULL,
  working_directory TEXT NOT NULL,
  status TEXT NOT NULL,
  exit_code INTEGER,
  stdout_path TEXT,
  stderr_path TEXT,
  summary TEXT,
  started_at TEXT,
  ended_at TEXT,
  duration_ms INTEGER
);

CREATE TABLE policy_decisions (
  decision_id TEXT PRIMARY KEY,
  project_id TEXT,
  task_id TEXT,
  run_id TEXT,
  action TEXT NOT NULL,
  subject TEXT,
  requested_by TEXT,
  allowed INTEGER NOT NULL,
  reason TEXT,
  approval_required INTEGER NOT NULL,
  approved_by TEXT,
  approved_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE sync_records (
  sync_id TEXT PRIMARY KEY,
  integration TEXT NOT NULL,
  project_id TEXT,
  external_id TEXT,
  local_id TEXT,
  direction TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT,
  ended_at TEXT,
  error TEXT,
  payload_hash TEXT
);

CREATE TABLE health_checks (
  check_id TEXT PRIMARY KEY,
  capability TEXT NOT NULL,
  state TEXT NOT NULL,
  details TEXT,
  next_action TEXT,
  blocking INTEGER NOT NULL,
  checked_at TEXT NOT NULL
);
```

### 10.3 Event types

```text
project.added
project.updated
project.removed
project.doctor_checked

task.imported
task.created
task.updated
task.status_changed
task.linked_external
task.assigned_agent

run.created
run.started
run.heartbeat
run.event
run.blocked
run.cancel_requested
run.cancelled
run.failed
run.succeeded
run.review_required
run.completed

worktree.allocated
worktree.status_checked
worktree.cleanup_requested
worktree.cleaned
worktree.cleanup_blocked

context.build_requested
context.built
context.failed

artifact.attached
artifact.redacted
artifact.deleted

memory.search_performed
memory.entry_added
memory.entry_updated
memory.entry_marked_stale
memory.writeback_completed

code.search_performed
code.repo_map_generated
code.repomix_generated

quality_gate.started
quality_gate.completed

policy.requested
policy.approved
policy.denied

plane.import_started
plane.import_completed
plane.writeback_started
plane.writeback_completed
plane.sync_failed

doctor.started
doctor.completed

backup.created
backup.restored
export.created
```

---

## 11. CLI Specification

### 11.1 Global flags

```bash
fulcrum [command] [flags]

Global flags:
  --json
  --project <project>
  --task <task>
  --run <run>
  --local-only
  --config <path>
  --dry-run
  --yes
  --verbose
  --no-color
```

### 11.2 Setup commands

```bash
fulcrum setup preview
fulcrum setup apply
fulcrum doctor
fulcrum doctor --json
fulcrum repair
fulcrum uninstall
```

### 11.3 Project commands

```bash
fulcrum project add <repo_path> --name <name>
fulcrum project list
fulcrum project show <project>
fulcrum project doctor <project>
fulcrum project config <project>
```

### 11.4 Plane commands

```bash
fulcrum plane connect
fulcrum plane doctor
fulcrum plane import
fulcrum plane sync
fulcrum plane link-task <task_id> <plane_work_item_id>
fulcrum plane writeback <run_id>
```

### 11.5 Task commands

```bash
fulcrum task list
fulcrum task show <task_id>
fulcrum task create "<title>"
fulcrum task claim <task_id>
fulcrum task status <task_id> <status>
fulcrum task assign <task_id> --agent <agent>
```

### 11.6 Context commands

```bash
fulcrum context build <task_id>
fulcrum context show <context_pack_id>
fulcrum context explain <context_pack_id>
fulcrum context export <context_pack_id> --format markdown
```

### 11.7 Code commands

```bash
fulcrum code search <query>
fulcrum code files <pattern>
fulcrum code structural <pattern>
fulcrum code repomap refresh
fulcrum code repomap show
fulcrum code repomix build
fulcrum code repomix show
```

### 11.8 Memory commands

```bash
fulcrum memory search <query>
fulcrum memory add --file <path>
fulcrum memory writeback <run_id>
fulcrum memory stale <memory_id>
fulcrum memory open <memory_id>
```

### 11.9 Run commands

```bash
fulcrum run start <task_id> --agent <agent>
fulcrum run status <run_id>
fulcrum run tail <run_id>
fulcrum run cancel <run_id>
fulcrum run summarize <run_id>
fulcrum run complete <run_id>
```

### 11.10 Worktree commands

```bash
fulcrum worktree allocate <task_id>
fulcrum worktree status <worktree_id>
fulcrum worktree diff <worktree_id>
fulcrum worktree cleanup <worktree_id>
```

### 11.11 Quality gate commands

```bash
fulcrum gate list
fulcrum gate run <task_id> --gate fast
fulcrum gate run <task_id> --gate test
fulcrum gate run <task_id> --gate lint
fulcrum gate show <gate_result_id>
```

### 11.12 Artifact commands

```bash
fulcrum artifact list <run_id>
fulcrum artifact show <artifact_id>
fulcrum artifact attach <run_id> --type test_log --path <path>
```

### 11.13 Backup/export commands

```bash
fulcrum backup create
fulcrum backup list
fulcrum backup restore <backup_id>
fulcrum export --format jsonl
fulcrum rebuild projections
fulcrum rebuild memory-index
fulcrum rebuild code-cache
```

---

## 12. MCP Tool Specification

### 12.1 Tool: fulcrum_task_get

Input:

```json
{
  "task_id": "task_..."
}
```

Output:

```json
{
  "task": {
    "task_id": "...",
    "title": "...",
    "description": "...",
    "status": "...",
    "project_id": "...",
    "external": {
      "source": "plane",
      "id": "..."
    }
  }
}
```

### 12.2 Tool: fulcrum_context_build

Input:

```json
{
  "task_id": "task_...",
  "budget_tokens": 24000,
  "lanes": ["task", "memory", "exact_code", "repo_map", "quality_gate"],
  "include_repomix": false
}
```

Output:

```json
{
  "context_pack_id": "ctx_...",
  "markdown_path": "...",
  "json_path": "...",
  "summary": "...",
  "degraded_lanes": []
}
```

### 12.3 Tool: fulcrum_code_search

Input:

```json
{
  "project_id": "proj_...",
  "query": "refreshSession",
  "mode": "exact",
  "limit": 20
}
```

Output:

```json
{
  "results": [
    {
      "file": "src/auth/session.ts",
      "line": 42,
      "match": "function refreshSession(...)",
      "reason": "exact identifier match",
      "tool": "ripgrep"
    }
  ]
}
```

### 12.4 Tool: fulcrum_quality_gate_run

Input:

```json
{
  "run_id": "run_...",
  "gate": "fast"
}
```

Output:

```json
{
  "gate_result_id": "gate_...",
  "status": "passed",
  "duration_ms": 12345,
  "summary": "cargo check passed"
}
```

### 12.5 Tool: fulcrum_artifact_attach

Input:

```json
{
  "run_id": "run_...",
  "type": "test_log",
  "path": "/tmp/test.log",
  "summary": "Targeted tests passed"
}
```

Output:

```json
{
  "artifact_id": "art_...",
  "status": "attached"
}
```

### 12.6 Tool: fulcrum_policy_check

Input:

```json
{
  "action": "worktree.cleanup",
  "subject": "wt_...",
  "run_id": "run_..."
}
```

Output:

```json
{
  "allowed": false,
  "approval_required": true,
  "reason": "Worktree has untracked files"
}
```

---

## 13. Context Pack Format

### 13.1 Markdown output

```md
# Fulcrum Context Pack

Context Pack: ctx_2026_04_24_001
Task: PLANE-123 / task_abc
Project: myapp
Generated: 2026-04-24T14:00:00+02:00
Budget: 24000 tokens
Privacy: local_only

## Operator Instruction

You are working in an isolated git worktree.
Do not delete user changes.
Before final response, run required quality gates or explain why they could not run.

## Task

Title: Fix billing refresh logout bug

Description:
...

## Relevant Plane Context

Source: Plane work item PLANE-123
Reason: task source

...

## Relevant Memory

### mem_2026_04_24_auth_refresh

Reason: linked to Plane issue and exact query match
Freshness: fresh
Files: src/auth/session.ts, src/billing/page.tsx

...

## Exact Code Evidence

### src/auth/session.ts:42

Tool: ripgrep
Query: refreshSession
Reason: exact identifier match

...

## Structural Evidence

Tool: ast-grep
Pattern: ...
Reason: ...

## Repo Map

Tool: aider
Generated: ...
Reason: architecture orientation

...

## Quality Gates

Required:
- cargo check --workspace
- cargo test {{targeted}}
- cargo clippy --workspace --all-targets -- -D warnings
- cargo fmt --check

## Known Constraints

- LSP disabled for this project.
- Do not use Repomix unless task requires broad architecture context.

## Required Writeback

At end of run, produce:
- summary
- files changed
- tests run
- failures
- suggested memory update
```

### 13.2 JSON output

```json
{
  "context_pack_id": "ctx_...",
  "task_id": "task_...",
  "project_id": "proj_...",
  "created_at": "...",
  "budget_tokens": 24000,
  "privacy": "local_only",
  "lanes": [
    {
      "name": "memory",
      "status": "ok",
      "items": []
    }
  ],
  "omissions": [],
  "degraded_lanes": [],
  "required_quality_gates": []
}
```

---

## 14. Agent Prompt Contract

### 14.1 Standard agent run prompt

```text
You are running under Fulcrum.

Task:
{{task_title}}

Context pack:
{{context_pack_path}}

Rules:
1. Work only in the assigned worktree:
   {{worktree_path}}

2. Search before editing.
3. Prefer minimal diffs.
4. Do not delete or overwrite user changes.
5. Use existing project patterns.
6. Run required quality gates or explain why they could not run.
7. Attach useful artifacts through Fulcrum when available.
8. At the end, produce:
   - summary
   - files changed
   - tests/quality gates run
   - remaining risks
   - recommended memory update
```

### 14.2 Agent final response schema

Agents should be encouraged to output:

```json
{
  "summary": "...",
  "files_changed": [
    "src/auth/session.ts"
  ],
  "commands_run": [
    {
      "command": "cargo check --workspace",
      "status": "passed"
    }
  ],
  "artifacts": [
    {
      "type": "test_log",
      "path": "..."
    }
  ],
  "memory_update_recommendation": {
    "should_update": true,
    "target_file": "decisions.md",
    "content": "..."
  },
  "risks": [],
  "next_steps": []
}
```

---

## 15. Configuration

### 15.1 Global config

```yaml
version: 1

paths:
  state_dir: "~/.fulcrum"
  worktree_dir: "~/.fulcrum/worktrees"
  artifact_dir: "~/.fulcrum/artifacts"
  memory_dir: "~/.fulcrum/memory"

privacy:
  default_mode: "local_only"
  allow_remote_pm: true
  allow_remote_models: false
  allow_remote_observability: false

pm:
  provider: "plane"
  plane:
    base_url: "http://localhost:3000"
    api_key_env: "PLANE_API_KEY"

memory:
  provider: "memsearch"
  markdown_root: "~/.fulcrum/memory"
  fallback_provider: "grep"
  allow_vector_backend: true

code_tools:
  rg:
    enabled: true
    command: "rg"
  fd:
    enabled: true
    command: "fd"
  ast_grep:
    enabled: true
    command: "ast-grep"
  aider:
    enabled: true
    command: "aider"
    repo_map_args: ["--show-repo-map"]
  repomix:
    enabled: true
    command: "repomix"
    mode: "on_demand"
  lsp:
    enabled: false

worktrees:
  branch_template: "fulcrum/{task_key}-{slug}"
  path_template: "{worktree_dir}/{project_slug}/{task_key}-{slug}"
  cleanup_requires_confirmation: true

agents:
  claude:
    command: "claude"
    enabled: true
  codex:
    command: "codex"
    enabled: true
  gemini:
    command: "gemini"
    enabled: true
  opencode:
    command: "opencode"
    enabled: true
  copilot:
    command: "gh copilot"
    enabled: false
  aider:
    command: "aider"
    enabled: true
  goose:
    command: "goose"
    enabled: false
  openhands:
    command: "openhands"
    enabled: false
  plandex:
    command: "plandex"
    enabled: false

policy:
  require_approval:
    - "worktree.cleanup"
    - "git.merge"
    - "git.reset"
    - "memory.delete"
    - "plane.writeback"
    - "shell.arbitrary"
```

### 15.2 Project config

```yaml
version: 1

project:
  slug: "myapp"
  name: "My App"
  repo_path: "/Users/me/code/myapp"
  default_branch: "main"

plane:
  workspace_id: "..."
  project_id: "..."

memory:
  path: "~/.fulcrum/memory/projects/myapp"
  files:
    - session.md
    - decisions.md
    - gotchas.md
    - codemap.md
    - procedures.md
    - lessons.md

code:
  lsp:
    enabled: false
    reason: "Rust workspace uses too much memory with rust-analyzer"
  repomix:
    enabled: true
    mode: "on_demand"
    ignore_files:
      - ".gitignore"
      - ".fulcrumignore"
      - ".repomixignore"
  aider_repo_map:
    enabled: true
    refresh: "on_context_build_if_stale"
  semantic:
    enabled: false

quality_gates:
  fast:
    commands:
      - name: "cargo check"
        cmd: "cargo check --workspace"
        timeout_seconds: 600
  test:
    commands:
      - name: "cargo test"
        cmd: "cargo test"
        timeout_seconds: 1200
  lint:
    commands:
      - name: "cargo clippy"
        cmd: "cargo clippy --workspace --all-targets -- -D warnings"
        timeout_seconds: 1200
  format:
    commands:
      - name: "cargo fmt"
        cmd: "cargo fmt --check"
        timeout_seconds: 120

context:
  default_budget_tokens: 24000
  lanes:
    task: true
    plane: true
    memory: true
    exact_code: true
    structural_code: true
    repo_map: true
    repomix: false
    quality_gates: true
```

---

## 16. User Stories

### 16.1 Human operator stories

US-H-001:
As an operator, I want to connect Fulcrum to Plane so that I can use Plane as my planning cockpit without building a custom PM UI.

Acceptance:

* `fulcrum plane connect` works.
* `fulcrum plane import` imports projects/tasks.
* Fulcrum can show linked Plane IDs.

US-H-002:
As an operator, I want to see all local runs so that I know what agents are doing.

Acceptance:

* `fulcrum run status` lists running/blocked/failed/completed runs.
* Each run has agent, task, worktree, start time, status.

US-H-003:
As an operator, I want each agent run in a separate worktree so that agents do not trample my main working directory.

Acceptance:

* Fulcrum creates git worktree.
* Branch name is predictable.
* Run prompt includes worktree path.
* Cleanup is blocked if dirty/untracked files exist.

US-H-004:
As an operator, I want context packs to include memory, code evidence, and task details so that agents do not start from zero.

Acceptance:

* Context pack includes Plane task.
* Context pack includes memory results.
* Context pack includes code search results.
* Context pack includes Aider repo map excerpt when enabled.

US-H-005:
As an operator, I want to avoid maintaining graph DBs unless they add proven value.

Acceptance:

* Fulcrum v0 uses refs/frontmatter.
* No graph database is required.
* Memory-to-file links work through markdown and refs.

US-H-006:
As an operator, I want quality gates to be the source of correctness instead of LSP.

Acceptance:

* Project config can disable LSP.
* Context pack mentions LSP disabled.
* Required quality gates are presented to agent.
* Gate outputs are recorded.

US-H-007:
As an operator, I want the agent’s result written back to Plane.

Acceptance:

* Run summary can be posted to linked Plane issue.
* Writeback is previewed or policy-approved.
* Large logs are not dumped by default.

US-H-008:
As an operator, I want useful memory updated after a run.

Acceptance:

* Fulcrum proposes memory update.
* Operator can approve.
* Memory file gets structured frontmatter.
* Memory is searchable later.

US-H-009:
As an operator, I want doctor to tell me what is installed and what is broken.

Acceptance:

* Doctor checks Plane, memory, tools, agents, worktree, quality gates.
* Doctor includes exact next action.
* Doctor supports JSON.

US-H-010:
As an operator, I want no hidden network calls.

Acceptance:

* Privacy status visible.
* Remote services marked enabled/disabled.
* `--local-only` blocks remote actions.

### 16.2 Agent user stories

US-A-001:
As an agent, I want to fetch my task details through Fulcrum MCP so that I know what I am assigned to do.

Acceptance:

* `fulcrum_task_get` returns task data.
* Response includes external Plane source when linked.

US-A-002:
As an agent, I want to build or receive a context pack so that I have relevant memory and code evidence.

Acceptance:

* `fulcrum_context_build` returns context path.
* Context includes evidence and reasons.

US-A-003:
As an agent, I want to search memory so that I can reuse previous decisions and gotchas.

Acceptance:

* `fulcrum_memory_search` returns entries with refs and freshness.

US-A-004:
As an agent, I want to search code exactly and structurally so that I can find files without relying on LSP.

Acceptance:

* `fulcrum_code_search` supports exact mode.
* Structural search mode uses ast-grep if available.
* Results include tool and reason.

US-A-005:
As an agent, I want to emit heartbeat/progress so that the operator sees I am alive.

Acceptance:

* `fulcrum_run_heartbeat` updates run.
* Events show in tail/status.

US-A-006:
As an agent, I want to run quality gates through Fulcrum so that results are attached to the run.

Acceptance:

* `fulcrum_quality_gate_run` starts gate.
* Result is stored and linked.

US-A-007:
As an agent, I want to attach artifacts so that the operator can review what I produced.

Acceptance:

* `fulcrum_artifact_attach` stores metadata.
* Artifact appears in run status.

US-A-008:
As an agent, I want policy checks before dangerous actions.

Acceptance:

* `fulcrum_policy_check` returns allowed/denied.
* Destructive commands are blocked without approval.

---

## 17. Core Workflows

### 17.1 Setup workflow

```text
operator runs:
  fulcrum setup preview

Fulcrum checks:
  state dir
  SQLite
  Plane config
  memory backend
  code tools
  agents
  git
  worktree base
  quality gates

operator runs:
  fulcrum setup apply

Fulcrum creates:
  ~/.fulcrum/
  db
  config
  logs
  artifacts
  memory dirs
```

### 17.2 Plane-to-agent workflow

```text
1. Plane work item exists.
2. Operator runs:
   fulcrum plane import
3. Operator selects:
   fulcrum task show PLANE-123
4. Operator builds context:
   fulcrum context build PLANE-123
5. Operator starts run:
   fulcrum run start PLANE-123 --agent claude
6. Fulcrum allocates worktree.
7. Fulcrum generates run prompt.
8. Agent works in worktree.
9. Agent emits events / logs captured.
10. Agent runs quality gates.
11. Fulcrum captures diff/artifacts.
12. Operator reviews.
13. Fulcrum writes summary back to Plane.
14. Fulcrum writes approved memory update.
```

### 17.3 Local-only workflow

```text
1. Operator creates local task:
   fulcrum task create "Fix parser bug" --project parser
2. Fulcrum uses local markdown memory and code tools only.
3. No Plane call occurs.
4. Agent works in worktree.
5. Results remain local.
```

### 17.4 Memory writeback workflow

```text
1. Run completes.
2. Agent suggests memory update.
3. Fulcrum stores suggestion as draft.
4. Operator reviews:
   fulcrum memory review run_123
5. Operator approves.
6. Fulcrum writes markdown with frontmatter.
7. memsearch/Engram index refreshes.
```

### 17.5 Worktree cleanup workflow

```text
1. Operator requests cleanup.
2. Fulcrum runs git status.
3. Fulcrum checks artifacts and run status.
4. If dirty/untracked/unmerged:
   cleanup blocked.
5. If clean and approved:
   git worktree remove.
6. Fulcrum records cleanup event.
```

---

## 18. UI/TUI Requirements

### 18.1 v0 surfaces

Fulcrum shall provide:

* CLI;
* JSON output;
* MCP server.

### 18.2 v1 surfaces

Fulcrum should provide TUI.

TUI views:

```text
Dashboard
Projects
Tasks
Runs
Worktrees
Artifacts
Context Packs
Quality Gates
Doctor
Event Stream
```

### 18.3 Plane as cockpit

Plane remains the human PM cockpit.

Fulcrum should not duplicate:

* full Kanban board;
* cycles/modules UI;
* docs editor;
* triage inbox.

Fulcrum can add links or writebacks to Plane.

---

## 19. Observability

### 19.1 Local default

Fulcrum shall write local logs:

```text
~/.fulcrum/logs/fulcrum.log
~/.fulcrum/logs/events.jsonl
~/.fulcrum/artifacts/{project}/{task}/{run}/stdout.log
~/.fulcrum/artifacts/{project}/{task}/{run}/stderr.log
```

### 19.2 Optional telemetry

Optional backends:

* OpenTelemetry for vendor-neutral traces/logs/metrics.
* Langfuse for LLM trace/eval workflows.
* Helicone for LLM observability/gateway workflows.

These must be disabled by default.

### 19.3 Run trace fields

Each run trace should include:

* run ID;
* task ID;
* agent;
* command;
* context pack;
* worktree;
* event timeline;
* quality gates;
* artifacts;
* writeback status.

---

## 20. Security and Privacy Requirements

### 20.1 Secret handling

Fulcrum shall support redaction patterns:

```yaml
redaction:
  patterns:
    - name: "api_key"
      regex: "(?i)(api[_-]?key\\s*=\\s*)[A-Za-z0-9_\\-]+"
    - name: "bearer_token"
      regex: "Bearer\\s+[A-Za-z0-9._\\-]+"
```

### 20.2 Ignore rules

Fulcrum shall respect:

```text
.gitignore
.ignore
.fulcrumignore
.repomixignore
```

Default ignore additions:

```text
.env
.env.*
*.pem
*.key
node_modules/
target/
dist/
build/
.git/
```

### 20.3 MCP safety

Fulcrum shall treat MCP as powerful but risky.

Controls:

* loopback/stdio by default;
* no public bind unless explicit;
* command allowlist;
* dangerous tool approval;
* redacted logs;
* per-agent tool permissions;
* MCP doctor warnings.

### 20.4 Remote status

Fulcrum shall show remote status:

```text
Plane: enabled / remote URL
Model provider: agent-dependent / unknown
Memory backend: local
Observability: disabled
Telemetry: disabled
```

---

## 21. Release Plan

### 21.1 Local Alpha

Goal:
Basic local control layer.

Must include:

* SQLite state;
* project registry;
* local tasks;
* run lifecycle;
* git worktree allocation;
* artifact/log capture;
* doctor;
* JSON output.

Must not include:

* custom graph DB;
* custom PM UI;
* custom vector DB.

### 21.2 Useful Alpha

Goal:
Real work loop with Plane and memory.

Must include:

* Plane import/link/writeback;
* memsearch integration;
* markdown memory;
* code context with rg/fd/ast-grep;
* Aider repo map;
* Repomix on demand;
* quality gates;
* context pack builder;
* Claude/Codex/Gemini/OpenCode wrapper support.

### 21.3 Agent Beta

Goal:
Multi-agent operation and MCP.

Must include:

* Fulcrum MCP server;
* Claude hooks integration;
* Codex MCP config guide;
* Gemini MCP config guide;
* OpenCode MCP config guide;
* Copilot custom agent/MCP guide;
* agent roles;
* run heartbeat;
* review queue.

### 21.4 Delivery Beta

Goal:
Safe local delivery.

Must include:

* diff review;
* cleanup safety;
* merge queue local;
* quality gate enforcement;
* Plane status writeback;
* memory writeback approval.

### 21.5 Release Candidate

Goal:
Reliability and recovery.

Must include:

* backup/restore;
* export/import;
* rebuild projections;
* rebuild memory index;
* privacy audit;
* secret redaction tests;
* installer/uninstaller;
* documentation;
* integration test suite.

---

## 22. Validation Plan

### 22.1 Test categories

```text
unit
integration
end_to_end
doctor
backup_restore
privacy
security_policy
agent_wrapper
plane_sync
memory_index
code_context
worktree_safety
quality_gate
```

### 22.2 Required E2E tests

E2E-001:
Clean install.

E2E-002:
Add local project.

E2E-003:
Import Plane issue.

E2E-004:
Build context with memory and code evidence.

E2E-005:
Allocate worktree.

E2E-006:
Run mock agent.

E2E-007:
Capture artifact.

E2E-008:
Run quality gate.

E2E-009:
Write summary back to Plane mock.

E2E-010:
Approve memory writeback.

E2E-011:
Block unsafe worktree cleanup.

E2E-012:
Backup and restore.

E2E-013:
Local-only mode makes no remote calls.

E2E-014:
Secret redaction removes configured token.

E2E-015:
Doctor reports missing tools with exact next action.

### 22.3 Mock agent

Fulcrum should include a mock agent for tests.

Mock agent behavior:

```text
read prompt
write fake file
emit heartbeat
emit summary
exit 0 or configured failure
```

### 22.4 Mock Plane

Fulcrum should use a mock Plane adapter for tests.

Mock Plane supports:

* projects;
* work items;
* comments;
* status updates;
* failure simulation.

---

## 23. Acceptance Criteria

### 23.1 Product acceptance

Fulcrum is acceptable when:

* operator can use Plane as PM cockpit;
* Fulcrum imports tasks;
* Fulcrum builds cited/explainable context;
* Fulcrum launches at least two different CLI agents through wrapper;
* Fulcrum allocates isolated worktrees;
* Fulcrum captures outputs/artifacts;
* Fulcrum runs quality gates;
* Fulcrum writes summary back to Plane;
* Fulcrum writes approved memory to markdown;
* Fulcrum works without graph DB;
* Fulcrum works without LSP;
* Fulcrum doctor clearly reports health.

### 23.2 Technical acceptance

Fulcrum is technically acceptable when:

* SQLite event/projection state survives restart;
* invalid transitions are rejected;
* one run cannot have multiple terminal states;
* derived caches are rebuildable;
* backup/restore works;
* local-only mode blocks remote actions;
* cleanup cannot delete dirty worktrees silently;
* context pack includes provenance.

---

## 24. Risk Register

### RISK-001: Plane is too heavy

Mitigation:

* keep Fulcrum independent;
* support Taskwarrior/local-only mode;
* do not make Plane required for core local run state.

### RISK-002: memsearch is newer than desired

Mitigation:

* markdown remains source of truth;
* support Engram fallback;
* support grep fallback;
* do not make vector index canonical.

### RISK-003: MCP creates security exposure

Mitigation:

* loopback/stdio default;
* policy gate dangerous tools;
* allowlist tools;
* log all calls;
* never expose public network by default.

### RISK-004: Agents ignore instructions

Mitigation:

* context pack includes explicit run contract;
* quality gates verify;
* hooks/wrappers capture state;
* final response schema;
* operator review queue.

### RISK-005: LSP disabled reduces code intelligence

Mitigation:

* use rg/fd/ast-grep/Aider/Repomix;
* enable LSP per project only if useful;
* rely on tests and build.

### RISK-006: Repomix leaks secrets

Mitigation:

* enforce ignore files;
* redaction;
* preview included files;
* local-only path;
* require confirmation for broad packs.

### RISK-007: Worktree cleanup deletes valuable work

Mitigation:

* explicit cleanup policy;
* dirty/untracked/unmerged checks;
* backup artifacts;
* confirmation.

### RISK-008: Too many tools cause choice paralysis

Mitigation:

* provide default stack;
* doctor reports only actionable missing items;
* optional tools disabled by default;
* project templates.

---

## 25. Open Questions

OQ-001:
Should Fulcrum manage Plane self-hosting through process-compose, or only connect to an existing Plane instance?

Recommendation:
Start by connecting to existing Plane. Add process-compose template later.

OQ-002:
Should memsearch or Engram be default?

Recommendation:
Default memsearch for markdown-first cross-agent memory. Provide Engram profile for no-vector/simple local setup.

OQ-003:
Should Aider be used only for repo maps or also as worker agent?

Recommendation:
Use as repo map provider by default. Enable as worker optionally.

OQ-004:
Should Fulcrum implement a TUI in v0?

Recommendation:
No. CLI + Plane first. Add TUI after run/worktree/context loop works.

OQ-005:
Should Fulcrum support semantic code search in v0?

Recommendation:
No custom semantic code index in v0. Use memory search and optional Repomix/Aider. Add semantic code backend only if exact/structural search fails real workflows.

OQ-006:
Should graph DB ever be added?

Recommendation:
Only after three or more important queries cannot be solved with refs/frontmatter/search.

---

## 26. Implementation Plan

### Phase 0: Prototype

Build:

* SQLite DB;
* project add;
* task create/list/show;
* run create/start/complete;
* worktree allocate;
* logs/artifacts;
* doctor basic.

Do not integrate Plane yet.

### Phase 1: Code context

Add:

* rg search;
* fd search;
* ast-grep search;
* Aider repo map refresh/show;
* Repomix on-demand pack;
* context pack builder v0.

### Phase 2: Memory

Add:

* markdown memory directory;
* memsearch integration;
* grep fallback;
* memory search;
* memory writeback draft.

### Phase 3: Plane

Add:

* Plane connect;
* import projects/work items;
* link tasks;
* writeback comments;
* status mapping.

### Phase 4: Agent wrappers

Add:

* generic shell agent;
* Claude wrapper;
* Codex wrapper;
* Gemini wrapper;
* OpenCode wrapper;
* Aider wrapper;
* Copilot wrapper if feasible.

### Phase 5: MCP

Add Fulcrum MCP server.

Expose:

* task get;
* context build;
* memory search;
* code search;
* run event;
* artifact attach;
* quality gate run;
* policy check.

### Phase 6: Quality gates

Add:

* project quality gate config;
* gate runner;
* artifact capture;
* required gate enforcement.

### Phase 7: Safe delivery

Add:

* diff review;
* cleanup safety;
* merge queue local;
* writeback gates.

### Phase 8: Recovery

Add:

* backup;
* restore;
* export;
* rebuild projections;
* rebuild caches.

---

## 27. Example Fulcrum Run

```bash
# Import Plane work
fulcrum plane import --project myapp

# Inspect task
fulcrum task show PLANE-123

# Build context
fulcrum context build PLANE-123 --budget 24000

# Start Claude in an isolated worktree
fulcrum run start PLANE-123 --agent claude

# Check status
fulcrum run status run_abc

# Tail logs
fulcrum run tail run_abc

# Run quality gates
fulcrum gate run PLANE-123 --gate fast
fulcrum gate run PLANE-123 --gate test

# Review diff
fulcrum worktree diff wt_abc

# Write back to Plane
fulcrum plane writeback run_abc

# Approve memory update
fulcrum memory writeback run_abc --approve

# Cleanup only if safe
fulcrum worktree cleanup wt_abc
```

---

## 28. Example Plane Writeback

```md
Fulcrum run completed.

Task:
PLANE-123 Fix billing refresh logout bug

Agent:
claude

Worktree:
fulcrum/PLANE-123-fix-billing-refresh-logout

Summary:
- Fixed session refresh handling so transient 401s do not clear user session.
- Added targeted regression test for billing page refresh.

Files changed:
- src/auth/session.ts
- src/auth/session.test.ts

Quality gates:
- cargo check --workspace: passed
- cargo test session_refresh: passed
- cargo fmt --check: passed

Artifacts:
- Fulcrum run: run_2026_04_24_001
- Context pack: ctx_2026_04_24_001
- Test log: art_...

Memory:
- Proposed update added to decisions.md as draft.

Risks:
- Full test suite not run.
```

---

## 29. Example AGENTS.md

```md
# AGENTS.md

## Fulcrum

This repository is managed by Fulcrum.

Before major work:
1. Read the Fulcrum context pack if provided.
2. Search before editing.
3. Work only in the assigned worktree.
4. Prefer minimal diffs.
5. Run required quality gates.

Do not:
- delete user changes;
- clean untracked files;
- modify generated files unless instructed;
- post remote writebacks unless Fulcrum asks.

Quality gates:
- See `.fulcrum/project.yaml`.

Memory:
- Durable memory lives in `.fulcrum/memory` or the configured Fulcrum memory directory.
```

---

## 30. Example Memory Files

### session.md

```md
# Session Memory

## Current Objective

## Last Known State

## Recent Runs

## Next Step
```

### decisions.md

```md
# Decisions

## 2026-04-24 — Use quality gates over always-on LSP

Decision:
- LSP is disabled by default for this Rust workspace.
- Correctness checks use cargo check/test/clippy/fmt.

Reason:
- rust-analyzer can be memory-heavy.
- Agents need proof from build/test output.

Linked:
- Project: myapp
- Files: Cargo.toml
```

### gotchas.md

```md
# Gotchas

- Do not run full Repomix pack without previewing ignored files.
- Worktree cleanup must be blocked if untracked files exist.
```

### codemap.md

```md
# Code Map

## Auth

Files:
- src/auth/session.ts
- src/auth/provider.ts

Common searches:
- `rg "refreshSession|session token|logout" src`
- `ast-grep -p 'async fn $NAME($$$ARGS) -> $RET { $$$BODY }' src`
```

---

## 31. Minimal MVP Definition

The smallest useful Fulcrum is:

```text
Plane import/link
+ SQLite run state
+ git worktree allocation
+ context pack from Plane + markdown memory + rg/fd + Aider repo map
+ agent wrapper
+ quality gate runner
+ artifact/log capture
+ Plane writeback
+ memory writeback draft
+ doctor
```

Anything else is optional.

Not required for MVP:

```text
custom PM UI
graph DB
custom vector DB
always-on LSP
semantic code index
hosted service
team support
plugin marketplace
PDF/Office parsing
```

---

## 32. Final Recommendation

Build Fulcrum as a thin integration/control layer.

Default architecture:

```text
Plane:
  human PM cockpit

Fulcrum:
  local execution truth, run tracking, worktrees, context packs, artifacts, doctor

memsearch:
  markdown-first cross-agent memory

rg/fd/ast-grep:
  exact and structural code search

Aider:
  repo map provider and optional worker agent

Repomix:
  on-demand broad repo packaging

Quality gates:
  correctness proof

git worktree:
  safe isolated delivery

MCP + wrappers:
  common agent interface
```

Avoid custom graph/RAG/code-intelligence systems until the simple composed stack fails real workflows.

The product should optimize for:

* operator control;
* low custom code;
* local-first state;
* explainable context;
* safe worktree delivery;
* quality gates;
* cross-agent memory;
* Plane-powered cockpit.

### References

[1]: https://github.com/makeplane/plane?utm_source=chatgpt.com "makeplane/plane: 🔥🔥🔥 Open-source Jira, Linear ..."
[2]: https://github.com/zilliztech/memsearch?utm_source=chatgpt.com "zilliztech/memsearch: A Markdown-first memory ..."
[3]: https://aider.chat/docs/repomap.html?utm_source=chatgpt.com "Repository map"
[4]: https://modelcontextprotocol.io/docs/getting-started/intro?utm_source=chatgpt.com "What is the Model Context Protocol (MCP)?"
