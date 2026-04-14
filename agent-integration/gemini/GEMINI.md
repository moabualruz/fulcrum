# Fulcrum Agent OS — Gemini CLI Integration

This file is auto-loaded by Gemini CLI. It configures your connection to the Fulcrum agent control plane.

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

1. **On session start**: Call `mcp_fulcrum_get_workspace_status` to understand current state
2. **Before working on a task**: Call `mcp_fulcrum_start_agent_run` with your role and task_id
3. **During long tasks**: Call `mcp_fulcrum_heartbeat_agent_run` every few minutes
4. **When blocked**: Call `mcp_fulcrum_block_agent_run` with a clear reason
5. **On completion**: Call `mcp_fulcrum_complete_agent_run` with summary and artifact paths

---

## Role Boundaries

**`chief_of_staff`** (L1 — orchestration only):
- MUST NOT write code, edit files, or run builds
- Creates tasks, delegates to specialist roles, synthesizes results
- Uses `mcp_fulcrum_build_cos_context` to orient before every session
- Allowed to create and invoke teams (only L1 role with this permission)

**All other roles** (L2 — implementation):
- MUST NOT invoke teams or create sub-orchestration workflows
- Focus on the assigned task; complete and report via `mcp_fulcrum_complete_agent_run`

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
