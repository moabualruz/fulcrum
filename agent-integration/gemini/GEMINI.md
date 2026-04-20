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
description: Prefer Fulcrum recall and code-search tools before filesystem grep. Nudges only — never blocks.
---

# Fulcrum-first

Before using `Grep`, `Glob`, or `Read` to search the codebase, try the Fulcrum
recall and code-search tools first. Fulcrum stores prior decisions, task
outcomes, and code relationships the filesystem does not.

For any "where is X", "why was X done", or "does X exist" question, call in
order:

1. `fulcrum action exec recall_knowledge` — natural-language query over
   curated memory (L1 pages with L0 provenance).
2. `fulcrum action exec search_code` — symbol and structural search when the
   question is about code shape.

Fall through to `Grep` / `Glob` / `Read` only when both return nothing
relevant. You may always use filesystem tools; the bias is about default
ordering, not a gate.

Opt out per session with `FULCRUM_NO_RECALL_NUDGE=1`.

---

---
name: lifecycle
description: Register every working session as a Fulcrum agent run. Start, heartbeat during long operations, complete or block at the end.
---

# Lifecycle

At the start of every session, before the first task:

1. `fulcrum action exec get_current_context` — returns `workspace_id` and
   `project_id`.
2. `fulcrum action exec get_workspace_status` — see running work, blockers,
   queue.
3. `fulcrum action exec start_agent_run` — pass your role and the task this
   session addresses. Save the returned `run_id`.

During any operation expected to take more than five minutes:

4. `fulcrum action exec heartbeat_agent_run` with `run_id` every three to
   five minutes. A run with no heartbeat for ten minutes is marked stale.

At end of task, exactly one of:

5. `fulcrum action exec complete_agent_run` with a summary and artifact
   paths changed.
6. `fulcrum action exec block_agent_run` with a reason, if you cannot
   proceed without human input or an external unblock.

A run that silently ends without `complete` or `block` leaves the task in
`running` state and the janitor marks it stale.

---

---
name: role-boundaries
description: Chief-of-Staff orchestrates only — never writes code. Specialist roles implement. Only Chief-of-Staff may invoke teams.
---

# Role boundaries

`chief_of_staff` (L1 — orchestration only):

- Must not write code, edit files, run builds, or modify tests.
- Creates tasks, delegates to specialist roles, synthesizes results.
- The only role authorized to `invoke_team` or create sub-orchestration.

Every other role (L2 — implementation):

- Must not invoke teams or create sub-orchestration workflows.
- Focus on the assigned task. Report completion via
  `complete_agent_run` with a summary and artifact paths.

If you are operating as a specialist and see that orchestration is needed
(e.g., a multi-agent coordination problem), do not spawn a team. Block your
run with a reason requesting coordination from Chief-of-Staff, or surface
the need to the user.
<!-- END FULCRUM managed-block v1 -->
