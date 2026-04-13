# PI Agent OS Cockpit

Full control-plane dashboard for the [PI coding agent](https://shittycodingagent.ai).

## What it does

- **Live dashboard widget** — active runs (role, progress %, step), blocked agents, WIP count, server status
- **Footer** — quick-glance run count, blocked count, monitor port
- **Monitoring link** — always-visible `http://127.0.0.1:4721` link in widget header
- **Auto-starts** the PI Agent OS monitor + control API server on session start
- **Slash commands** — task management, run lifecycle, memory, CoS dispatch
- **LLM tools** — all control-plane operations as native PI tools (no MCP overhead)
- **Policy hook** — every tool call passes through the pi-os policy engine

## Install

```bash
# From the pi-stack-plan repo:
pi install ./agent-integration/pi/cockpit

# From npm (once published):
pi install npm:pi-os-cockpit
```

## Config

Create `.pi-os.json` in your project root:

```json
{
  "workspace_id": "ws_01JR...",
  "project_id": "proj_01JR...",
  "monitor_port": 4721
}
```

Or use env vars: `PI_OS_WORKSPACE_ID`, `PI_OS_PROJECT_ID`, `PI_OS_PORT`

To find your workspace/project IDs after running `pi-os workspace create`:
```bash
pi-os workspace list
pi-os project list --workspace-id ws_...
```

## Requirements

- Python 3.12+ with `pi_agent_os` installed (`uv sync` in pi-stack-plan repo)
- `python` in PATH

## Slash commands

| Command | Description |
|---|---|
| `/pi-status` | Full workspace status |
| `/pi-start` | Start the monitor server manually |
| `/pi-monitor` | Open monitor in browser |
| `/pi-tasks [status]` | List tasks (status: queued\|running\|blocked\|completed) |
| `/pi-create <title>` | Create a task |
| `/pi-run <task_id> <role>` | Start an agent run |
| `/pi-complete <run_id> [summary]` | Complete a run |
| `/pi-block <run_id> <reason>` | Block a run |
| `/pi-recall <query>` | Recall project memories |
| `/pi-workspaces` | List workspaces |
| `/cos <goal>` | Inject Chief of Staff world-state context |

## LLM tools

The following tools are available to the LLM:

- `pi_os_list_tasks` — list tasks
- `pi_os_create_task` — create a task
- `pi_os_update_task` — update status/note/assignment
- `pi_os_recall_memory` — semantic memory recall
- `pi_os_write_memory` — persist a memory note
- `pi_os_start_run` — register an agent run
- `pi_os_heartbeat` — send heartbeat
- `pi_os_complete_run` — mark run done
- `pi_os_block_run` — mark run blocked
- `pi_os_workspace_status` — full status snapshot
- `pi_os_build_cos_context` — CoS world-state markdown

## Monitor URLs

| Path | Description |
|---|---|
| `http://127.0.0.1:4721/docs` | Interactive API docs |
| `http://127.0.0.1:4721/api/v1/status?workspace_id=...` | Global status |
| `http://127.0.0.1:4721/api/v1/agents?workspace_id=...` | Agent fleet |
| `http://127.0.0.1:4721/api/v1/board?workspace_id=...` | Project board |
| `http://127.0.0.1:4721/api/v1/events/stream?workspace_id=...` | SSE event stream |
| `http://127.0.0.1:4721/api/v1/analytics/summary?workspace_id=...` | Analytics |
