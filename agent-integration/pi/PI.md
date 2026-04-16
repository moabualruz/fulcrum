# Fulcrum Agent OS — PI Integration

This file is auto-loaded by the PI coding agent. It configures your connection to the Fulcrum agent control plane.

---

## Native PI Tools (pi cockpit extension)

When the Fulcrum cockpit extension is installed (`pi install ./agent-integration/pi/cockpit`), you have access to native `fulcrum_*` tools with no MCP overhead. These are preferred over MCP tools when running inside PI.

### Task Management

**`fulcrum_list_tasks`** — List tasks in the current workspace/project
```
status:  string (optional) — filter by status
limit:   number (optional, default 20)
```

**`fulcrum_create_task`** — Create a new task
```
title:         string (required)
description:   string (optional)
priority:      "low" | "medium" | "high" | "critical" (optional)
assigned_to:   string (optional) — agent role slug
done_criteria: string (optional)
```

**`fulcrum_update_task`** — Update a task
```
task_id:     string (required)
status:      string (optional) — "open" | "in_progress" | "done" | "blocked"
note:        string (optional) — progress note or blocker description
assigned_to: string (optional)
```

### Memory

**`fulcrum_recall_memory`** — Semantic search over project memory
```
query: string (required)
limit: number (optional, default 10)
```

**`fulcrum_write_memory`** — Store a memory entry
```
content: string (required)
title:   string (optional)
tags:    string (optional) — comma-separated, e.g. "decision,architecture"
```

### Agent Runs

**`fulcrum_start_run`** — Register a new agent run (call at the start of every task)
```
task_id:       string (required)
agent_role:    string (required) — one of the 24 canonical roles
worktree_path: string (optional) — git worktree path if using worktrees
pi_run_id:     string (optional) — supply your own run ID
```

**`fulcrum_heartbeat`** — Send a heartbeat (call every ~30 s during active work)
```
run_id:       string (required)
current_step: string (optional) — what you are doing right now
progress_pct: number (optional) — estimated completion 0–100
```

**`fulcrum_complete_run`** — Mark a run as completed
```
run_id:          string (required)
output_summary:  string (optional)
artifact_paths:  string (optional) — comma-separated file paths
```

**`fulcrum_block_run`** — Mark a run as blocked
```
run_id: string (required)
reason: string (required) — why blocked and what is needed to unblock
```

### Workspace Context

**`fulcrum_workspace_status`** — Get workspace overview (running agents, blockers, WIP)

**`fulcrum_build_cos_context`** — Build Chief-of-Staff world-state context
```
goal: string (required) — the planning goal for this CoS invocation
```

---

## CLI-First Execution

Prefer native cockpit tools when installed. If a capability is not available through
the cockpit, prefer the CLI contract:

- `fulcrum action exec list_tasks`
- `fulcrum action exec create_task`
- `fulcrum action exec update_task`
- `fulcrum action exec recall_memory`
- `fulcrum action exec write_memory`
- `fulcrum action exec list_agent_profiles`
- `fulcrum action exec get_agent_run_status`
- `fulcrum action exec start_agent_run`
- `fulcrum action exec heartbeat_agent_run`
- `fulcrum action exec complete_agent_run`
- `fulcrum action exec block_agent_run`
- `fulcrum action exec build_cos_context`
- `fulcrum action exec get_workspace_status`

## MCP Tools (compatibility fallback without cockpit or CLI integration)

If the cockpit is not installed and the runtime requires MCP-native execution,
use the `fulcrum serve mcp` stdio server. In PI, MCP tool names use the
`mcp__fulcrum__` prefix as a transport-level compatibility detail.

---

## Slash Commands (cockpit only)

| Command | Description |
|---------|-------------|
| `/fulcrum-setup` | Confirm workspace IDs (computed from project path, no files written) |
| `/fulcrum-status` | Show workspace status: running agents, blockers, WIP |
| `/fulcrum-start` | Start the Fulcrum monitor server |
| `/fulcrum-monitor` | Open the monitor in your browser |
| `/fulcrum-tasks [status]` | List tasks, optionally filtered by status |
| `/fulcrum-create <title>` | Create a new task |
| `/fulcrum-run <task_id> <role>` | Start an agent run |
| `/fulcrum-complete <run_id> [summary]` | Mark a run as completed |
| `/fulcrum-block <run_id> <reason>` | Mark a run as blocked |
| `/fulcrum-recall <query>` | Search project memories |
| `/fulcrum-workspaces` | List all workspaces |
| `/cos <goal>` | Inject Chief-of-Staff world-state context |

---

## Agent Lifecycle

When operating as part of a Fulcrum-managed workflow:

1. **On session start**: Call `fulcrum_workspace_status` to understand current state
2. **Before working**: Call `fulcrum_start_run` with your role and task_id
3. **During long tasks**: Call `fulcrum_heartbeat` every ~30 s
4. **When blocked**: Call `fulcrum_block_run` with a clear reason
5. **On completion**: Call `fulcrum_complete_run` with summary and artifact paths

---

## Agent Roles (24 canonical)

`chief_of_staff`, `context_gatherer`, `prd_planner`, `implementation_planner`,
`issue_decomposer`, `software_engineer`, `research_worker`, `refactor_worker`,
`browser_worker`, `data_engineer`, `ml_engineer`, `devops_engineer`,
`architecture_reviewer`, `code_reviewer`, `qa_engineer`, `security_reviewer`,
`integration_worker`, `documentation_writer`, `memory_curator`, `tech_lead`,
`product_manager`, `analyst`, `orchestrator`, `custom`

---

## Role Boundaries

**`chief_of_staff`** (L1 — orchestration only):
- MUST NOT write code, edit files, or run builds
- Creates tasks, delegates to specialist roles, synthesizes results
- Uses `fulcrum_build_cos_context` to orient before every session
- Allowed to create and invoke teams (only L1 role with this permission)

**All other roles** (L2 — implementation):
- MUST NOT invoke teams or create sub-orchestration workflows
- Focus on the assigned task; complete and report via `fulcrum_complete_run`

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

## Config

No project-local config files. `workspace_id` and `project_id` are computed deterministically from the project directory path (sha256[:12] of absolute path). Nothing is written to your project directory.

Environment variable overrides: `FULCRUM_WORKSPACE_ID`, `FULCRUM_PROJECT_ID`, `FULCRUM_PORT`

---

## Monitor URLs (default port 4721)

- Dashboard: http://localhost:4721
- Tasks API: http://localhost:4721/tasks
- Agents API: http://localhost:4721/agents
- Board: http://localhost:4721/board
