# Fulcrum Cockpit

Control-plane dashboard and native PI tools for the [PI coding agent](https://github.com/mariozechner/pi).

## Install

```bash
# From this repo
pi install ./agent-integration/pi/cockpit

# Or use the install script
bash agent-integration/pi/install.sh
```

## What you get

### Dashboard widget

Live-updating widget in PI's TUI showing:
- Server status (stopped / starting / up / error)
- Running agent count + roles
- Blocked agent count + reasons
- WIP count
- Workspace/project context

### Footer status line

Always-visible at the bottom of PI:
```
● FULCRUM  2 run  WIP:3  :4721
```

### Slash commands

| Command | Description |
|---------|-------------|
| `/fulcrum-setup` | Configure workspace (creates `.fulcrum.json` in project root) |
| `/fulcrum-status` | Show workspace status: running agents, blockers, WIP count |
| `/fulcrum-start` | Start the Fulcrum monitor server |
| `/fulcrum-monitor` | Open monitor in browser (http://localhost:4721) |
| `/fulcrum-tasks [status]` | List tasks, optionally filtered by status |
| `/fulcrum-create <title>` | Create a new task |
| `/fulcrum-run <task_id> <role>` | Start an agent run |
| `/fulcrum-complete <run_id> [summary]` | Mark a run as completed |
| `/fulcrum-block <run_id> <reason>` | Mark a run as blocked |
| `/fulcrum-recall <query>` | Search project memories |
| `/fulcrum-workspaces` | List all workspaces |
| `/cos <goal>` | Inject Chief-of-Staff world-state context into the conversation |

### Native LLM tools (11 tools, no MCP overhead)

| Tool | Description |
|------|-------------|
| `fulcrum_list_tasks` | List tasks in current workspace |
| `fulcrum_create_task` | Create a new task |
| `fulcrum_update_task` | Update task status or add a blocker note |
| `fulcrum_recall_memory` | Semantic search over project memory |
| `fulcrum_write_memory` | Persist a note to project memory |
| `fulcrum_start_run` | Register a new agent run (call at task start) |
| `fulcrum_heartbeat` | Send a heartbeat during long operations |
| `fulcrum_complete_run` | Mark a run as completed |
| `fulcrum_block_run` | Mark a run as blocked, escalate to CoS |
| `fulcrum_workspace_status` | Get full workspace snapshot |
| `fulcrum_build_cos_context` | Build Chief-of-Staff world-state context |

### Policy hook

Every tool call in PI is checked against the Fulcrum policy engine. Currently enforced:
- **Team invocation guard**: only `chief_of_staff` may invoke teams

### Auto-start

On PI session start, the cockpit:
1. Loads config from `.fulcrum.json` (walks up 6 directories)
2. Starts the Fulcrum monitor server (`fulcrum serve monitor`) if not already running
3. Shows a setup wizard on first run if no config file is found
4. Polls workspace status every 5 s

## Configuration

The cockpit reads `.fulcrum.json` from your project root:

```json
{
  "workspace_id": "ws_01ABCDEFGH",
  "project_id": "proj_01ABCDEFGH",
  "monitor_port": 4721
}
```

Environment variable overrides:
- `FULCRUM_WORKSPACE_ID`
- `FULCRUM_PROJECT_ID`
- `FULCRUM_PORT`

## Monitor URLs

After `fulcrum serve monitor` (or auto-start):

| Endpoint | Description |
|----------|-------------|
| `http://localhost:4721/status` | Server health |
| `http://localhost:4721/agents` | All agent runs |
| `http://localhost:4721/board` | Task counts by status |
| `http://localhost:4721/tasks` | Task list |
| `http://localhost:4721/workspaces` | Workspaces |
| `http://localhost:4721/metrics` | Workspace metrics |
| `http://localhost:4721/memory-trace` | Memory entries |

## Multi-runtime sharing

The same Fulcrum monitor server is shared by all three runtimes:

| Runtime | Integration |
|---------|-------------|
| **PI** | This cockpit (native tools + hook) |
| **Claude Code** | `agent-integration/claude/` (MCP + hook) |
| **Gemini CLI** | `agent-integration/gemini/` (MCP + hook) |
