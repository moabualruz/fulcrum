# MCP Tools Reference

Fulcrum is CLI-first: canonical actions are the primary contract, and MCP is a compatibility transport. Use `fulcrum action exec <action>` for skills, hooks, CI, and internal automation. Use `fulcrum serve mcp` or `fulcrum serve mcp-http` when a runtime needs an MCP tool surface.

The built-in MCP compatibility catalog contains 32 tools. The active exposed subset depends on planner mode, runtime capabilities, platform, and agent type. In Claude Code these appear with the `mcp__fulcrum__` prefix.

```bash
fulcrum action exec list_tasks --json '{"status":"open"}'
fulcrum serve mcp --mode filtered --runtime-capability hooks
fulcrum serve mcp --profile software_engineer
fulcrum serve mcp-http --mode minimal --agent-type software_engineer
fulcrum serve all                              # MCP + HTTP monitor (default port 4721)
```

### MCP exposure planning

MCP exposure is computed from the canonical action metadata. The default preference order is:

1. native hooks
2. CLI actions
3. MCP compatibility tools

Use `fulcrum mcp plan` to inspect the exact tool surface a runtime would receive:

```bash
fulcrum mcp plan --mode filtered --runtime-capability hooks
fulcrum mcp plan --mode minimal --agent-type software_engineer --json
```

Key planner inputs:

| Flag | Effect |
|------|--------|
| `--mode full` | Expose the full MCP compatibility surface |
| `--mode filtered` | Hide tools ruled out by hooks, policy, runtime, and action metadata |
| `--mode minimal` | Prefer hook/CLI paths and expose only the narrower compatibility subset still needed |
| `--profile hook-only` | Compatibility shortcut for hook-capable runtimes |
| `--profile <role>` | Apply role policy from `agent_definitions` |
| `--agent-type <role>` | Filter by action availability metadata |
| `--runtime-capability <cap>` | Add runtime capability facts such as `hooks` |
| `--include-action <name>` | Force-include a canonical action |
| `--exclude-action <name>` | Force-hide a canonical action |

**Recommendation for Claude Code:** use `fulcrum serve mcp --mode filtered --runtime-capability hooks` or the compatibility shortcut `--profile hook-only` to remove the 3 hook-covered tools from the prompt surface.

Hook coverage is platform-aware. Example: `get_current_context` is hook-covered for Claude session bootstrap, but not for every other runtime, so `fulcrum mcp plan --mode filtered --runtime-capability hooks --platform gemini` still exposes it.

### Calling tools without MCP

Every built-in action is callable directly from the CLI (no live MCP server required):

```bash
fulcrum action exec list_tasks --json '{"status":"open"}'
fulcrum action exec get_workspace_status
echo '{"title":"Implement auth"}' | fulcrum action exec create_task
```

`fulcrum tool exec <name>` remains available as a compatibility alias over the same handler path.

The CLI path is the recommended execution path for hooks, CI pipelines, skills, and non-MCP platforms (Gemini CLI, PI, shell scripts).

**Annotations**: every tool carries machine-readable hints.

| Annotation | Meaning |
|------------|---------|
| `readOnly` | Never writes to persistent state — safe to retry without side effects |
| `idempotent` | Calling multiple times has the same net effect as calling once |
| `destructive` | Writes are hard to reverse (status transitions, run completion) |
| `longRunning` | Emits `notifications/progress` before/after if the caller provides `_meta.progressToken` |
| `openWorld` | Calls an embedding model or external system |

---

## Session Start

**When hooks are installed (Claude Code):** The `SessionStart` hook pre-fetches `get_workspace_status` and `list_tasks` (open, limit 10) in-process and writes the result to the session file. The `PreToolUse` hook then injects that snapshot into your context (as a stderr note) on the first tool call of the session — so Claude already has workspace context before making any MCP call. No explicit session-start calls are needed for orientation in this case.

**When no session-start/context hook is active (CI, MCP-only clients, or a
runtime with hooks disabled):** Call these two tools at the beginning of every
session, in order:

1. `get_current_context` — derive `workspace_id`, `project_id`, and readiness
2. `get_workspace_status` — understand active runs, blockers, and queue depth

**Optional `workspace_id`/`project_id`:** Most tools now accept these as optional — the server defaults them to the directory the MCP server was started from. You only need to pass them explicitly when targeting a different workspace or project than the cwd context.

---

## Task Management

### `list_tasks`

Reads tasks in a workspace/project. Filters by status when provided.

**Annotations:** read-only, idempotent

| Parameter | Type | Required | Description |
|-----------|------|:--------:|-------------|
| `workspace_id` | string | — | Workspace ID (defaults to cwd context) |
| `project_id` | string | — | Project ID (defaults to cwd context) |
| `status` | `queued` \| `running` \| `blocked` \| `completed` | — | Filter by status |
| `limit` | number | — | Max results (default 40) |

**Returns:** array of `{ task_id, title, status, priority, assigned_to, blockers }`

```
mcp__fulcrum__list_tasks({ workspace_id: "ws_1", project_id: "proj_1", status: "running" })
```

---

### `create_task`

Creates a new task in the project. Auto-creates workspace and project rows if they do not exist yet.

**Annotations:** write

| Parameter | Type | Required | Description |
|-----------|------|:--------:|-------------|
| `title` | string | ✓ | Task title |
| `project_id` | string | ✓ | Project ID |
| `workspace_id` | string | ✓ | Workspace ID |
| `description` | string | — | Optional longer description |
| `priority` | `critical` \| `high` \| `medium` \| `low` \| `none` | — | Priority level (default `medium`) |
| `assigned_to` | string | — | Agent role slug to assign immediately |
| `done_criteria` | string | — | Definition of done — shown to the agent when the task is picked up |

**Returns:** `{ task_id, title, status, priority, assigned_to }`

```
mcp__fulcrum__create_task({
  title: "Implement OAuth callback",
  workspace_id: "ws_1",
  project_id: "proj_1",
  priority: "high",
  assigned_to: "software_engineer"
})
```

---

### `update_task`

Updates a task's status, note, or assignment.

**Annotations:** idempotent

| Parameter | Type | Required | Description |
|-----------|------|:--------:|-------------|
| `task_id` | string | ✓ | Task ID to update |
| `status` | string | — | New status value |
| `note` | string | — | Progress note appended to the task journal |
| `assigned_to` | string | — | Reassign to this agent role slug |

**Returns:** `{ task_id, updated: true, changes: string[] }`

```
mcp__fulcrum__update_task({ task_id: "task_01j...", status: "blocked", note: "Waiting on DB schema approval" })
```

---

## Memory

### `recall_memory`

Hybrid semantic search over agent memory — FTS5 keyword + dense vector (HNSW) + sparse BM25 rescue, fused via Reciprocal Rank Fusion and reranked with BGE. Results are scoped by workspace/project.

**Annotations:** read-only, open-world (embedding model)

| Parameter | Type | Required | Description |
|-----------|------|:--------:|-------------|
| `query` | string | ✓ | Natural language search query |
| `workspace_id` | string | ✓ | Workspace ID |
| `project_id` | string | — | Project ID — omit for workspace-wide recall |
| `limit` | number | — | Max results (default 10) |
| `offset` | number | — | Skip this many top results (default 0) — use for MemGPT-style context paging |
| `max_chars` | number | — | Truncate each content field to this many characters (default 500) |
| `query_scope` | `session` \| `project` \| `workspace` | — | Search breadth: `project` (default) = workspace + project; `workspace` = all projects; `session` = one agent session |
| `session_id` | string | — | Required when `query_scope=session` |

**Returns:** array of `{ id, content, score, tags }` — score is 0.0–1.0, higher is more relevant

```
mcp__fulcrum__recall_memory({
  query: "OAuth token refresh strategy",
  workspace_id: "ws_1",
  project_id: "proj_1",
  limit: 5
})
```

---

### `write_memory`

Persists a memory to L0 vault (git-backed Markdown file), L1 SQLite FTS5, and enqueues for L2 Kuzu graph extraction if enabled.

**Annotations:** write

| Parameter | Type | Required | Description |
|-----------|------|:--------:|-------------|
| `content` | string | ✓ | Memory content — plain text |
| `workspace_id` | string | ✓ | Workspace ID |
| `project_id` | string | ✓ | Project ID |
| `title` | string | — | Optional title (defaults to first 80 chars of content) |
| `tags` | string[] | — | Tag strings — e.g. `["decision", "architecture"]` |

**Returns:** `{ saved: true, memory_id, project_id, tags }`

**Memory kinds** — stored in the `kind` field of the written row. Use tags to classify the kind of memory being written:

| Kind | Use for |
|------|---------|
| `decision` | Architectural or process decisions |
| `fact` | Factual assertions about the codebase or domain |
| `lesson` | Lessons learned from errors or experience |
| `summary` | Session, PR, or investigation summaries |
| `task_outcome` | Outcomes of completed tasks |
| `task_decision` | Decisions made during a task |
| `error` | Errors encountered and their resolutions |
| `doc` | Documentation fragments |
| `tool_trace` | Tool call traces (written automatically by post-hook) |

```
mcp__fulcrum__write_memory({
  content: "Decided to use PKCE flow for OAuth — avoids client_secret exposure in CLI.",
  workspace_id: "ws_1",
  project_id: "proj_1",
  title: "OAuth flow decision",
  tags: ["decision", "auth", "security"]
})
```

---

## RAG Roadmap Parity

Fulcrum stays CLI-first. These MCP tools mirror the matching `fulcrum action exec`
and CLI maintenance surfaces so agents can read health, repair, rebuild, search,
eval, and trace state without guessing which lower-level path to call. Internal
planner/report modules may split over time; tool names, scope rules, and
read/write semantics remain the compatibility contract.

### `get_rag_health`

Read-only RAG health report covering L0, L1, FTS, code, vector, embedding
failure, stale state, graph coverage, degraded reasons, and explicitly
`out_of_scope` domains.

**Annotations:** read-only, idempotent

| Parameter | Type | Required | Description |
|-----------|------|:--------:|-------------|
| `workspace_id` | string | — | Workspace ID |
| `project_id` | string | — | Project ID |
| `vault_path` | string | — | Optional vault path override |
| `runtime_profile` | string | — | Runtime data profile (`install`, `dev`, `test`) |
| `out_of_scope_domains` | string[] | — | Domains to mark `out_of_scope` for the read-only check |

### `get_rag_repair_plan`

Read-only repair plan over health, coverage, vectors, graph, provenance,
required actions, and eval readiness.

**Annotations:** read-only, idempotent

| Parameter | Type | Required | Description |
|-----------|------|:--------:|-------------|
| `workspace_id` | string | — | Workspace ID |
| `project_id` | string | — | Project ID |
| `runtime_profile` | string | — | Runtime data profile (`install`, `dev`, `test`) |

### `get_rag_rebuild_plan`

Read-only rebuild plan. Mirrors `fulcrum memory rebuild --mode plan --json`.

**Annotations:** read-only, idempotent

| Parameter | Type | Required | Description |
|-----------|------|:--------:|-------------|
| `workspace_id` | string | — | Workspace ID |
| `project_id` | string | — | Project ID |
| `runtime_profile` | string | — | Runtime data profile (`install`, `dev`, `test`) |
| `domains` | string[] | — | Domains to plan (`l0`, `l1`, `fts`, `code`, `vectors`, `graph`) |
| `allow_empty` | boolean | — | Permit a zero-scope plan |

### `get_rag_rebuild_dry_run`

Read-only dry run. Mirrors `fulcrum memory rebuild --mode dry-run --json`.

**Annotations:** read-only, idempotent

| Parameter | Type | Required | Description |
|-----------|------|:--------:|-------------|
| `workspace_id` | string | — | Workspace ID |
| `project_id` | string | — | Project ID |
| `runtime_profile` | string | — | Runtime data profile (`install`, `dev`, `test`) |
| `domains` | string[] | — | Domains to dry-run (`l0`, `l1`, `fts`, `code`, `vectors`, `graph`) |
| `allow_empty` | boolean | — | Permit a zero-scope dry run |

### `start_rag_rebuild`

Execute destructive rebuild with staged candidate, snapshot validation, parity
checks, report persistence, and audit event.

**Annotations:** destructive, long-running

| Parameter | Type | Required | Description |
|-----------|------|:--------:|-------------|
| `workspace_id` | string | — | Workspace ID |
| `project_id` | string | — | Project ID |
| `runtime_profile` | string | — | Runtime data profile (`install`, `dev`, `test`) |
| `confirm_profile` | string | — | Required profile confirmation for destructive runs |
| `verification_refs` | string[] | — | Prior dev/test verification report IDs |
| `domains` | string[] | — | Domains to rebuild (`l0`, `l1`, `fts`, `code`, `vectors`, `graph`) |
| `allow_empty` | boolean | — | Permit a zero-scope rebuild |

### `start_rag_repair`

Execute targeted repair through the rebuild pipeline and persist a repair run,
rebuild report, final health, retry guidance, and errors.

**Annotations:** destructive, long-running

| Parameter | Type | Required | Description |
|-----------|------|:--------:|-------------|
| `workspace_id` | string | — | Workspace ID |
| `project_id` | string | — | Project ID |
| `runtime_profile` | string | ✓ | Runtime data profile (`install`, `dev`, `test`) |
| `confirm_profile` | string | — | Required profile confirmation for install-profile destructive runs |
| `repair_plan_id` | string | — | Existing repair plan ID to attach |
| `verification_refs` | string[] | — | Prior dev/test verification report IDs |
| `domains` | string[] | — | Domains to repair (`l0`, `l1`, `fts`, `code`, `vectors`, `graph`) |
| `allow_empty` | boolean | — | Permit a zero-scope repair |

### `get_rag_rebuild_report`

Read a persisted rebuild report by ID.

**Annotations:** read-only, idempotent

| Parameter | Type | Required | Description |
|-----------|------|:--------:|-------------|
| `report_id` | string | ✓ | Rebuild report ID |
| `workspace_id` | string | — | Workspace ID |
| `runtime_profile` | string | — | Runtime data profile (`install`, `dev`, `test`) |

### `search_context`

Agent-preferred unified context search over memory, code, file, graph, task,
and decision evidence.

**Annotations:** write, non-destructive. This persists query trace/result rows.

| Parameter | Type | Required | Description |
|-----------|------|:--------:|-------------|
| `query` | string | ✓ | Natural language search query |
| `workspace_id` | string | — | Workspace ID |
| `project_id` | string | — | Project ID |
| `limit` | number | — | Max results |
| `context_budget_tokens` | number | — | Optional packed-context budget |
| `explain` | boolean | — | Include skipped/degraded stage details |
| `include_graph` | boolean | — | Include graph expansion |
| `graph_mode` | `local` \| `global_summary` \| `drift` | — | Graph expansion mode |
| `graph_depth` | number | — | Graph expansion depth |

### `run_rag_eval`

Run a RAG eval suite and persist eval results. Model-heavy and accelerator-heavy
cases stay opt-in.

**Annotations:** open-world, long-running

| Parameter | Type | Required | Description |
|-----------|------|:--------:|-------------|
| `workspace_id` | string | — | Workspace ID |
| `project_id` | string | — | Project ID |
| `suite` | `rag-lifecycle` \| `live-rag` \| `code-rag` \| `unified-context` | ✓ | Eval suite |
| `include_model_heavy` | boolean | — | Opt in to model-heavy cases |
| `include_accelerator_heavy` | boolean | — | Opt in to accelerator-heavy cases |
| `trigger_source` | `local` \| `ci` | — | Trigger source |
| `trigger_scope` | `rag_related` \| `non_rag` \| `manual` | — | Trigger scope |
| `gate_required` | boolean | — | Require gate semantics |

### `get_rag_query_trace`

Read a persisted RAG query trace by ID.

**Annotations:** read-only, idempotent

| Parameter | Type | Required | Description |
|-----------|------|:--------:|-------------|
| `query_trace_id` | string | ✓ | Query trace ID |
| `workspace_id` | string | — | Workspace ID |
| `project_id` | string | — | Project ID |

### Compatibility guidance

`recall_knowledge` and `search_code` remain supported compatibility surfaces,
but `search_context` is the agent-preferred entry point when memory, files,
code, graph, tasks, and decisions all matter. The corresponding CLI commands
mirror the same boundary: `memory doctor --repair-plan`, `memory rebuild
--mode plan|dry-run|execute`, `memory eval`, `memory trace-query`, and
`memory runtime-experiments`.

Optional runtime and store experiments stay disabled by default. They cannot be
adopted without quality, latency, rollback, local-first, agent/tool parity, and
operational risk gates. Agent-facing traces, reports, and eval artifacts redact
secrets, raw env values, and private paths; absolute paths remain limited to
explicit operator surfaces.

---

## Agent Runs

### `start_agent_run`

Registers the start of an agent run. Call at the beginning of every task. Auto-creates a stub task if `task_id` is not provided.

**Annotations:** write, long-running

| Parameter | Type | Required | Description |
|-----------|------|:--------:|-------------|
| `agent_role` | string | ✓ | One of the 24 canonical role slugs (e.g. `software_engineer`) |
| `workspace_id` | string | ✓ | Workspace ID |
| `task_id` | string | — | Task to associate — auto-creates stub task if omitted or not found |
| `project_id` | string | — | Optional project scope (defaults to workspace_id) |
| `context_type` | string | — | Run context: `primary`, `subagent`, `cron`, `heartbeat`, or `flush`; defaults to `subagent` |
| `worktree_path` | string | — | Git worktree path for code-writing roles |
| `pi_run_id` | string | — | Optional custom run ID for external tracking |
| `model` | string | — | Model override (e.g. `"claude-sonnet-4-6"`) |
| `dispatch` | boolean | — | If true, spawn a Claude Code subprocess for this run (fire-and-forget) |

**Returns:** `{ run_id, status, dispatched?, pid? }`

```
mcp__fulcrum__start_agent_run({
  agent_role: "software_engineer",
  workspace_id: "ws_1",
  task_id: "task_01j...",
  context_type: "primary"
})
```

---

### `heartbeat_agent_run`

Sends a liveness heartbeat to prevent the run from being marked stale by the janitor. Call every ~30 seconds during long tasks.

**Annotations:** idempotent

| Parameter | Type | Required | Description |
|-----------|------|:--------:|-------------|
| `run_id` | string | ✓ | Run ID from `start_agent_run` |
| `workspace_id` | string | ✓ | Workspace ID |
| `current_step` | string | — | Optional current step description |
| `progress_pct` | number | — | Optional progress percentage (0–100) |

**Returns:** `{ run_id, ok: true }`

```
mcp__fulcrum__heartbeat_agent_run({
  run_id: "run_01j...",
  workspace_id: "ws_1",
  current_step: "Writing integration tests",
  progress_pct: 60
})
```

---

### `complete_agent_run`

Marks an agent run as finished. Records summary, artifact paths, and fires the `agent_run_finished` event. Also auto-writes a structured completion memory to L0/L1.

**Annotations:** destructive, long-running

| Parameter | Type | Required | Description |
|-----------|------|:--------:|-------------|
| `run_id` | string | ✓ | Run ID from `start_agent_run` |
| `workspace_id` | string | ✓ | Workspace ID |
| `output_summary` | string | — | Summary of what was accomplished |
| `artifact_paths` | string[] | — | File paths changed or created |

**Returns:** `{ run_id, status: "finished" }`

```
mcp__fulcrum__complete_agent_run({
  run_id: "run_01j...",
  workspace_id: "ws_1",
  output_summary: "Implemented PKCE OAuth flow, added 23 tests, all passing.",
  artifact_paths: ["src/auth/oauth.ts", "src/auth/pkce.ts"]
})
```

---

### `block_agent_run`

Marks an agent run as blocked. Use when work cannot continue without human input or a dependency resolving. The reason surfaces in `get_workspace_status` and is visible in the monitor dashboard.

**Annotations:** destructive, long-running

| Parameter | Type | Required | Description |
|-----------|------|:--------:|-------------|
| `run_id` | string | ✓ | Run ID from `start_agent_run` |
| `workspace_id` | string | ✓ | Workspace ID |
| `reason` | string | ✓ | Why the run is blocked |

**Returns:** `{ run_id, status: "blocked", reason }`

```
mcp__fulcrum__block_agent_run({
  run_id: "run_01j...",
  workspace_id: "ws_1",
  reason: "Waiting for DB schema approval on the sessions table migration"
})
```

---

### `get_agent_run_status`

Reads live status of an agent run.

**Annotations:** read-only, idempotent

| Parameter | Type | Required | Description |
|-----------|------|:--------:|-------------|
| `run_id` | string | ✓ | Run ID from `start_agent_run` |

**Returns:** `{ run_id, status, role, current_step, progress_pct }`

**Status values:** `running` | `finished` | `blocked` | `failed` | `stale`

---

## Workspace & Context

### `get_current_context`

Returns the `workspace_id` and `project_id` for the directory the MCP server was started from. IDs are computed deterministically from the absolute path — no `.fulcrum.json` file is read, and two agents in the same checkout always get the same IDs.

Also returns a `readiness` object that reports how many tools are currently exposed, whether the monitor HTTP server is reachable, the suggested first canonical action for an agent that has just started, and whether RAG recall has searchable L1 data yet.

**Annotations:** read-only, idempotent

No parameters.

**Returns:**

```json
{
  "workspace_id": "ws_abc123",
  "project_id":   "proj_xyz456",
  "cwd":          "/home/user/myproject",
  "readiness": {
    "tools_available":   12,
    "monitor_url":       "http://localhost:4721",
    "monitor_running":   true,
    "suggested_next_call": "list_tasks",
    "rag": {
      "recall_status": "not_seeded",
      "seeded": false,
      "searchable_rows": 0,
      "degraded_stages": ["l1", "vectors", "graph"],
      "next_actions": ["Seed curated L1 memory before recall, for example by running memory ingest/curation or a scoped RAG rebuild."]
    }
  }
}
```

When the MCP server is started in compatibility-heavy mode, `tools_available` may be larger. In planner-driven filtered mode, it reflects the active exposed subset for that runtime.

`monitor_running` is probed with a 200 ms HTTP timeout and the result is cached for 15 seconds. Set `FULCRUM_MONITOR_PORT` to override the default port (4721). Set `FULCRUM_NO_MONITOR=1` to skip the probe entirely.

When `readiness.rag.recall_status` is `not_seeded`, skip `recall_knowledge` for that workspace/project and seed/curate memory first. `recall_knowledge` also returns `reason: "not_seeded"` with the same readiness payload if called directly before seed data exists.

```
mcp__fulcrum__get_current_context()
```

---

### `get_workspace_status`

Reads full workspace health: running agents, blockers, WIP count, queue depth.

**Annotations:** read-only, idempotent

| Parameter | Type | Required | Description |
|-----------|------|:--------:|-------------|
| `workspace_id` | string | ✓ | Workspace ID |

**Returns:**

```json
{
  "workspace_id":  "ws_1",
  "active_runs":   3,
  "blocked_runs":  1,
  "wip_count":     4,
  "queued_tasks":  7,
  "runs": [
    { "run_id": "run_01j...", "role": "software_engineer", "status": "running", "task_id": "task_01j..." }
  ],
  "blockers": [
    { "run_id": "run_01j...", "reason": "Waiting for DB schema approval" }
  ]
}
```

---

### `build_cos_context`

Builds a Chief-of-Staff world-state snapshot formatted as Markdown for direct system prompt injection. Includes active tasks, running agents, blockers, and recent domain events.

**Annotations:** read-only, idempotent, long-running

| Parameter | Type | Required | Description |
|-----------|------|:--------:|-------------|
| `project_id` | string | ✓ | Project ID |
| `workspace_id` | string | ✓ | Workspace ID |
| `goal` | string | — | Optional goal description to include in the snapshot header |
| `max_tasks` | number | — | Max tasks to include (default 20) |
| `max_events` | number | — | Max recent events to include (default 10) |

**Returns:** `{ context_markdown, project_id, workspace_id }`

`context_markdown` is ready to paste directly into a system prompt.

---

## Agent Profiles & Definitions

### `list_agent_profiles`

Lists all 24 canonical role profiles. When `workspace_id` is provided, workspace-scoped custom profiles are merged into the response.

**Annotations:** read-only, idempotent

| Parameter | Type | Required | Description |
|-----------|------|:--------:|-------------|
| `workspace_id` | string | — | Optional — include custom workspace profiles |

**Returns:** array of `{ role, name, description, capabilities }`

---

### `create_agent_profile`

Creates a workspace-scoped agent profile — a specialization of one of the 24 canonical roles with a custom system prompt and capability flags.

| Parameter | Type | Required | Description |
|-----------|------|:--------:|-------------|
| `workspace_id` | string | ✓ | Workspace ID |
| `name` | string | ✓ | Profile name — unique within the workspace |
| `description` | string | ✓ | Profile description |
| `base_role` | string | — | Canonical role to inherit from (default `custom`) |
| `system_prompt` | string | — | System prompt override |
| `capabilities` | object | — | Capability flags and metadata |
| `created_by` | string | — | Agent ID of the creator |

**Returns:** profile object

---

### `create_agent_definition`

Creates a canonical definition for a role: model, tool allow/deny lists, executor URI, system prompt, and stability tier. Definitions are global (not workspace-scoped) and represent the authoritative spec for how a role is run.

| Parameter | Type | Required | Description |
|-----------|------|:--------:|-------------|
| `role` | string | ✓ | AgentRole slug (must be one of the 24 canonical roles) |
| `display_name` | string | ✓ | Human-readable role name |
| `description` | string | ✓ | Role description |
| `version` | string | — | Semver version (default `0.1.0`) |
| `stability` | `stable` \| `beta` \| `experimental` \| `deprecated` | — | Stability tier |
| `system_prompt` | string | — | System prompt for this role |
| `model` | string | — | Model ID (e.g. `claude-sonnet-4-6`) |
| `provider` | string | — | Provider name (default `anthropic`) |
| `tools_allow` | string[] | — | Tool names the agent may use (`null` = all tools allowed) |
| `tools_deny` | string[] | — | Tool names the agent may not use (`null` = nothing denied) |
| `capabilities` | string[] | — | Capability strings (e.g. `["code", "web_search"]`) |
| `executor_uri` | string | — | Executor URI (e.g. `claude-code://`, `pi://`) |

**Returns:** definition object

---

### `get_agent_definition`

Reads the canonical definition for a role.

**Annotations:** read-only, idempotent

| Parameter | Type | Required | Description |
|-----------|------|:--------:|-------------|
| `role` | string | ✓ | AgentRole slug |

**Returns:** definition object, or `null` if not defined

---

### `update_agent_definition`

Updates fields on an existing agent definition. All fields are optional — only supplied fields are updated.

**Annotations:** idempotent

| Parameter | Type | Required | Description |
|-----------|------|:--------:|-------------|
| `role` | string | ✓ | AgentRole slug to update |
| `display_name` | string | — | New display name |
| `description` | string | — | New description |
| `version` | string | — | New version |
| `stability` | `stable` \| `beta` \| `experimental` \| `deprecated` | — | New stability |
| `system_prompt` | string | — | New system prompt |
| `model` | string | — | New model |
| `executor_uri` | string | — | New executor URI |

**Returns:** updated definition object

---

### `list_agent_definitions`

Lists all agent definitions, optionally filtered by stability tier.

**Annotations:** read-only, idempotent

| Parameter | Type | Required | Description |
|-----------|------|:--------:|-------------|
| `stability` | `stable` \| `beta` \| `experimental` \| `deprecated` | — | Filter by stability tier |

**Returns:** array of definition objects

---

## Teams

### `create_team_template`

Creates a reusable team template with typed role slots and a communication/budget/quality policy. Templates are global — not workspace-scoped.

| Parameter | Type | Required | Description |
|-----------|------|:--------:|-------------|
| `name` | string | ✓ | Human-readable template name — globally unique |
| `slots` | object[] | ✓ | Role slot definitions (see below) |
| `description` | string | — | Optional description |
| `policy` | object | — | Team policy (communication mode, budget class, quality class) |

**Slot fields:**

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `slot_id` | string | ✓ | Unique ID within the template |
| `role` | string | ✓ | AgentRole slug |
| `min_count` | number | ✓ | Minimum agents for this slot |
| `max_count` | number | ✓ | Maximum agents for this slot |
| `concurrency_cap` | number | ✓ | Max concurrent agents in the slot |
| `required` | boolean | ✓ | Whether the slot must be filled before the team can start |
| `description` | string | — | Slot description |
| `agent_profile` | string | — | Optional DB-backed `profile_id` to use for this slot |
| `spawn_mode` | `auto` \| `manual` | — | Whether agents are auto-spawned or manually assigned |

**Policy fields:**

| Field | Values |
|-------|--------|
| `communication_mode` | `hub_and_spoke` \| `mesh` \| `chain` \| `broadcast` |
| `budget_class` | `minimal` \| `medium` \| `large` \| `unlimited` |
| `quality_class` | `draft` \| `standard` \| `high` \| `production` |
| `latency_class` | `realtime` \| `interactive` \| `batch` |

**Returns:** team template object

---

### `invoke_team`

Instantiates a team from a template and starts execution. Only `chief_of_staff` may invoke teams — the `canInvokeTeams` policy check is enforced server-side and returns an error for all other roles.

**Annotations:** destructive

| Parameter | Type | Required | Description |
|-----------|------|:--------:|-------------|
| `template_id` | string | ✓ | Template to instantiate |
| `workspace_id` | string | ✓ | Workspace ID |
| `purpose` | string | ✓ | Why this team is being spawned |
| `caller_agent_id` | string | ✓ | Agent ID of the invoker |
| `caller_role` | string | ✓ | Must be `chief_of_staff` |
| `project_id` | string | — | Optional project scope |
| `task_id` | string | — | Optional originating task |
| `initial_slots` | object | — | Optional `slot_id → agent_id[]` pre-assignment |

**Returns:** team instance object

**Scheduling caps** (enforced globally):
- Max 8 concurrent teams globally
- Max 4 per project
- Max 2 per template

---

### `list_team_templates`

Lists all team templates.

**Annotations:** read-only, idempotent

| Parameter | Type | Required | Description |
|-----------|------|:--------:|-------------|
| `limit` | number | — | Max rows (default 50) |
| `offset` | number | — | Pagination offset (default 0) |

**Returns:** array of template objects with slots and policy

---

### `list_team_instances`

Lists team instances in a workspace, optionally filtered by status category.

**Annotations:** read-only, idempotent

| Parameter | Type | Required | Description |
|-----------|------|:--------:|-------------|
| `workspace_id` | string | ✓ | Workspace ID |
| `project_id` | string | — | Optional project scope |
| `status_category` | `backlog` \| `active` \| `blocked` \| `done` | — | Filter by status category |
| `limit` | number | — | Max rows (default 50) |
| `offset` | number | — | Pagination offset (default 0) |

**Returns:** array of team instance objects

---

## Agent Lifecycle

When operating inside a Fulcrum-managed workflow from any supported runtime (Claude Code, PI, Codex, Gemini):

1. **Session start** — Call `get_current_context` to get `workspace_id` + `project_id`, then `get_workspace_status` to understand current load
2. **Before working on a task** — Call `start_agent_run` with your role and `task_id`
3. **During long tasks** — Call `heartbeat_agent_run` every ~30 seconds with progress
4. **When blocked** — Call `block_agent_run` with a clear reason; it will surface in the dashboard
5. **On completion** — Call `complete_agent_run` with summary and artifact paths

```typescript
// Minimal lifecycle pattern
const ctx   = await mcp.call('get_current_context')
const run   = await mcp.call('start_agent_run', { agent_role: 'software_engineer', workspace_id: ctx.workspace_id, task_id: 'task_01j...' })
// ... do work, heartbeat periodically ...
await mcp.call('complete_agent_run', { run_id: run.run_id, workspace_id: ctx.workspace_id, output_summary: '...' })
```

---

## Error Handling

All tools return structured errors — they do not throw unhandled exceptions. Common error shapes:

| Code | Meaning |
|------|---------|
| `workspace_not_found` | `workspace_id` does not exist and auto-create was not triggered |
| `task_not_found` | `task_id` does not exist |
| `run_not_found` | `run_id` does not exist |
| `policy_denied` | The caller role lacks the required capability (e.g. non-CoS trying to invoke team) |
| `wip_limit_exceeded` | Starting this run would exceed the workspace WIP limit |
| `template_not_found` | `template_id` does not exist |
| `role_not_found` | `role` slug is not a valid canonical role |

---

## Transport Details

**stdio (JSON-RPC 2.0)** — newline-delimited JSON on stdin/stdout. This is the default used by Claude Code, PI, Codex, and opencode. The server reads one request object per line and writes one response per line.

**HTTP StreamableHTTP** — available via `fulcrum serve mcp-http` (default port 4722). The endpoint is `POST /mcp` with `Content-Type: application/json`. Used for HTTP-capable runtimes.

**Progress notifications** — tools marked `longRunning` (`start_agent_run`, `complete_agent_run`, `block_agent_run`, `build_cos_context`) send `notifications/progress` before and after execution when the caller includes `_meta.progressToken` in the request.

**Session management** — the HTTP transport supports `DELETE /mcp/session/<id>` for explicit session termination.
