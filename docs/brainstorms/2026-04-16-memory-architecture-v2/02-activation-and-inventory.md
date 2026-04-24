---
date: 2026-04-16
topic: memory-architecture-v2
part: "02"
title: Activation Model & Complete Inventory
index: index.md
prev: 01-problem-and-philosophy.md
next: 03-write-and-recall-paths.md
---

# Memory Architecture v2 — 02 — Activation Model & Complete Inventory

**[← Index](index.md)** · **[← Prev: Problem & Philosophy](01-problem-and-philosophy.md)** · **[Next: Write & Recall Paths →](03-write-and-recall-paths.md)**

### Control-plane unification — all Fulcrum entities are knowledge nodes

The user mandate: "our other modules for project management and orchestration and memories and data related to them all tie in to make a super knowledge that the agent can easily access and understand and work with." This is the core reframe that distinguishes v2 from "memory system" or "code search" alone.

**Fulcrum's existing schema (`packages/core/src/db/schema.ts`, 51 tables) already carries the substrate.** Nothing new needs to be invented — the work is wiring it into one queryable graph and exposing it via MCP. Existing tables grouped by role:

- **Control plane (what is happening):** `workspaces`, `projects`, `tasks`, `agent_runs`, `handoffs`, `team_instances`, `team_templates`, `team_members`, `workflow_runs`, `agent_profiles`, `agent_definitions`, `agent_state_projection`.
- **Planning (what we intend):** `epics`, `issues`, `prds`, `plans`, `plan_issues`, `prd_plans`, `task_relations`, `task_labels`, `issue_labels`, `display_id_sequences`.
- **Artifacts (what was produced):** `artifacts`, `agentrun_artifacts`, `reviews`, `review_targets`, `worktrees`, `artifact_contracts`.
- **Memory (what we remember):** `memories`, `memory_entities`, `task_memory_links`, `artifact_memory_links`.
- **Code index (existing scaffolding):** `code_chunks`.
- **Graph (existing scaffolding):** `graph_entities`, `graph_edges`, `graph_episodes`.
- **Events (signal stream):** `events`, `run_events`, `hook_events`, `trace_events`.
- **Policy:** `policy_rules`, `policy_events`, `advisory_locks`.
- **Sync:** `sync_states`, `sync_conflicts`, `sync_queue`.
- **Analytics:** `analytics_daily`, `analytics_cycle`, `analytics_project`, `analytics_agent`, `analytics_team`.

**Unified knowledge graph.** Every row in the tables above is a candidate node in the Kuzu graph (§8.1). Every foreign-key relationship and cross-entity link table becomes a typed edge. The graph shape:

```
Workspace ──contains──► Project ──has──► { Task, Epic, PRD, Plan, Issue }
                                   │
                                   ├── tracks ──► AgentRun ──spawned──► AgentRun (subagent, parent_run_id)
                                   │                │
                                   │                ├── produced ──► Artifact, FilePatch, CodePatch
                                   │                ├── wrote ──► Memory { decision | task_outcome | ... }
                                   │                ├── dispatched ──► Handoff ──delivered──► AgentRun
                                   │                └── hit ──► HookEvent
                                   │
                                   ├── indexed ──► CodeFile ──contains──► CodeChunk ──defines/refs──► Symbol
                                   │
                                   └── triggered ──► TeamInstance ◄──instantiated_from── TeamTemplate
                                                        │
                                                        └── ran ──► WorkflowRun

Task ──blocks──► Task           Task ──assigned_to──► AgentRun
Task ──has_outcome──► Memory    Decision ──about──► { File, Function, Task }
Memory ──supersedes──► Memory   Memory ──mentions──► Entity (person | lib | API)
Artifact ──referenced_in──► Memory
Event ──concerns──► { Run, Task, Memory, File }
```

**Cross-entity agent queries this enables:**

- "What tasks touched `packages/auth/session.ts` in the last 2 weeks, and what decisions governed them?" — traverses `FilePatch →(edits)→ CodeFile ←(concerns)← HookEvent ←(produced)← AgentRun ←(assigned_to)← Task ←(about)← Decision`.
- "What team instance produced the PRD that led to this code, and who approved the plan?" — traverses `CodeChunk ←(delivered)← AgentRun ←(ran)← WorkflowRun ←(part_of)← TeamInstance →(executes)→ Plan →(documents)→ PRD →(reviewed_by)→ Review`.
- "Across all projects, what decisions have we made about JWT session rotation?" — `scope: 'global'` + kind filter on `Decision` nodes + FTS5 on body + semantic near "JWT session rotation".
- "What's the status of everything related to this Jira ticket?" — `Issue →(synced_to)→ external_ref` + `Task →(derived_from)→ Issue` + traversal of run / memory / artifact subgraph.

**New MCP tool: `project_context`** — returns a bundle for a root entity (task_id | run_id | file | symbol | pr_number | issue_id). Bundle shape: `{memories, code_chunks, tasks, runs, artifacts, handoffs, team_instances, workflow_runs, decisions, blockers, events}`, each scoped per §1.2 and filtered to the N most relevant (default 10) via RRF ranking across the graph.

Unlike `recall_memory` (returns memory rows) and `search_code` (returns code chunks), `project_context` returns a **cross-entity bundle** — the minimum the agent needs to understand a situation. This is the primary tool for agents orienting at the start of work, answering "where am I and what's going on?" once the user has spoken (never automatically — the agent calls it when it wants).

### Activation model — CLI-first; MCP is a selective, add-on-demand overlay

**Fulcrum is CLI-first** (per commit `231519a feat(cli): make Fulcrum CLI-first with selective MCP exposure`). Every action is reachable through `fulcrum action exec <name>`. Hooks shell out to the CLI. Skills teach agents to call the CLI via their native Bash tool. Rules evaluate inside the CLI action path. This is the primary interaction surface.

**MCP is available to add, not installed by default.** `fulcrum serve mcp` selectively exposes a subset of CLI actions as MCP tools, for agents that cannot use the CLI-first path (hooks + skills + rules via shell-out). When the target CLI agent supports hooks + skills + rules, MCP is optional — the user or agent *adds* it to their MCP config if they want structured tool calls, but the default interaction is CLI. When the target agent cannot use hooks / skills / rules via CLI, MCP becomes the installed path.

**Hard rule:** Fulcrum never auto-activates control-plane behavior. Task tracking, team orchestration, workflows, Pi cockpit, external sync, and most policy rules are **always shipped, always ready, always dormant**. All code, skills, rules, workflow definitions, and CLI actions ship with Fulcrum. Invocation is explicit: an agent running `fulcrum action exec <name>` via Bash, a user at the terminal, a hook firing `fulcrum hook <event>`, or — when CLI-first doesn't apply — an MCP tool call.

**Baseline (always-on, automatic, non-negotiable):**

- Memory writes via hooks (PostToolUse / PreCompact / Stop) — each hook shells out to the CLI per §1
- PCI watcher + incremental code/doc index (§5.5) — starts on first session in a project
- Sanitization on every write + WAL (§6, §5.6) — implemented in the CLI action path
- Context-type guards (§5) — enforced in the CLI action path
- Secret scanner policy rule — always enabled

**CLI action surface (always present — primary path):**

Every capability is reachable through `fulcrum action exec <name>`. Agents use these via their native Bash tool. Skills teach them which action to invoke when.

- `fulcrum action exec recall_memory / query_memory / search_code / code_context / project_context / write_memory`
- `fulcrum action exec create_task / update_task / list_tasks`
- `fulcrum action exec invoke_team / create_team_template / list_team_templates / list_team_instances`
- `fulcrum action exec run_workflow / list_workflows`
- `fulcrum action exec start_agent_run / heartbeat_agent_run / complete_agent_run / block_agent_run`
- `fulcrum action exec build_cos_context / get_workspace_status / get_current_context`
- `fulcrum action exec list_activations` (read-only)
- ...every action defined by the codebase.

**MCP surface (selective; add on demand):**

`fulcrum serve mcp --mode filtered` exposes a subset. `--profile software_engineer` or `--profile chief_of_staff` filters further to role-appropriate tools. The subset is **not pre-installed into every agent**. Agents that use CLI-first (Claude Code, Gemini, Codex, OpenCode, Pi all support this) don't need MCP by default; they use hooks + skills + `fulcrum action exec`. Agents that can't use CLI-first install the MCP server in their config.

MCP tool names mirror CLI action names for discoverability: `mcp__fulcrum__recall_memory` ↔ `fulcrum action exec recall_memory`. Planning §12.23 confirms exact filtered-mode contents and per-profile sets.

**Three invocation surfaces (all in-repo; always shipped):**

- **Skills** — markdown files in `agent-integration/skills/` + native host skill locations. Always present on disk. Agents read them when their situation matches and decide whether to follow. Skills teach agents to call `fulcrum action exec <name>` via Bash — **CLI-first methodology encoded in skill content**. No "install" step.
- **Rules** — rows in `policy_rules` with `enabled` boolean (default `0` except secret-scan `1`). Operators toggle. Evaluate inside the CLI action path. No agent-side activation.
- **Workflows** — YAML in `workflows/*.yaml`. Always loaded by the workflow engine. Discoverable via `fulcrum workflow list`. Invoked explicitly by user (`fulcrum workflow run <name>`) or by agent (`fulcrum action exec run_workflow --name X`). Never auto-start.

**Per-feature runtime table:**

| Feature | Primary path (CLI-first) | MCP fallback | Who triggers it |
|---|---|---|---|
| Memory writes via hooks | Hook → `fulcrum hook <event>` → CLI action path | n/a (hooks are a native host feature) | baseline automatic |
| PCI watcher + incremental index | Started by CLI on first `start_agent_run` in project | Started by MCP server on first connect | baseline automatic |
| Sanitization + WAL | CLI action path | Same (MCP is a thin veneer) | baseline automatic |
| Context-type refusal | CLI action path | Same | baseline automatic |
| Secret-scan policy rule | Hook → CLI action path | Same | baseline automatic |
| Recall: `recall_memory` / `query_memory` / `search_code` / `code_context` / `project_context` / `write_memory` | Agent calls `fulcrum action exec <name>` via Bash (CLI-first). Skill tells them when. | MCP tool when agent can't shell out | agent |
| Task tracking: `create_task` / `update_task` / `list_tasks` | `fulcrum action exec <name>` | MCP tool when added | agent |
| `task_outcome` / `blocker_resolution` synthesis | Automatic on `update_task(status=completed|blocked)` — regardless of whether agent used CLI or MCP to call it | Same | agent (indirect) |
| Team orchestration: `invoke_team` / `create_team_template` | `fulcrum action exec <name>` (role-gated to CoS) | MCP tool when added | agent with CoS role |
| Workflows: `run_workflow` / `list_workflows` | `fulcrum action exec <name>` or `fulcrum workflow run <name>` | MCP tool when added | agent or user |
| Pi cockpit process | `fulcrum pi cockpit start` — explicit user command | n/a (operator-only surface) | user / operator |
| Non-secret policy rules | Operator toggles `policy_rules.enabled`; evaluated inside CLI action path | n/a | operator |
| External sync push/pull | Rule enabled + credentials configured; runs via `fulcrum sync` | n/a | operator |
| Analytics rollups | Rule `analytics-enabled`; runs via scheduler | n/a | operator |

**Implications for sections above:**

- **§1.3 unified graph populates sparsely.** A baseline install has zero `task` / `team_instance` / `workflow_run` nodes — no agent has invoked the relevant actions. The graph works with any subset. Reducers check whether their source table has data, not whether a feature is "enabled."
- **§2 tool surface.** Actions listed there are primarily CLI actions (`fulcrum action exec <name>`) with matching MCP tool names for the selective MCP overlay. Agents using CLI-first call them via Bash; agents using MCP call them via the MCP protocol. Same domain function behind both.
- **§2.6 `project_context` graceful degradation.** Empty entity groups are absent from the response; agent doesn't know or care whether task tracking is "active" — only whether any row exists yet.
- **§7 task-lifecycle `task_outcome`** fires iff an agent called `update_task(status=completed)` through any path (CLI or MCP). Agent that never calls `update_task` produces only `session_summary` fallback memories.
- **§8.1 control-plane nodes** appear only when their source table has rows — data-driven, no feature-flag check.
- **Pi cockpit** (source inventory PR 14) is on disk as part of every install; `fulcrum pi cockpit start` spawns the process and binds its hooks.

**Agent experience from a cold install (CLI-first agent, e.g., Claude Code):**
- Hooks configured via `~/.claude/settings.json` call `fulcrum hook claude` on tool events.
- Skill files under `~/.claude/plugins/.../skills/` teach the agent when to run `fulcrum action exec <name>` via its Bash tool.
- No MCP server required; MCP is available to add but not installed by default.
- `fulcrum action exec list_tasks` returns `[]`. No error.
- `fulcrum action exec invoke_team` returns role-policy-denied unless agent role is CoS.
- `fulcrum action exec project_context --file X` returns `{memories: [...], code_chunks: [...]}` — no task / team groups if empty.
- Productive memory + code work with zero MCP install.

**Agent experience from a cold install (non-CLI-first agent):**
- Agent host doesn't support hooks + skills via CLI; MCP is installed as the interaction surface.
- User adds `fulcrum serve mcp --mode filtered` to the agent's MCP config.
- MCP surface exposes the filtered subset of CLI actions as MCP tools.
- Same underlying behavior (sanitize, WAL, graph reducer, etc.) — just through MCP protocol instead of Bash shell-out.

**Agent discovery (no special "activation list" needed):**
1. **Skills** the agent reads (always on disk) teach when to call which `fulcrum action exec <name>`.
2. **Action availability** is discoverable via `fulcrum action list` (always works) or — for MCP agents — the MCP tool list.
3. **Optional read-only introspection:** `fulcrum action exec list_activations` returns `{pi_cockpit, enabled_rules, available_workflows, indexed_projects}`. When MCP is installed, same info available as `mcp__fulcrum__list_activations`. No side effects.

### Complete inventory — every package, every table, every surface

This section accounts for all 51 tables in `packages/core/src/db/schema.ts` and all `fulcrum-*` packages. Each entry names the role in the unified substrate: node kind in the Kuzu graph, edges it participates in, actions that read/write it, or explicit "infrastructure — orthogonal to graph" with reason.

#### External sync (Plane / Jira / GitHub Issues / etc.)

Tables: `sync_states`, `sync_conflicts`, `sync_queue`. Owned by `fulcrum-sync`.

**Graph integration.** New node type `external_ref` carries `{system: 'plane'|'jira'|'github'|...', external_id, url, last_synced_at}`. Edges:
- `task →(shadow_of)→ external_ref` — Fulcrum task tracks a Plane ticket
- `issue →(shadow_of)→ external_ref` — local issue mirrors GitHub issue
- `external_ref →(in_conflict_with)→ external_ref` — via `sync_conflicts` when local + remote diverge
- `sync_queue_item` nodes are ephemeral (pruned after drain) — represent pending pushes/pulls

**Actions.** `fulcrum action exec sync_status` (read-only — queue depth + conflicts), `fulcrum action exec sync_resolve_conflict --conflict-id X --strategy local|remote|merge`. Writes flow through normal sync adapters; graph reducers fire on `sync_*` table changes.

**Agent query enabled.** `project_context(task_id: T)` includes external_ref in the `related` bundle when present. Agents working on Plane-tracked tasks see the ticket state without calling a separate sync API.

#### Git objects (commits, branches, PRs, tags)

Not a table yet — Fulcrum has `worktrees` + `artifacts` but no first-class git model. **Added.**

**Graph integration.** New node types: `git_commit`, `git_branch`, `git_pr`, `git_tag`. Edges:
- `file_patch →(landed_in)→ git_commit` — links a memory-recorded patch to the actual commit
- `git_commit →(on)→ git_branch`
- `git_pr →(includes)→ git_commit`
- `git_pr →(reviewed_by)→ review` — connects to existing `reviews` table
- `worktree →(points_at)→ git_branch`
- `artifact →(delivered_in)→ git_pr` — via PR artifacts (build outputs, review bundles)

**Population.** Via a new git-reducer running periodically or via git hook (post-commit / post-merge). Also backfillable on project registration: walk recent `git log`, populate the node set.

**Actions.** `fulcrum action exec git_pr_context --pr N` returns the full PR bundle (commits + files touched + reviews + discussions + linked tasks + decisions).

**Agent query enabled.** "Which PR delivered this code change?" traverses `CodeChunk ←(edits)← FilePatch →(landed_in)→ GitCommit →(part_of)→ GitPR`.

#### Agent executors / adapters

Package: `fulcrum-worker`. Adapter registry includes `stub`, `subprocess`, `claude-cli`, `gemini-cli`, `codex-cli`, `opencode`, `pi`. Currently not represented in graph.

**Graph integration.** New node type `agent_adapter` (small, finite set — one node per registered adapter). Edges:
- `agent_run →(executed_by)→ agent_adapter`
- `agent_adapter →(uses)→ agent_definition` — which canonical role + model + tools the adapter was configured with

**Population.** `agent_adapter` nodes created on `registerAgentAdapter()` call in `fulcrum-worker`; `executed_by` edges written when `start_agent_run` picks an adapter.

**Actions.** `fulcrum action exec list_adapters` (read-only), implicit in `project_context(run_id: R).related.adapter`.

**Agent query enabled.** "Did our Claude runs produce better memory signals than our Codex runs?" — analytics rollup joined on adapter identity.

#### Non-code prose ingestion in PCI

Currently ambiguous in v2 §5.5. **Made explicit:**

PCI ingests every text file under the project root that isn't gitignored, excluding binaries and files >1 MB. This includes: `README.md`, `AGENTS.md`, `CLAUDE.md`, `CHANGELOG.md`, `docs/**` (brainstorms, research, plans, audit, guides, specs, handover), in-repo markdown, `.cursorrules`, `.mcp.json`, `package.json`, `tsconfig.json`, YAML workflows, TOML configs.

**Chunking path selection** (`packages/memory/src/chunkers/`):
- Code files (ts / js / py / go / rs / java / c / cpp and family) → AST chunker (where supported) or regex-syntax fallback.
- Markdown files → **new markdown-aware chunker** that splits at heading boundaries, preserves frontmatter as metadata, extracts inline `[[wikilinks]]` (same parser as §1.0 short-term memory entries).
- Config / data files (json / toml / yaml) → sliding-window chunker with a 2x smaller window (these are structured; large windows aren't useful).
- Unknown / plain text → sliding-window chunker.

**Graph integration.** Prose chunks land in the existing `code_chunks` table with `kind='prose'` (already a value in §3.3c enum). `file` nodes carry `content_type: 'code' | 'prose' | 'config'`. Same path-index, same hybrid search.

**Agent query enabled.** `search_code(text: 'memory architecture', lang: ['md'])` surfaces `docs/brainstorms/*` content. `code_context(file: 'AGENTS.md')` returns the rules the project declares.

#### Monitor dashboard (`fulcrum-monitor`)

Package runs HTTP server on port 4721 exposing `/`, `/tasks`, `/runs`, `/memory/recall`, `/content-index` (§5.5.5). Not integrated with the unified graph.

**New endpoints.**
- `GET /graph/query?cypher=<q>` — read-only Cypher (or simple JSON traversal DSL) against Kuzu. Scope guards: must include `workspace_id` filter.
- `GET /graph/neighborhood/<node-id>?depth=2` — shortcut for visualization.
- `GET /project-context?file=X` — same as `project_context` action, HTTP surface for dashboard rendering.

**Visualization.** Dashboard adds a "Graph" tab that renders a force-directed view of the current project's knowledge graph (filtered to node kinds + scope). Useful for operators inspecting what Fulcrum knows.

**Access control (safe-fix #6, security-F3 + F11).** Monitor process MUST assert `127.0.0.1` binding at startup. If the configured bind address resolves to non-loopback AND no auth token is set, the process refuses to start with a clear error. Prevents accidental exposure on shared dev hosts, CI runners, or Codespaces. Any deployment that binds to non-loopback requires a bearer token on every endpoint. The `/graph/query?cypher=` endpoint is additionally restricted to a Cypher allowlist (read-only statements only; no `LOAD CSV`, no filesystem-touching `CALL` subqueries).

#### Chief-of-Staff context — computed view, not separate store

Files: `cos-context.ts`, `cos-parser.ts`. Build `build_cos_context` snapshot from tasks + runs + blockers + events.

**Framing.** Not a separate store — it's a **derived view** over the unified graph. The `build_cos_context` action runs a parameterized graph query that produces the snapshot markdown. Caching: 5-min TTL (existing), invalidated on relevant events (task status change, new block, new handoff).

**No new node kind.** CoS context is ephemeral output of a query, not data in its own right.

**Agent query enabled.** CoS role already calls this. v2 changes only the implementation path (graph query, not hand-joined SQL).

#### A2A agent cards

File: `a2a-card.ts`. Builds a Google A2A `AgentCard` from `agent_definitions`.

**Graph integration.** Derived from `agent_definition` nodes at query time — no separate `a2a_card` node. The `get_agent_card --role X` action renders the A2A-format JSON on demand.

**Cross-agent interop.** When Fulcrum publishes A2A cards (e.g., exposing Fulcrum agents to external A2A-aware consumers), the cards are snapshots of the current `agent_definitions` row. Changes to the definition automatically update the card output.

**Agent query enabled.** `fulcrum action exec list_agent_cards` returns all cards as JSON. External consumers hit the monitor endpoint `GET /a2a/cards/<role>` (new).

#### Policy events

Tables: `policy_rules` (node), `policy_events` (event stream). `policy_events` was missing from §8.1.

**Graph integration.** `policy_event` is an event node kind alongside `hook_event` / `trace_event`. Edges: `policy_event →(evaluated)→ policy_rule` + `policy_event →(decided_on)→ {tool_call | agent_run | team_invocation}`. Retention: same 7-day ephemeral window as other event nodes, unless referenced by an audit.

**Audit.** `fulcrum action exec policy_audit --from DATE --to DATE` returns a decision log. `project_context(run_id: R).related.policy_events` exposes why a run was allowed/denied each tool call.

#### Handoffs lifecycle

Table: `handoffs`. v2 had `handoff` as a node kind but didn't model the status transitions.

**Graph refinement.** Handoff carries `status: pending | delivered | accepted | rejected | reassigned`. Edges:
- `agent_run →(dispatched)→ handoff`
- `handoff →(delivered_to)→ agent_run`
- `handoff →(rejected_by)→ agent_run` (when rejection happens; see `rejected_at` column)
- `handoff →(superseded_by)→ handoff` (re-dispatch)

**Agent query enabled.** `project_context(run_id: R)` includes the full handoff chain a run participated in (received from + dispatched to).

#### Team members

Table: `team_members`. Join table between `agent_profiles` and `team_instances`.

**Graph integration.** Represented as an edge, not a node: `agent_profile →(member_of)→ team_instance` with properties `{role_slot, joined_at, left_at?}`. The reducer consumes `team_member_added` / `team_member_removed` events.

**Agent query enabled.** `project_context(team_instance_id: T).members` returns the member list with roles.

#### Artifact contracts

Table: `artifact_contracts`. Defines expected artifact shape (required fields, schema version).

**Graph integration.** New node kind `artifact_contract`. Edges:
- `artifact →(conforms_to)→ artifact_contract`
- `review →(checks)→ artifact_contract` — which contract a review is evaluating against

**Governance query.** "Which artifacts in this project conform to contract C, and which fail?" — graph traversal.

#### Notifications

File: `notify.ts`. Fire-and-forget desktop notifications for blocked runs. Currently audit-only via a single log file.

**Graph integration.** Minimal — one new node kind `notification_event`, retention same as other event nodes. Edge: `notification_event →(triggered_by)→ agent_run`. Ephemeral; pruned on Dreaming light phase after 7 days unless linked.

**No new action needed.** Notifications are system-emitted; no agent query path required.

#### Analytics rollups

Tables: `analytics_daily`, `analytics_cycle`, `analytics_project`, `analytics_agent`, `analytics_team`. Owned by whichever package runs the rollup job.

**Graph integration.** **None direct.** Analytics rows are denormalized summaries, not identity-bearing entities. Keeping them out of the graph prevents bloat.

**Access.** New read-only action `fulcrum action exec get_analytics --dimension daily|cycle|project|agent|team --scope {project_id|workspace_id|global} --from DATE --to DATE`. Result shape matches the corresponding table. Also exposed at `GET /analytics/<dimension>` on the monitor.

**Agents can consume analytics.** When a Chief-of-Staff agent calls `fulcrum action exec build_cos_context`, the snapshot includes the top-3 analytics deltas (velocity trends, block frequency, role utilization). CoS has context without leaving the CLI.

#### Event bus taxonomy (`event-bus.ts`)

Not a table — the in-process event dispatcher that feeds graph reducers.

**Enumerated event types** (makes the reducer contract explicit):

| Event | Fires when | Reducer action |
|---|---|---|
| `memory_written` | After L0 + L1 + (if durable) L2 | Upsert memory node |
| `memory_promoted` | Dreaming deep phase | Upsert durable memory node; delete short-term node |
| `memory_superseded` | Supersession detected | Add `supersedes` edge |
| `file_indexed` | PCI watcher add/change | Upsert file + chunk nodes; add `defines` / `imports` / `calls` edges |
| `file_unlinked` | PCI watcher unlink | Delete file + chunk nodes + outgoing edges |
| `task_created` / `task_updated` / `task_deleted` | Task CRUD | Upsert/delete task node + status-dependent edges |
| `agent_run_started` / `_completed` / `_blocked` | Run lifecycle | Upsert run node + `executed_by` / `produced` / status edges |
| `team_instantiated` / `team_member_added` / `team_member_removed` | Team ops | Upsert team_instance node + member edges |
| `handoff_dispatched` / `_delivered` / `_rejected` | Handoff lifecycle | Upsert handoff node + status edges |
| `workflow_started` / `_completed` | Workflow runs | Upsert workflow_run node |
| `hook_fired` | Hook event | Upsert ephemeral hook_event node |
| `trace_span_closed` | OTel span close | Upsert ephemeral trace_event node |
| `policy_decided` | Policy evaluation | Upsert ephemeral policy_event node |
| `sync_push` / `sync_pull` / `sync_conflict` | External sync | Upsert external_ref + conflict nodes |
| `git_commit_recorded` | Git reducer | Upsert git_commit node + `landed_in` edges |
| `artifact_produced` | Artifact emission | Upsert artifact node + `produced_by` edge |
| `notification_emitted` | `notify.ts` fires | Upsert ephemeral notification_event node |

Event bus guarantees: in-process ordered; reducer failures logged, never throw; events are **not persisted** (they're ephemeral dispatch — the table rows they produce ARE persisted, via reducers).

#### Orthogonal infrastructure (deliberately not in graph)

These tables / components serve the system but don't carry semantic entities an agent should query:

- `advisory_locks` — transient distributed-lock table. Lifetime seconds to minutes; not entity data.
- `display_id_sequences` — sequence state for human-readable IDs (TASK-1, ISSUE-42). Pure counter.
- `agent_state_projection` — denormalized projection of latest `agent_run` state per session. Query-optimized cache; agents query `agent_runs` directly.
- `schema` / migration metadata — DDL versioning.
- `packages/core/src/embedding/` registry — configures sqlite-vec providers. Infrastructure.
- `packages/core/src/locks.ts` / `janitor.ts` / `ids.ts` / `constants.ts` / `config.ts` — system internals.

Skipping these keeps the graph high-signal. If a later use case needs one of them as a node (e.g., "which agent held lock X?"), we revisit — but v2 excludes.

#### Package-level summary

Every `fulcrum-*` package and its role in v2:

| Package | Role | Changes in v2 |
|---|---|---|
| `fulcrum-core` | Schema + domain functions + event bus | Add `slug` / `vault_path` / `supersedes` / `embedded` / `schema_version` / `normalize_version` columns; add `external_ref` / `git_commit` / `git_pr` / `agent_adapter` / `artifact_contract` tables if not already; event-bus taxonomy formalized. |
| `fulcrum-memory` | L0 / L1 / L2 memory + code + graph | Biggest expansion — all Tier A/B code lands here. `dreaming/`, `pci/`, `wal/`, `sanitize/`, `retrieval/`, `eval/longmemeval/` added. |
| `fulcrum-monitor` | HTTP dashboard | Add `/graph/query` + `/project-context` + `/a2a/cards/<role>` endpoints. Dashboard "Graph" tab. |
| `fulcrum-planning` | Epics / issues / PRDs / plans / reviews | Graph-reducer hookup; no schema change. |
| `fulcrum-policy` | Rule evaluation | Emit `policy_decided` events; otherwise unchanged. |
| `fulcrum-sync` | External push/pull | Emit `sync_push` / `sync_pull` / `sync_conflict` events; `external_ref` graph node population. |
| `fulcrum-teams` | Team lifecycle | Emit `team_instantiated` / `team_member_*` events. |
| `fulcrum-workflows` | Workflow definition + run state | Emit `workflow_started` / `workflow_completed` events. `run_workflow` action shape. |
| `fulcrum-worker` | Adapter registry | `agent_adapter` graph population on `registerAgentAdapter` + `executed_by` edges on `start_agent_run`. |
| `fulcrum-worktrees` | Worktree alloc + merge queue | `worktree →(points_at)→ git_branch` edges; merge queue events. |
| `fulcrum-cli` | CLI-first entry point | Every capability wrapped as `fulcrum action exec <name>`. New actions added (`list_activations`, `get_analytics`, `sync_status`, `git_pr_context`, etc.). |
| `fulcrum-fulcrum-mcp` | Selective MCP overlay | Filtered subset of CLI actions per role profile. 1:1 mapping. No MCP-only capabilities. |

### Project Content Index (PCI) — unified substrate

The memory vault and the project source tree share one index because they share one Kuzu graph and one query logic. PCI is the name for that shared substrate. Memory gives structure to experience; code gives structure to the project; PCI makes them symmetric so `recall_memory`, `query_memory`, `search_code`, and `code_context` all reach into the same graph and FTS store with different filters.

- **Scope.** Every file under the project root that is not gitignored, not in `node_modules` / `.fulcrum/` / `dist/` / `build/`, and under a size cap (default 1 MB). Covers code, docs, config, design notes — anything textual.
- **Owned by.** `fulcrum-memory` (already owns L0/L1/L2 per AGENTS.md §"Package Ownership Boundaries"). Existing files: `repo-map.ts`, `chunkers/ast-chunker.ts`, `ingest.ts` (`ingestFile`, `ingestProject`), Kuzu client, entity store.
- **Watcher (ONE per project, reference-counted singleton).** See §5.5.
- **Chunking.** AST-aware for TS/JS/TSX/JSX (existing `ASTChunker`); regex-syntax-boundary fallback for Python/Java/Go/Rust/C/C++ (existing `chunkSyntax` in `ingest.ts`); sliding-window for markdown/docs/unknown (existing `SlidingWindowChunker`).
- **Embedding policy.** Code is embedded on ingest — unlike short-term memory. Code is durable by construction (it's in git). File change → re-chunk → re-embed only the changed chunks. Because AST chunker boundaries are stable across small edits, a one-line edit re-embeds one chunk, not the whole file. This is the "only embed persistent" rule applied to code: durable at write, re-indexed on change, removed from vec on delete.
- **Kuzu graph unification.** Memory entities (decision, task, error, blocker, identity) and code entities (file, function, class, method, module) live in ONE graph. Edges cross types: a `decision` memory `about` a `function` node; a `file_patch` memory `edits` a `file` node; a `code_chunk` `mentions` a memory via wikilink in a comment (`// see [[decision:use-httponly]]`). `recall_memory` and `code_context` both traverse this graph.

---


---

**[← Index](index.md)** · **[← Prev: Problem & Philosophy](01-problem-and-philosophy.md)** · **[Next: Write & Recall Paths →](03-write-and-recall-paths.md)**
