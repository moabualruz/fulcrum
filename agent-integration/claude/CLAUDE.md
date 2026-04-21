# Fulcrum Agent OS — Claude Code Integration

<!-- BEGIN FULCRUM managed-block v1 -->
<!--
  AUTO-GENERATED — do not edit inside this block.
  The Fulcrum installer overwrites this region idempotently on every run.
  Edit the canonical source at agent-integration/rules/ instead.
  Anything outside the BEGIN/END markers is preserved verbatim.
-->

## Fulcrum-first — prefer recall before grep

Before using `Grep`, `Glob`, or `Read` to search the codebase, try the Fulcrum
recall and code-search tools first. Fulcrum stores prior decisions, task
outcomes, and code relationships the filesystem does not.

For any "where is X", "why was X done", or "does X exist" question, call in
order:

1. `fulcrum action exec recall_knowledge` — natural-language query over curated
   memory (L1 pages with L0 provenance).
2. `fulcrum action exec search_code` — symbol and structural search when the
   question is about code shape.

Fall through to `Grep` / `Glob` / `Read` only when both return nothing relevant.
You may always use filesystem tools; the bias is about default ordering, not a
gate. Opt out per session with `FULCRUM_NO_RECALL_NUDGE=1`.

## Lifecycle — register every working session

At session start, before the first task:

1. `fulcrum action exec get_current_context` — returns `workspace_id` and
   `project_id`.
2. `fulcrum action exec get_workspace_status` — see running work, blockers,
   queue.
3. `fulcrum action exec start_agent_run` — pass your role and the task this
   session addresses. Save the returned `run_id`.

During any operation expected to take more than five minutes:

4. `fulcrum action exec heartbeat_agent_run` with `run_id` every three to five
   minutes. A run with no heartbeat for ten minutes is marked stale.

At end of task, exactly one of:

5. `fulcrum action exec complete_agent_run` with a summary and artifact paths
   changed.
6. `fulcrum action exec block_agent_run` with a reason, if you cannot proceed
   without human input or an external unblock.

## Role boundaries

`chief_of_staff` (L1 — orchestration only):

- Must not write code, edit files, run builds, or modify tests.
- Creates tasks, delegates to specialist roles, synthesizes results.
- The only role authorized to `invoke_team` or create sub-orchestration.

Every other role (L2 — implementation):

- Must not invoke teams or create sub-orchestration workflows.
- Focus on the assigned task. Report completion via `complete_agent_run`.

If operating as a specialist and orchestration is needed, block your run with a
reason requesting coordination from Chief-of-Staff — do not spawn a team.

<!-- END FULCRUM managed-block v1 -->

This file is auto-loaded by Claude Code. It configures your connection to the Fulcrum agent control plane.

---

## MCP Server

<!-- GENERATED:tool-count-start -->
The `fulcrum` MCP server exposes 32 tools for task management, memory, agent runs, and workspace context.
<!-- GENERATED:tool-count-end -->
It runs as a local stdio process via the `fulcrum serve mcp` command.
The HTTP monitor auto-starts on port 4721 alongside the MCP server — no separate command needed.

To suppress the monitor:
```
FULCRUM_NO_MONITOR=1 fulcrum serve mcp
# or: fulcrum serve mcp --no-monitor
```

To use a different port:
```
FULCRUM_MONITOR_PORT=5000 fulcrum serve mcp
```

### Recommended for Claude Code (hooks installed)

Use the planner-driven filtered mode with hook capabilities enabled. Claude Code's hooks already cover `recall_memory`, `write_memory`, and `get_current_context` in-process, so the filtered surface removes them from MCP and reduces prompt noise:

```
fulcrum serve mcp --mode filtered --runtime-capability hooks
```

The compatibility shortcut remains available:

```
fulcrum serve mcp --profile hook-only
```

For role-based filtering (for example only expose tools a `software_engineer` may use):

```
fulcrum serve mcp --profile software_engineer
```

Monitor URLs (default port 4721):
- Dashboard: http://localhost:4721
- Tasks API: http://localhost:4721/tasks
- Runs API: http://localhost:4721/runs
- Memory API: http://localhost:4721/memory/recall

---

<!-- GENERATED:tools-start -->

## Available MCP Tools

All tools are prefixed `mcp__fulcrum__` in Claude Code.

> Auto-generated from `TOOL_SCHEMAS` in `packages/cli/src/mcp-tools.ts`.
> Run `pnpm gen:claude-md` to regenerate after editing tools.

**Total: 32 tools**

### `mcp__fulcrum__list_tasks` — List Tasks

`read-only` `idempotent`

Read tasks in workspace/project. Returns id, title, status, priority, assigned_to, blockers. Filter by status optional. Read-only. workspace_id + project_id optional (default cwd).

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `project_id` | string | No | Project ID (optional — defaults to cwd project) |
| `workspace_id` | string | No | Workspace ID (optional — defaults to cwd workspace) |
| `status` | string | No | Filter by status (queued, running, blocked, completed) |
| `limit` | number | No | Max results (default 40) |

### `mcp__fulcrum__create_task` — Create Task

Create task. Auto-creates workspace + project if absent. Writes task row. Returns task_id, title, status, priority, assigned_to. Requires title. workspace_id + project_id optional (default cwd).

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `title` | string | Yes | Task title |
| `project_id` | string | No | Project ID (optional — defaults to cwd project) |
| `workspace_id` | string | No | Workspace ID (optional — defaults to cwd workspace) |
| `description` | string | No | Optional task description |
| `priority` | `critical` \| `high` \| `medium` \| `low` \| `none` | No | Priority level |
| `assigned_to` | string | No | Agent role slug to assign the task to |
| `done_criteria` | string | No | Definition of done |

### `mcp__fulcrum__update_task` — Update Task

`idempotent`

Update task status, note, or assignment. Updates a workspace-scoped task row in place. Returns task_id, updated=true, changed fields. Defaults workspace_id from the current project context.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `task_id` | string | Yes | Task ID to update |
| `workspace_id` | string | No | Workspace scope for the task; defaults to current workspace when omitted |
| `status` | string | No | New status value |
| `note` | string | No | Progress note |
| `assigned_to` | string | No | Reassign to this agent role slug |

### `mcp__fulcrum__recall_memory` — Recall Memory

`read-only` `open-world`

Hybrid semantic search over agent memory (FTS5 + vector + rerank). Returns top-k memories for query in scope. workspace_id optional (default cwd). project_id optional (omit for workspace-wide). Returns: id, content (truncated to max_chars), score 0.0–1.0, tags.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `query` | string | Yes | Natural language search query |
| `workspace_id` | string | No | Workspace ID (optional — defaults to cwd workspace) |
| `project_id` | string | No | Project ID (optional — omit for workspace-wide recall) |
| `limit` | number | No | Max results (default 10) |
| `offset` | number | No | Pagination offset — skip this many top results (default 0). Use for MemGPT-style context paging. |
| `max_chars` | number | No | Truncate content to this many characters (default 500) |
| `query_scope` | `session` \| `project` \| `workspace` | No | Search breadth: project (default) = workspace+project; workspace = all projects in workspace; session = specific agent session |
| `session_id` | string | No | Session ID — required when query_scope=session |

### `mcp__fulcrum__recall_knowledge` — Recall Knowledge (v3)

`read-only` `open-world`

Memory v3 retrieval: FTS5 + vector + graph traversal fused via weighted RRF. Filtered by confidence floor + supersession. Returns L1 curated pages + L0 back-refs (sources[] + l0_wikilinks[]) — follow any claim to raw via `read_raw_source`. `recall_memory` remains back-compat alias. workspace_id defaults cwd; project_id optional.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `query` | string | Yes | Natural language search query |
| `workspace_id` | string | No | Workspace ID (optional — defaults to cwd workspace) |
| `project_id` | string | No | Project ID (optional — omit for workspace-wide recall) |
| `limit` | number | No | Max results (default 10) |
| `offset` | number | No | Pagination offset (default 0) |
| `max_chars` | number | No | Truncate content to this many characters (default 500) |
| `confidence_floor` | number | No | Minimum confidence for a page to be returned (default 0.3) |
| `graph_hops` | number | No | BFS depth from query-mentioned entities (default 2) |
| `include_superseded` | boolean | No | Include pages whose superseded_by is non-null (default false) |

### `mcp__fulcrum__get_memory_sources` — Get Memory Sources

`read-only`

Walk L1 page back to L0 sources: frontmatter `sources[]` + inline `[[raw/...]]` wikilinks resolved. Returns per-source { l0_id, source_type, snippet, vault_path, created_at }. Missing sources reported as source_type="missing" — never silently lose reference.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `page_id` | string | Yes | L1 curated page id |

### `mcp__fulcrum__inspect_memory` — Inspect Memory

`read-only`

Dump full L1 page — frontmatter, body, serialized form, resolved wikilink absolute paths (exists flag per link). Use before marking wrong or overriding a claim.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `page_id` | string | Yes | L1 curated page id |

### `mcp__fulcrum__read_raw_source` — Read Raw Source

`read-only`

Full body of L0 raw source (audit root). Strips file frontmatter — only captured bytes in response.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `l0_id` | string | Yes | L0 source id (the ULID from l0_sources.source_id) |

### `mcp__fulcrum__trace_claim` — Trace Claim

`read-only`

Reverse lookup: substring → every L1 page containing it, ranked by confidence. Each hit carries snippet + match_count + sources[] for jumping to L0 provenance.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `claim` | string | Yes | Substring to search for (case-insensitive) |
| `workspace_id` | string | No |  |
| `project_id` | string | No |  |
| `limit` | number | No | Max hits (default 20) |

### `mcp__fulcrum__consolidate_memory` — Propose Memory Consolidation

`read-only`

Propose merge candidates across L1 pages sharing entity set + retention tier, lowest-confidence member above floor. Dry-run only in v3 PR 7.4 — curator apply path lands later. Returns { dry_run: true, candidates: [{entity_set, retention_tier, page_ids, min_confidence_in_group, workspace_id, project_id}] }.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `workspace_id` | string | No | Scope to this workspace (optional; defaults to current cwd) |
| `project_id` | string | No | Scope to a single project (optional) |
| `min_confidence` | number | No | Floor on the lowest-confidence member (default 0.5) |
| `retention_tier` | string | No | Only groups in this tier (working|episodic|semantic|procedural) |

### `mcp__fulcrum__lint_memory` — Lint Memory Vault

`read-only`

Verify migrated memory vault: zero orphans, zero missing-source refs, zero supersession cycles. Migration stubs (sources=[] + sources_via=[]) tracked separately, NOT counted as orphans. Returns { ok, counts: { pages_checked, orphans, migration_stubs, missing_sources, supersession_cycles }, issues[] }.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `workspace_id` | string | No | Scope to this workspace (optional; default scans all workspaces) |

### `mcp__fulcrum__mark_memory_wrong` — Mark Memory Wrong

Flag L1 page incorrect. Writes L0 correction entry under `raw/correction/` with reason + optional correction_body. Does NOT auto-run curator — operator or scheduled pass triggers re-curation; correction L0 entry = input curator consumes to supersede flagged page.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `page_id` | string | Yes | L1 page to flag |
| `reason` | string | Yes | Why this page is wrong |
| `correction_body` | string | No | Optional detailed correction text |
| `workspace_id` | string | Yes |  |
| `project_id` | string | No |  |

### `mcp__fulcrum__write_memory` — Write Memory

Persist memory note to vault (L0), SQLite FTS5 (L1), vector index (L2). Writes memory row + vault file. Returns saved=true, memory_id, project_id, tags. Requires content. workspace_id + project_id optional (default cwd).

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `content` | string | Yes | Memory content (plain text) |
| `workspace_id` | string | No | Workspace ID (optional — defaults to cwd workspace) |
| `project_id` | string | No | Project ID (optional — defaults to cwd project) |
| `title` | string | No | Optional title (defaults to first 80 chars of content) |
| `tags` | array | No | Tag strings (e.g. ["decision","architecture"]) |

### `mcp__fulcrum__list_agent_profiles` — List Agent Profiles

`read-only` `idempotent`

Read all 24 canonical AgentRole profiles. workspace_id provided → also returns DB-backed custom profiles for that workspace. Read-only. Returns {role, name, description, capabilities}[].

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `workspace_id` | string | No | Optional. When provided, DB-backed profiles for this workspace are merged into the response. |

### `mcp__fulcrum__get_agent_run_status` — Get Agent Run Status

`read-only` `idempotent`

Read live agent run status. Read-only. Returns run_id, status, role, current_step, progress_pct. Requires run_id.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `run_id` | string | Yes | Run ID returned by start_agent_run |

### `mcp__fulcrum__start_agent_run` — Start Agent Run

Register start of agent run. Call at start of every task. Auto-creates stub task if no task_id. Inserts agent_runs row, sets task status=running. Returns run_id, status. Requires agent_role. workspace_id optional (default cwd). context_type defaults to subagent.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `task_id` | string | No | Task ID to associate (auto-creates stub if not found or not provided) |
| `agent_role` | string | Yes | One of the 24 canonical role slugs (e.g. software_engineer) |
| `workspace_id` | string | No | Workspace ID (optional — defaults to cwd workspace) |
| `project_id` | string | No | Optional project ID (defaults to workspace_id) |
| `context_type` | `primary` \| `subagent` \| `cron` \| `heartbeat` \| `flush` | No | Run context type (defaults to subagent) |
| `worktree_path` | string | No | Optional git worktree path for code-writing roles |
| `pi_run_id` | string | No | Optional custom run ID for external tracking |
| `model` | string | No | Optional model override (e.g. "claude-sonnet-4-6") |
| `dispatch` | boolean | No | If true, spawn a Claude Code subprocess for this run (fire-and-forget) |

### `mcp__fulcrum__heartbeat_agent_run` — Heartbeat Agent Run

`idempotent`

Liveness heartbeat to prevent stale-mark. Call ~30s during long tasks. Updates heartbeat_at + optional progress. Returns run_id, ok=true. Requires run_id. workspace_id optional (default cwd).

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `run_id` | string | Yes | Run ID from start_agent_run |
| `workspace_id` | string | No | Workspace ID (optional — defaults to cwd workspace) |
| `current_step` | string | No | Optional current step description |
| `progress_pct` | number | No | Optional progress percentage (0–100) |

### `mcp__fulcrum__complete_agent_run` — Complete Agent Run

`destructive`

Mark agent run finished with optional summary + artifact paths. Sets status=finished, records artifacts. Returns run_id, status. Requires run_id. workspace_id optional (default cwd).

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `run_id` | string | Yes | Run ID from start_agent_run |
| `workspace_id` | string | No | Workspace ID (optional — defaults to cwd workspace) |
| `output_summary` | string | No | Summary of what was accomplished |
| `artifact_paths` | array | No | Artifact file paths changed or created |

### `mcp__fulcrum__block_agent_run` — Block Agent Run

`destructive`

Mark agent run blocked with reason. Use when cannot continue without human input or dependency resolving. Sets status=blocked, records reason. Returns run_id, status, reason. Requires run_id + reason. workspace_id optional (default cwd).

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `run_id` | string | Yes | Run ID from start_agent_run |
| `workspace_id` | string | No | Workspace ID (optional — defaults to cwd workspace) |
| `reason` | string | Yes | Why the run is blocked (will surface in workspace status) |

### `mcp__fulcrum__sweep_stale_runs` — Sweep Stale Agent Runs

`idempotent` `destructive`

Abort runs still marked running with no heartbeat >stale_minutes (default 10). Use on session start to reap zombies from crashed agents that never fired agent_end/session_shutdown. Flips matching rows → status=aborted, status_category=done + appends run_event. Returns reaped run_ids.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `workspace_id` | string | No | Workspace ID (optional — omit to sweep every workspace) |
| `stale_minutes` | number | No | Staleness threshold in minutes (default 10) |

### `mcp__fulcrum__build_cos_context` — Build Chief-of-Staff Context

`read-only` `idempotent`

Build CoS world-state snapshot: active tasks, running agents, blockers, recent events. Read-only. Returns context_markdown formatted for system-prompt injection. workspace_id + project_id optional (default cwd).

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `goal` | string | No | Optional goal description (included in snapshot header) |
| `project_id` | string | No | Project ID (optional — defaults to cwd project) |
| `workspace_id` | string | No | Workspace ID (optional — defaults to cwd workspace) |
| `max_tasks` | number | No | Max tasks to include (default 20) |
| `max_events` | number | No | Max events to include (default 10) |

### `mcp__fulcrum__get_workspace_status` — Get Workspace Status

`read-only` `idempotent`

Read full workspace status: running agents, blockers, WIP count, queue depth, recent runs. Read-only. Returns workspace_id, active_runs, blocked_runs, wip_count, queued_tasks, runs[], blockers[]. workspace_id optional (default cwd).

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `workspace_id` | string | No | Workspace ID (optional — defaults to cwd workspace) |

### `mcp__fulcrum__create_team_template` — Create Team Template

Create reusable team template with role slots + policy. Templates global (not workspace-scoped). Writes team_templates row. Returns template object. Requires name + slots array.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | Human-readable template name (globally unique) |
| `description` | string | No | Optional description |
| `slots` | array | Yes | Team slots — each specifies a role, counts, and optional agent_profile |
| `policy` | object | No | Optional team policy (communication_mode, budget_class, quality_class, etc.) |

### `mcp__fulcrum__invoke_team` — Invoke Team

`destructive`

Instantiate team from template + start execution. Only chief_of_staff (canInvokeTeams gate). Creates team_instance row, spawns agents. Returns team instance. Requires template_id, workspace_id, purpose, caller_agent_id, caller_role.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `template_id` | string | Yes | Template to instantiate |
| `workspace_id` | string | Yes | Workspace ID |
| `project_id` | string | No | Optional project scope |
| `purpose` | string | Yes | Why this team is being spawned |
| `task_id` | string | No | Optional originating task |
| `caller_agent_id` | string | Yes | Agent ID of the invoker |
| `caller_role` | string | Yes | Role of the invoker (must be chief_of_staff) |
| `initial_slots` | object | No | Optional initial slot → agent_id[] mapping |

### `mcp__fulcrum__list_team_templates` — List Team Templates

`read-only` `idempotent`

Read all team templates (global, not workspace-scoped). Read-only. Returns template objects[] with slots + policy.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `limit` | number | No | Max rows (default 50) |
| `offset` | number | No | Pagination offset (default 0) |

### `mcp__fulcrum__list_team_instances` — List Team Instances

`read-only` `idempotent`

Read team instances in workspace. Optional status_category filter. Read-only. Returns team instance objects[]. Requires workspace_id.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `workspace_id` | string | Yes | Workspace ID |
| `project_id` | string | No | Optional project scope |
| `status_category` | `backlog` \| `active` \| `blocked` \| `done` | No | Filter by status category |
| `limit` | number | No | Max rows (default 50) |
| `offset` | number | No | Pagination offset (default 0) |

### `mcp__fulcrum__create_agent_profile` — Create Agent Profile

Create DB-backed agent profile for workspace. Extends 24 canonical AgentRole slugs with workspace-scoped specializations. Writes agent_profiles row. Returns profile object. Requires workspace_id, name, description.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `workspace_id` | string | Yes | Workspace ID |
| `name` | string | Yes | Profile name, unique within the workspace |
| `description` | string | Yes | Profile description |
| `base_role` | string | No | Canonical AgentRole slug to inherit from (defaults to "custom") |
| `system_prompt` | string | No | Optional system prompt override |
| `capabilities` | object | No | Optional capability flags / metadata |
| `created_by` | string | No | Agent ID of the creator |

### `mcp__fulcrum__create_agent_definition` — Create Agent Definition

Create canonical role definition: model, tools_allow/deny, executor_uri, system prompt. Writes agent_definitions row. Returns definition object. Requires role, display_name, description.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `role` | string | Yes | AgentRole slug (must be one of the 24 canonical roles) |
| `display_name` | string | Yes | Human-readable role name |
| `description` | string | Yes | Role description |
| `version` | string | No | Semver version (default "0.1.0") |
| `stability` | `stable` \| `beta` \| `experimental` \| `deprecated` | No | Stability tier |
| `system_prompt` | string | No | System prompt override |
| `model` | string | No | Model ID (e.g. "claude-sonnet-4-6") |
| `provider` | string | No | Provider (default "anthropic") |
| `tools_allow` | array | No | Tool names the agent may use (null = all) |
| `tools_deny` | array | No | Tool names the agent may not use (null = none denied) |
| `capabilities` | array | No | Capability strings (e.g. ["code", "web_search"]) |
| `executor_uri` | string | No | Executor URI (e.g. "claude-code://", "pi://") |

### `mcp__fulcrum__get_agent_definition` — Get Agent Definition

`read-only` `idempotent`

Read canonical AgentRole definition: model, tools, executor_uri, system_prompt. Read-only. Returns definition object or null. Requires role.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `role` | string | Yes | AgentRole slug |

### `mcp__fulcrum__update_agent_definition` — Update Agent Definition

`idempotent`

Update existing agent definition fields. Updates agent_definitions row in place. Returns updated definition. Requires role.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `role` | string | Yes | AgentRole slug to update |
| `display_name` | string | No | New display name |
| `description` | string | No | New description |
| `version` | string | No | New version |
| `stability` | `stable` \| `beta` \| `experimental` \| `deprecated` | No | New stability |
| `system_prompt` | string | No | New system prompt |
| `model` | string | No | New model |
| `executor_uri` | string | No | New executor URI |

### `mcp__fulcrum__list_agent_definitions` — List Agent Definitions

`read-only` `idempotent`

Read all agent definitions. Optional stability filter. Read-only. Returns definition objects[].

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `stability` | `stable` \| `beta` \| `experimental` \| `deprecated` | No | Filter by stability tier |

### `mcp__fulcrum__get_current_context` — Get Current Context

`read-only` `idempotent`

Returns workspace_id + project_id for MCP-server cwd (deterministic, no file). Use at session start to discover workspace without reading .fulcrum.json. Also returns readiness: tools_available, monitor_url, monitor_running (200ms probe, 15s cache), suggested_next_call. Read-only. Returns workspace_id, project_id, cwd, readiness.


<!-- GENERATED:tools-end -->

---

## Agent Lifecycle

When operating as part of a Fulcrum-managed workflow:

1. **Preferred path**: use hooks when available, otherwise call `fulcrum action exec <action>` through the CLI
2. **On session start**: call `fulcrum action exec get_current_context` to get `workspace_id` and `project_id`
3. **Understand state**: call `fulcrum action exec get_workspace_status` with the `workspace_id`
4. **Before working on a task**: call `fulcrum action exec start_agent_run` with your role and task_id
5. **During long tasks**: call `fulcrum action exec heartbeat_agent_run`
6. **When blocked**: call `fulcrum action exec block_agent_run` with a clear reason
7. **On completion**: call `fulcrum action exec complete_agent_run` with summary and artifact paths

Use the `mcp__fulcrum__*` tools directly only when the runtime requires MCP-native execution.

---

## Role Boundaries

**`chief_of_staff`** (L1 — orchestration only):
- MUST NOT write code, edit files, or run builds
- Creates tasks, delegates to specialist roles, synthesizes results
- Uses `fulcrum action exec build_cos_context` to orient before every session
- Allowed to create and invoke teams (only L1 role with this permission)

**All other roles** (L2 — implementation):
- MUST NOT invoke teams or create sub-orchestration workflows
- Focus on the assigned task; complete and report via `fulcrum action exec complete_agent_run`

---

## Memory Tiers (v3 shipped)

> **Live.** Memory v3 is the current memory path. `FULCRUM_MEMORY_V3` was
> retired in PR 9.5; do not branch behavior on it. New code should use
> `ingestRawSource`, `createCuratedPage`, `runCurator`, and `applyDecay`.
> Operator reference:
> [`docs/architecture/memory-v3.md`](../../docs/architecture/memory-v3.md).

Three tiers:

- **L0 — raw dumps** (`${vault}/raw/<type>/YYYY/MM/DD/<ULID>.md`): verbatim capture, zero truncation, immutable. Index in `l0_sources`. Source types: `bash_trace | tool_trace | file_patch | session_transcript | prompt_attachment | web_capture | edit_diff | correction`.
- **L1 — curated wiki** (`${vault}/curated/…`): LLM-maintained markdown with `confidence`, `retention_tier`, `sources[]` back-refs to L0, `supersedes[]` lineage. Physical storage is still the `memories` table; the `l1_pages` view projects `schema_version >= 3` rows under v3 column names.
- **L2 — vectors on L1**: embeddings over curated bodies, not raw dumps.

**Feature flag:** `FULCRUM_MEMORY_V3` was retired in PR 9.5. v3 is now the only memory path — no flag, no fallback.

**If a user asks you to ingest raw dumps into L0:** use the live v3 raw-source path (`ingestRawSource`) or an existing CLI/MCP surface backed by it. Curate captured L0 sources with `fulcrum memory curate <l0_id>` when curation is requested.

---

## Chief-of-Staff Response Format

When acting as `chief_of_staff`, structure your final response as:

```
## Status
[DONE | IN_PROGRESS | BLOCKED]

## Work Completed
- [bullet list of completed items]

## Next Steps
- [bullet list of what comes next]

## Risks / Blockers
- [any blockers or risks, or "None"]
```

---

## Hook Integration

A `PreToolUse` hook is installed to notify Fulcrum of every tool call. This enables:
- Audit logging of all tool usage
- Policy enforcement (e.g., team-invoke guard)
- Run heartbeat tracking

The hook runs `fulcrum hook claude` on every tool call and reads the tool event from stdin.
