# Fulcrum Agent OS — Claude Code Integration

This file is auto-loaded by Claude Code. It configures your connection to the Fulcrum agent control plane.

---

## MCP Server

The `fulcrum` MCP server exposes 13 tools for task management, memory, agent runs, and workspace context. It runs as a local stdio process via the `fulcrum serve mcp` command.

Start the HTTP monitor (optional, for dashboard/debugging):
```
fulcrum serve monitor
```
Or start both together:
```
fulcrum serve all
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

**Total: 22 tools**

### `mcp__fulcrum__list_tasks` — List Tasks

`read-only` `idempotent`

Reads tasks in a workspace/project. Returns id, title, status, priority, assigned_to, blockers. Filters by status when provided. Effect: read-only. Returns: array of task summaries. Requires workspace_id and project_id.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `project_id` | string | Yes | Project ID |
| `workspace_id` | string | Yes | Workspace ID |
| `status` | string | No | Filter by status (queued, running, blocked, completed) |
| `limit` | number | No | Max results (default 40) |

### `mcp__fulcrum__create_task` — Create Task

Creates a new task in the project. Auto-creates workspace and project if they do not exist. Effect: writes task row. Returns: task_id, title, status, priority, assigned_to. Requires title, project_id, workspace_id.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `title` | string | Yes | Task title |
| `project_id` | string | Yes | Project ID |
| `workspace_id` | string | Yes | Workspace ID |
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

Hybrid semantic search over agent memory (FTS5 + vector + rerank). Effect: read-only, queries embedding model. Returns: array of {content, score, tags} ordered by relevance. Requires workspace_id, project_id, and query.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `query` | string | Yes | Natural language search query |
| `workspace_id` | string | Yes | Workspace ID |
| `project_id` | string | Yes | Project ID |
| `limit` | number | No | Max results (default 10) |
| `query_scope` | `session` \| `project` \| `workspace` \| `global` | No | Search breadth: project (default) = workspace+project; workspace = all projects in workspace; global = cross-workspace; session = specific agent session |
| `session_id` | string | No | Session ID — required when query_scope=session |

### `mcp__fulcrum__write_memory` — Write Memory

Persists a memory note to vault (L0), SQLite FTS5 (L1), and vector index (L2). Effect: writes memory row + vault file. Returns: saved=true, memory_id, project_id, tags. Requires content, workspace_id, project_id.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `content` | string | Yes | Memory content (plain text) |
| `workspace_id` | string | Yes | Workspace ID |
| `project_id` | string | Yes | Project ID |
| `title` | string | No | Optional title (defaults to first 80 chars of content) |
| `tags` | string | No | Comma-separated tags (e.g. "decision,architecture") |

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

Registers the start of an agent run. Call at the beginning of every task. Auto-creates a stub task if task_id is not provided. Effect: inserts agent_runs row, sets task status to running. Returns: run_id, status. Requires agent_role, workspace_id.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `task_id` | string | No | Task ID to associate (auto-creates stub if not found or not provided) |
| `agent_role` | string | Yes | One of the 24 canonical role slugs (e.g. software_engineer) |
| `workspace_id` | string | Yes | Workspace ID |
| `project_id` | string | No | Optional project ID (defaults to workspace_id) |
| `worktree_path` | string | No | Optional git worktree path for code-writing roles |
| `pi_run_id` | string | No | Optional custom run ID for external tracking |

### `mcp__fulcrum__heartbeat_agent_run` — Heartbeat Agent Run

`idempotent`

Sends a liveness heartbeat for a running agent to prevent it being marked stale. Call every ~30 seconds during long tasks. Effect: updates heartbeat_at and optional progress fields. Returns: run_id, ok=true. Requires run_id, workspace_id.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `run_id` | string | Yes | Run ID from start_agent_run |
| `workspace_id` | string | Yes | Workspace ID |
| `current_step` | string | No | Optional current step description |
| `progress_pct` | number | No | Optional progress percentage (0–100) |

### `mcp__fulcrum__complete_agent_run` — Complete Agent Run

`destructive`

Marks an agent run as finished with optional summary and artifact paths. Effect: sets agent_runs.status=finished, records artifacts. Returns: run_id, status. Requires run_id, workspace_id.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `run_id` | string | Yes | Run ID from start_agent_run |
| `workspace_id` | string | Yes | Workspace ID |
| `output_summary` | string | No | Summary of what was accomplished |
| `artifact_paths` | string | No | Comma-separated artifact file paths changed or created |

### `mcp__fulcrum__block_agent_run` — Block Agent Run

`destructive`

Marks an agent run as blocked with a reason. Use when work cannot continue without human input or a dependency resolving. Effect: sets status=blocked, records reason. Returns: run_id, status, reason. Requires run_id, workspace_id, reason.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `run_id` | string | Yes | Run ID from start_agent_run |
| `workspace_id` | string | Yes | Workspace ID |
| `reason` | string | Yes | Why the run is blocked (will surface in workspace status) |

### `mcp__fulcrum__build_cos_context` — Build Chief-of-Staff Context

`read-only` `idempotent`

Builds a Chief-of-Staff world-state snapshot: active tasks, running agents, blockers, recent events. Effect: read-only. Returns: context_markdown formatted for system prompt injection. Requires project_id, workspace_id.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `goal` | string | No | Optional goal description (included in snapshot header) |
| `project_id` | string | Yes | Project ID |
| `workspace_id` | string | Yes | Workspace ID |
| `max_tasks` | number | No | Max tasks to include (default 20) |
| `max_events` | number | No | Max events to include (default 10) |

### `mcp__fulcrum__get_workspace_status` — Get Workspace Status

`read-only` `idempotent`

Reads full workspace status: running agents, blockers, WIP count, queue depth, recent runs. Effect: read-only. Returns: workspace_id, active_runs, blocked_runs, wip_count, queued_tasks, runs array, blockers array. Requires workspace_id.

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `workspace_id` | string | Yes | Workspace ID |

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


<!-- GENERATED:tools-end -->

---

## Agent Lifecycle

When operating as part of a Fulcrum-managed workflow:

1. **On session start**: Call `mcp__fulcrum__get_workspace_status` to understand current state
2. **Before working on a task**: Call `mcp__fulcrum__start_agent_run` with your role and task_id
3. **During long tasks**: Call `mcp__fulcrum__heartbeat_agent_run` every few minutes
4. **When blocked**: Call `mcp__fulcrum__block_agent_run` with a clear reason
5. **On completion**: Call `mcp__fulcrum__complete_agent_run` with summary and artifact paths

---

## Role Boundaries

**`chief_of_staff`** (L1 — orchestration only):
- MUST NOT write code, edit files, or run builds
- Creates tasks, delegates to specialist roles, synthesizes results
- Uses `mcp__fulcrum__build_cos_context` to orient before every session
- Allowed to create and invoke teams (only L1 role with this permission)

**All other roles** (L2 — implementation):
- MUST NOT invoke teams or create sub-orchestration workflows
- Focus on the assigned task; complete and report via `mcp__fulcrum__complete_agent_run`

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
