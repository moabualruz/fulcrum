# PI Agent OS — Claude Code Integration

You are operating as part of the PI Agent OS multi-agent control plane.
The shared monitor server runs at http://127.0.0.1:4721 (start: `python -m pi_agent_os.monitor`).
PI agents running concurrently use the same backend — their activity shows in your MCP tools.

## Cockpit tools (mcp__pi-os__*)

All 13 control-plane tools are available:

### Task management
| Tool | Purpose |
|---|---|
| `mcp__pi-os__list_tasks` | List tasks (filter by status, project) |
| `mcp__pi-os__create_task` | Create a new task |
| `mcp__pi-os__update_task` | Update status, note, or assignment |

### Agent run lifecycle — call these for every task you work on
| Tool | When to call |
|---|---|
| `mcp__pi-os__start_agent_run` | At the start of your task — returns run_id |
| `mcp__pi-os__heartbeat_agent_run` | Every ~30 s of active work (current_step, progress_pct) |
| `mcp__pi-os__complete_agent_run` | When your task is done (output_summary) |
| `mcp__pi-os__block_agent_run` | When you cannot proceed (reason for blocking) |

### Memory
| Tool | Purpose |
|---|---|
| `mcp__pi-os__recall_memory` | Semantic search of project knowledge |
| `mcp__pi-os__write_memory` | Persist decision/finding for future recall |

### Status & planning
| Tool | Purpose |
|---|---|
| `mcp__pi-os__get_workspace_status` | Full snapshot: running agents, blockers, WIP, queue |
| `mcp__pi-os__build_cos_context` | World-state markdown for Chief of Staff planning pass |
| `mcp__pi-os__list_agent_profiles` | Available agent roles |

## Lifecycle sequence

```
start of task   → mcp__pi-os__start_agent_run     (get run_id)
every ~30s      → mcp__pi-os__heartbeat_agent_run  (current_step, progress_pct)
done            → mcp__pi-os__complete_agent_run   (output_summary)
blocked         → mcp__pi-os__block_agent_run      (reason)
```

## Role boundaries

- You operate within an assigned role (chief_of_staff, implementer, tester, reviewer, researcher, planner)
- `chief_of_staff` is the only role permitted to create teams or dispatch sub-agents
- Do not bypass task creation for non-trivial work
- Produce structured outputs the control plane can parse

## Chief of Staff response format

When operating as `chief_of_staff`, end every response with:

```json
{
  "thinking": "...",
  "decisions": ["..."],
  "create_tasks": [],
  "update_tasks": [],
  "memory_notes": [],
  "done": false
}
```

## Security

All tool calls pass through the pi-os policy engine.
If a call is blocked, the tool returns an error with the policy reason — do not retry blocked operations.

## Monitor

- Dashboard: http://127.0.0.1:4721/docs
- Status API: http://127.0.0.1:4721/api/v1/status?workspace_id=ws_...
- Events SSE: http://127.0.0.1:4721/api/v1/events/stream?workspace_id=ws_...
