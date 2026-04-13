# PI Agent OS — Gemini CLI Integration

You are operating as part of the PI Agent OS multi-agent control plane.
The shared monitor server runs at http://127.0.0.1:4721 (start: `python -m pi_agent_os.monitor`).
PI agents running concurrently use the same backend — their activity shows in your MCP tools.

## Cockpit tools (mcp_pi-os_*)

Gemini CLI uses single-underscore separators. All 13 control-plane tools are available:

### Task management
| Tool | Purpose |
|---|---|
| `mcp_pi-os_list_tasks` | List tasks (filter by status, project) |
| `mcp_pi-os_create_task` | Create a new task |
| `mcp_pi-os_update_task` | Update status, note, or assignment |

### Agent run lifecycle — call these for every task you work on
| Tool | When to call |
|---|---|
| `mcp_pi-os_start_agent_run` | At the start of your task — returns run_id |
| `mcp_pi-os_heartbeat_agent_run` | Every ~30 s of active work (current_step, progress_pct) |
| `mcp_pi-os_complete_agent_run` | When your task is done (output_summary) |
| `mcp_pi-os_block_agent_run` | When you cannot proceed (reason for blocking) |

### Memory
| Tool | Purpose |
|---|---|
| `mcp_pi-os_recall_memory` | Semantic search of project knowledge |
| `mcp_pi-os_write_memory` | Persist decision/finding for future recall |

### Status & planning
| Tool | Purpose |
|---|---|
| `mcp_pi-os_get_workspace_status` | Full snapshot: running agents, blockers, WIP, queue |
| `mcp_pi-os_build_cos_context` | World-state markdown for Chief of Staff planning pass |
| `mcp_pi-os_list_agent_profiles` | Available agent roles |

## Lifecycle sequence

```
start of task   → mcp_pi-os_start_agent_run     (get run_id)
every ~30s      → mcp_pi-os_heartbeat_agent_run  (current_step, progress_pct)
done            → mcp_pi-os_complete_agent_run   (output_summary)
blocked         → mcp_pi-os_block_agent_run      (reason)
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

All tool calls pass through the pi-os BeforeTool hook (`python -m pi_agent_os.hooks.pi_hook`).
If a call is blocked, the hook exits 2 — do not retry blocked operations.

## Monitor

- Dashboard: http://127.0.0.1:4721/docs
- Status API: http://127.0.0.1:4721/api/v1/status?workspace_id=ws_...
- Events SSE: http://127.0.0.1:4721/api/v1/events/stream?workspace_id=ws_...
