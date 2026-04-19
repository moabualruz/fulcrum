# Fulcrum Agent OS — Claude Code Integration

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

Reads tasks in a workspace/project. Returns id, title, status, priority, assigned_to, blockers. Filters by status when provided. Effect: read-only. Returns: array of task summaries. workspace_id and project_id are optional — defaults to the server cwd context.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `project_id` | string | No | Project ID (optional — defaults to cwd project) |
| `workspace_id` | string | No | Workspace ID (optional — defaults to cwd workspace) |
| `status` | string | No | Filter by status (queued, running, blocked, completed) |
| `limit` | number | No | Max results (default 40) |

### `mcp__fulcrum__create_task` — Create Task

Creates a new task in the project. Auto-creates workspace and project if they do not exist. Effect: writes task row. Returns: task_id, title, status, priority, assigned_to. Requires title. workspace_id and project_id are optional — defaults to cwd context.

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

Updates a task's status, note, or assignment. Effect: updates task row in place. Returns: task_id, updated=true, list of changed fields. Requires task_id.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `task_id` | string | Yes | Task ID to update |
| `status` | string | No | New status value |
| `note` | string | No | Progress note |
| `assigned_to` | string | No | Reassign to this agent role slug |

### `mcp__fulcrum__recall_memory` — Recall Memory

`read-only` `open-world`

Hybrid semantic search over agent memory (FTS5 + vector + rerank). Returns the top-k most relevant memories for the given query in the specified scope. workspace_id is optional — defaults to cwd workspace. project_id is optional — omit for workspace-wide recall. Returns: id, content (truncated to max_chars), score (0.0–1.0), tags.

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

Memory v3 retrieval: FTS5 + vector + graph traversal fused via weighted RRF, filtered by confidence floor + supersession. Returns L1 curated pages with L0 back-refs (sources[] + l0_wikilinks[]) so agents can follow any claim to the raw source via `read_raw_source`. `recall_memory` remains available as a back-compat alias. workspace_id defaults to cwd; project_id optional for workspace-wide recall.

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

Walk an L1 curated page back to its L0 sources: both frontmatter `sources[]` entries and inline `[[raw/...]]` wikilinks are resolved. Returns per-source { l0_id, source_type, snippet, vault_path, created_at }. Missing sources are reported with source_type="missing" so callers never silently lose a reference.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `page_id` | string | Yes | L1 curated page id |

### `mcp__fulcrum__inspect_memory` — Inspect Memory

`read-only`

Dump a full L1 curated page — frontmatter, body, serialized form, and resolved wikilink absolute paths (exists flag per link). Use when an agent needs the full page text before deciding whether to mark it wrong or override a claim.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `page_id` | string | Yes | L1 curated page id |

### `mcp__fulcrum__read_raw_source` — Read Raw Source

`read-only`

Return the full body of an L0 raw source (the audit root). Strips the file frontmatter so only the captured bytes land in the response.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `l0_id` | string | Yes | L0 source id (the ULID from l0_sources.source_id) |

### `mcp__fulcrum__trace_claim` — Trace Claim

`read-only`

Reverse lookup: given a substring, return every L1 page whose body contains it, ranked by confidence. Each hit carries a snippet around the match plus match_count + sources[] so the caller can jump to the L0 provenance.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `claim` | string | Yes | Substring to search for (case-insensitive) |
| `workspace_id` | string | No |  |
| `project_id` | string | No |  |
| `limit` | number | No | Max hits (default 20) |

### `mcp__fulcrum__consolidate_memory` — Propose Memory Consolidation

`read-only`

Propose merge candidates across L1 pages sharing the same entity set and retention tier, whose lowest-confidence member clears the floor. Dry-run only in v3 PR 7.4 — the curator-driven apply path lands later. Returns { dry_run: true, candidates: [{entity_set, retention_tier, page_ids, min_confidence_in_group, workspace_id, project_id}] }.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `workspace_id` | string | No | Scope to this workspace (optional; defaults to current cwd) |
| `project_id` | string | No | Scope to a single project (optional) |
| `min_confidence` | number | No | Floor on the lowest-confidence member (default 0.5) |
| `retention_tier` | string | No | Only groups in this tier (working|episodic|semantic|procedural) |

### `mcp__fulcrum__lint_memory` — Lint Memory Vault

`read-only`

Verify the migrated memory vault: reports zero orphans, zero missing-source references, and zero supersession cycles. Migration stubs (pages with sources=[] + sources_via=[]) are tracked separately and do NOT count as orphans. Returns { ok, counts: { pages_checked, orphans, migration_stubs, missing_sources, supersession_cycles }, issues[] }.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `workspace_id` | string | No | Scope to this workspace (optional; default scans all workspaces) |

### `mcp__fulcrum__mark_memory_wrong` — Mark Memory Wrong

Flag an L1 page as incorrect. Writes a new L0 correction entry under `raw/correction/` capturing the reason and (optional) correction_body. Does NOT auto-run the curator — the operator or a scheduled pass triggers re-curation; the correction L0 entry is the input the curator will consume to supersede the flagged page.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `page_id` | string | Yes | L1 page to flag |
| `reason` | string | Yes | Why this page is wrong |
| `correction_body` | string | No | Optional detailed correction text |
| `workspace_id` | string | Yes |  |
| `project_id` | string | No |  |

### `mcp__fulcrum__write_memory` — Write Memory

Persists a memory note to vault (L0), SQLite FTS5 (L1), and vector index (L2). Effect: writes memory row + vault file. Returns: saved=true, memory_id, project_id, tags. Requires content. workspace_id and project_id are optional — defaults to cwd context.

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

Reads all 24 canonical AgentRole profiles. When workspace_id is provided, also returns DB-backed custom profiles for that workspace. Effect: read-only. Returns: array of {role, name, description, capabilities}.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `workspace_id` | string | No | Optional. When provided, DB-backed profiles for this workspace are merged into the response. |

### `mcp__fulcrum__get_agent_run_status` — Get Agent Run Status

`read-only` `idempotent`

Reads live status of an agent run. Effect: read-only. Returns: run_id, status, role, current_step, progress_pct. Requires run_id.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `run_id` | string | Yes | Run ID returned by start_agent_run |

### `mcp__fulcrum__start_agent_run` — Start Agent Run

Registers the start of an agent run. Call at the beginning of every task. Auto-creates a stub task if task_id is not provided. Effect: inserts agent_runs row, sets task status to running. Returns: run_id, status. Requires agent_role. workspace_id is optional — defaults to cwd workspace.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `task_id` | string | No | Task ID to associate (auto-creates stub if not found or not provided) |
| `agent_role` | string | Yes | One of the 24 canonical role slugs (e.g. software_engineer) |
| `workspace_id` | string | No | Workspace ID (optional — defaults to cwd workspace) |
| `project_id` | string | No | Optional project ID (defaults to workspace_id) |
| `worktree_path` | string | No | Optional git worktree path for code-writing roles |
| `pi_run_id` | string | No | Optional custom run ID for external tracking |
| `model` | string | No | Optional model override (e.g. "claude-sonnet-4-6") |
| `dispatch` | boolean | No | If true, spawn a Claude Code subprocess for this run (fire-and-forget) |

### `mcp__fulcrum__heartbeat_agent_run` — Heartbeat Agent Run

`idempotent`

Sends a liveness heartbeat for a running agent to prevent it being marked stale. Call every ~30 seconds during long tasks. Effect: updates heartbeat_at and optional progress fields. Returns: run_id, ok=true. Requires run_id. workspace_id is optional — defaults to cwd workspace.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `run_id` | string | Yes | Run ID from start_agent_run |
| `workspace_id` | string | No | Workspace ID (optional — defaults to cwd workspace) |
| `current_step` | string | No | Optional current step description |
| `progress_pct` | number | No | Optional progress percentage (0–100) |

### `mcp__fulcrum__complete_agent_run` — Complete Agent Run

`destructive`

Marks an agent run as finished with optional summary and artifact paths. Effect: sets agent_runs.status=finished, records artifacts. Returns: run_id, status. Requires run_id. workspace_id is optional — defaults to cwd workspace.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `run_id` | string | Yes | Run ID from start_agent_run |
| `workspace_id` | string | No | Workspace ID (optional — defaults to cwd workspace) |
| `output_summary` | string | No | Summary of what was accomplished |
| `artifact_paths` | array | No | Artifact file paths changed or created |

### `mcp__fulcrum__block_agent_run` — Block Agent Run

`destructive`

Marks an agent run as blocked with a reason. Use when work cannot continue without human input or a dependency resolving. Effect: sets status=blocked, records reason. Returns: run_id, status, reason. Requires run_id and reason. workspace_id is optional — defaults to cwd workspace.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `run_id` | string | Yes | Run ID from start_agent_run |
| `workspace_id` | string | No | Workspace ID (optional — defaults to cwd workspace) |
| `reason` | string | Yes | Why the run is blocked (will surface in workspace status) |

### `mcp__fulcrum__sweep_stale_runs` — Sweep Stale Agent Runs

`idempotent` `destructive`

Abort any agent runs still marked running but with no heartbeat for more than stale_minutes (default 10). Use on session start to reap zombies left by agents that crashed without firing their agent_end / session_shutdown hook. Effect: flips matching rows to status=aborted, status_category=done, and appends a run_event. Returns: list of reaped run_ids.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `workspace_id` | string | No | Workspace ID (optional — omit to sweep every workspace) |
| `stale_minutes` | number | No | Staleness threshold in minutes (default 10) |

### `mcp__fulcrum__build_cos_context` — Build Chief-of-Staff Context

`read-only` `idempotent`

Builds a Chief-of-Staff world-state snapshot: active tasks, running agents, blockers, recent events. Effect: read-only. Returns: context_markdown formatted for system prompt injection. workspace_id and project_id are optional — defaults to cwd context.

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

Reads full workspace status: running agents, blockers, WIP count, queue depth, recent runs. Effect: read-only. Returns: workspace_id, active_runs, blocked_runs, wip_count, queued_tasks, runs array, blockers array. workspace_id is optional — defaults to cwd workspace.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `workspace_id` | string | No | Workspace ID (optional — defaults to cwd workspace) |

### `mcp__fulcrum__create_team_template` — Create Team Template

Creates a reusable team template with role slots and policy. Templates are global (not workspace-scoped). Effect: writes team_templates row. Returns: template object. Requires name and slots array.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | Human-readable template name (globally unique) |
| `description` | string | No | Optional description |
| `slots` | array | Yes | Team slots — each specifies a role, counts, and optional agent_profile |
| `policy` | object | No | Optional team policy (communication_mode, budget_class, quality_class, etc.) |

### `mcp__fulcrum__invoke_team` — Invoke Team

`destructive`

Instantiates a team from a template and starts execution. Only chief_of_staff may invoke teams (enforced by canInvokeTeams check). Effect: creates team_instance row, spawns agents. Returns: team instance object. Requires template_id, workspace_id, purpose, caller_agent_id, caller_role.

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

Reads all team templates (global, not workspace-scoped). Effect: read-only. Returns: array of template objects with slots and policy.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `limit` | number | No | Max rows (default 50) |
| `offset` | number | No | Pagination offset (default 0) |

### `mcp__fulcrum__list_team_instances` — List Team Instances

`read-only` `idempotent`

Reads team instances in a workspace, optionally filtered by status_category. Effect: read-only. Returns: array of team instance objects. Requires workspace_id.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `workspace_id` | string | Yes | Workspace ID |
| `project_id` | string | No | Optional project scope |
| `status_category` | `backlog` \| `active` \| `blocked` \| `done` | No | Filter by status category |
| `limit` | number | No | Max rows (default 50) |
| `offset` | number | No | Pagination offset (default 0) |

### `mcp__fulcrum__create_agent_profile` — Create Agent Profile

Creates a DB-backed agent profile for a workspace. Extends the 24 canonical AgentRole slugs with workspace-scoped specializations. Effect: writes agent_profiles row. Returns: profile object. Requires workspace_id, name, description.

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

Creates a canonical definition for a role: model, tools_allow/deny, executor_uri, system prompt. Effect: writes agent_definitions row. Returns: definition object. Requires role, display_name, description.

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

Reads the canonical definition for an AgentRole: model, tools, executor_uri, system_prompt. Effect: read-only. Returns: definition object or null. Requires role.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `role` | string | Yes | AgentRole slug |

### `mcp__fulcrum__update_agent_definition` — Update Agent Definition

`idempotent`

Updates fields on an existing agent definition. Effect: updates agent_definitions row in place. Returns: updated definition object. Requires role.

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

Reads all agent definitions, optionally filtered by stability tier. Effect: read-only. Returns: array of definition objects.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `stability` | `stable` \| `beta` \| `experimental` \| `deprecated` | No | Filter by stability tier |

### `mcp__fulcrum__get_current_context` — Get Current Context

`read-only` `idempotent`

Returns the workspace_id and project_id for the directory the MCP server was started from (computed deterministically — no file needed). Use this at session start to discover the current workspace without reading .fulcrum.json or any project-local file. Also returns a readiness object with tools_available count, monitor_url, monitor_running (probed with 200ms timeout, cached 15s), and suggested_next_call. Effect: read-only. Returns: workspace_id, project_id, cwd, readiness.


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

## Memory Tiers (v3 draft)

> **Not live yet.** Schema + types have landed but no runtime path invokes them.
> Keep writing via the v2a surface (`writeMemory`, `ingestFile`, `mcp__fulcrum__write_memory`)
> until PR 1 flips L0 writes. Full spec:
> [`docs/plans/2026-04-18-002-memory-tiered-architecture-plan.md`](../../docs/plans/2026-04-18-002-memory-tiered-architecture-plan.md).

Three tiers:

- **L0 — raw dumps** (`${vault}/raw/<type>/YYYY/MM/DD/<ULID>.md`): verbatim capture, zero truncation, immutable. Index in `l0_sources`. Source types: `bash_trace | tool_trace | file_patch | session_transcript | prompt_attachment | web_capture | edit_diff | correction`.
- **L1 — curated wiki** (`${vault}/curated/…`): LLM-maintained markdown with `confidence`, `retention_tier`, `sources[]` back-refs to L0, `supersedes[]` lineage. Physical storage is still the `memories` table; the `l1_pages` view projects `schema_version >= 3` rows under v3 column names.
- **L2 — vectors on L1**: embeddings over curated bodies, not raw dumps.

**Feature flag:** `FULCRUM_MEMORY_V3` (default off through PR 4). Do not branch behavior on it yet.

**If a user asks you to ingest raw dumps into L0:** the API (`ingestRawSource`) lands in PR 1. Until then, treat raw ingest requests as "captured for later curation" — save via the v2a path with `source: 'manual'` so PR 6 can classify and migrate it.

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
