# Fulcrum Agent OS — Gemini CLI Integration

This file is auto-loaded by Gemini CLI. It configures your connection to the Fulcrum agent control plane.

## Canonical rules (modular via `@./imports`)

Gemini supports file-includes in context files per `docs/cli/gemini-md.md`
§"Modularize context with imports". The three canonical Fulcrum rules live
as separate files so each can be maintained independently and reused across
other agents via the same fanout source.

@./rules/fulcrum-rule-fulcrum-first.md
@./rules/fulcrum-rule-lifecycle.md
@./rules/fulcrum-rule-role-boundaries.md

---

## MCP Server

Fulcrum is CLI-first. Use `fulcrum action exec <action>` as the standard path in skills and automation; use the `fulcrum` MCP server only when Gemini needs an MCP tool surface. It runs as a local stdio process via `fulcrum serve mcp`, and its exposed tool set can be filtered per runtime or agent.

Recommended Gemini MCP command when the BeforeTool / AfterTool hooks are installed:

```bash
fulcrum serve mcp --mode filtered --runtime-capability hooks
```

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

## Available MCP Tools

In Gemini CLI, MCP tool names use underscores. All tools are prefixed `mcp_fulcrum_`.

### Task Management

**`mcp_fulcrum_list_tasks`** — List tasks in a workspace/project
```
workspace_id: string (required)
project_id:   string (optional)
status:       "open" | "in_progress" | "done" | "blocked" (optional)
limit:        number (optional, default 20)
```

**`mcp_fulcrum_create_task`** — Create a new task
```
title:        string (required)
workspace_id: string (required)
project_id:   string (optional)
description:  string (optional)
priority:     "low" | "medium" | "high" | "critical" (optional)
assigned_to:  string (optional) — agent role slug
```

**`mcp_fulcrum_update_task`** — Update an existing task
```
task_id:     string (required)
status:      "open" | "in_progress" | "done" | "blocked" (optional)
title:       string (optional)
description: string (optional)
priority:    "low" | "medium" | "high" | "critical" (optional)
assigned_to: string (optional)
```

### Memory

**`mcp_fulcrum_recall_memory`** — Semantic search over agent memory
```
query:        string (required)
workspace_id: string (required)
project_id:   string (required)
limit:        number (optional, default 5)
```

**`mcp_fulcrum_write_memory`** — Store a memory entry
```
content:      string (required)
workspace_id: string (required)
project_id:   string (required)
tags:         string[] (optional)
importance:   number (optional, 0.0–1.0)
```

### Agent Runs

**`mcp_fulcrum_list_agent_profiles`** — List all available agent role profiles
```
(no parameters)
```

Returns all 24 canonical roles:
`chief_of_staff`, `context_gatherer`, `prd_planner`, `implementation_planner`,
`issue_decomposer`, `software_engineer`, `research_worker`, `refactor_worker`,
`browser_worker`, `data_engineer`, `ml_engineer`, `devops_engineer`,
`architecture_reviewer`, `code_reviewer`, `qa_engineer`, `security_reviewer`,
`integration_worker`, `documentation_writer`, `memory_curator`, `tech_lead`,
`product_manager`, `analyst`, `orchestrator`, `custom`

**`mcp_fulcrum_get_agent_run_status`** — Get status of an agent run
```
run_id: string (required)
```

**`mcp_fulcrum_start_agent_run`** — Start a new agent run
```
workspace_id: string (required)
agent_role:   string (required) — one of the 24 canonical roles
task_id:      string (optional) — if omitted, a stub task is auto-created
project_id:   string (optional)
model:        string (optional) — e.g., "gemini-2.5-pro"
provider:     string (optional) — e.g., "google"
```

**`mcp_fulcrum_heartbeat_agent_run`** — Send a heartbeat to keep a run alive
```
run_id: string (required)
status: string (optional) — progress note
```

**`mcp_fulcrum_complete_agent_run`** — Mark a run as complete
```
run_id:         string (required)
summary:        string (optional)
artifact_paths: string[] (optional) — file paths changed/created
tests_passed:   number (optional)
tests_failed:   number (optional)
pr_url:         string (optional)
```

**`mcp_fulcrum_block_agent_run`** — Block a run, requesting escalation
```
run_id:             string (required)
reason:             string (required)
escalation_reason:  string (optional)
```

### Workspace Context

**`mcp_fulcrum_build_cos_context`** — Build Chief-of-Staff context summary
```
workspace_id: string (required)
project_id:   string (required)
max_tokens:   number (optional, default 2000)
```

**`mcp_fulcrum_get_workspace_status`** — Get workspace health and recent activity
```
workspace_id: string (required)
```

---

## Agent Lifecycle

When operating as part of a Fulcrum-managed workflow:

1. **On session start**: Call `fulcrum action exec get_workspace_status` to understand current state
2. **Before working on a task**: Call `fulcrum action exec start_agent_run` with your role and task_id
3. **During long tasks**: Call `fulcrum action exec heartbeat_agent_run` every few minutes
4. **When blocked**: Call `fulcrum action exec block_agent_run` with a clear reason
5. **On completion**: Call `fulcrum action exec complete_agent_run` with summary and artifact paths

If Gemini is invoking Fulcrum through MCP-native tools instead of shell commands, use the equivalent `mcp_fulcrum_*` tools from the catalog above.

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

A `BeforeTool` hook is installed to notify Fulcrum of every tool call. This enables:
- Audit logging of all tool usage
- Policy enforcement (e.g., team-invoke guard)
- Run heartbeat tracking

The hook runs `fulcrum hook gemini` on every tool call and reads the tool event from stdin.

<!-- BEGIN FULCRUM managed-block v1 -->
## Fulcrum canonical rules (auto-generated)

---
name: fulcrum-first
description: Prefer Fulcrum recall + code-search before filesystem grep. Nudge, not gate.
---

# Fulcrum-first

Before `Grep`/`Glob`/`Read`, try Fulcrum. Fulcrum holds prior decisions, task outcomes, code relations. Filesystem does not.

Questions "where is X", "why X done", "does X exist" — call in order:

1. `fulcrum action exec recall_knowledge` — NL query over L1 curated memory (L0 provenance).
2. `fulcrum action exec search_code` — symbol + structural search.

Fall to `Grep`/`Glob`/`Read` only if both empty. Filesystem tools stay available. Bias = default ordering, not block.

Opt out: `FULCRUM_NO_RECALL_NUDGE=1`.

---

---
name: lifecycle
description: Register every session as Fulcrum agent run. Start, heartbeat, complete or block.
---

# Lifecycle

Session start, before first task:

1. `fulcrum action exec get_current_context` — returns `workspace_id`, `project_id`.
2. `fulcrum action exec get_workspace_status` — running work, blockers, queue.
3. `fulcrum action exec start_agent_run` — pass `agent_role`, `context_type`, and task. Save `run_id`.

Long ops (>5 min):

4. `fulcrum action exec heartbeat_agent_run` every 3–5 min. No heartbeat 10 min = stale.

Task end, exactly one:

5. `fulcrum action exec complete_agent_run` — summary + artifact paths.
6. `fulcrum action exec block_agent_run` — reason if stuck on human/external.

Silent end without complete/block = run stays `running`; janitor marks stale.

---

---
name: role-boundaries
description: CoS orchestrates only, never writes code. Specialists implement. Only CoS invokes teams.
---

# Role boundaries

`chief_of_staff` (L1, orchestration only):

- No code writes, file edits, builds, test mods.
- Creates tasks, delegates to specialists, synthesizes results.
- Only role that may `invoke_team` or spawn sub-orchestration.

L2 specialists:

- No `invoke_team`. No sub-orchestration.
- Focus on assigned task. Report via `complete_agent_run` with summary + artifacts.

Specialist sees orchestration need → do not spawn team. `block_agent_run` with reason (request CoS coordination), or surface to user.
<!-- END FULCRUM managed-block v1 -->
