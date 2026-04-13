# PI Agent OS Cockpit

Full control-plane dashboard for the [PI coding agent](https://shittycodingagent.ai),
with a shared backend for Claude Code and Gemini CLI.

## What it does

- **Live dashboard widget** — active runs (role, progress %, step), blocked agents, WIP count, server status
- **Footer status** — quick-glance `● PI-OS  N run  N blocked  WIP:N  :PORT`
- **Monitor link** — always-visible `http://127.0.0.1:4721/docs` in widget header
- **Setup wizard** — first-run prompts: workspace ID, project ID, port → writes `.pi-os.json`
- **Auto-starts** the PI Agent OS monitor + control API server on session start
- **Slash commands** — task management, run lifecycle, memory, CoS dispatch
- **LLM tools** — all 11 control-plane operations as native `pi_os_*` tools
- **Policy hook** — every tool call passes through the pi-os policy engine

## Install

```bash
# From the repo root (local):
pi install ./agent-integration/pi/cockpit

# From git (whole repo, includes Claude + Gemini integrations):
pi install git:github.com/<you>/pi-stack-plan

# From npm (once published):
pi install npm:pi-os-cockpit
```

On first start the setup wizard runs automatically and creates `.pi-os.json`.
Re-run anytime with `/pi-setup`.

## Requirements

- Python 3.12+ with `pi_agent_os` installed
- From the repo root: `uv sync`
- The wizard checks this and guides you if it is missing

## Config

`.pi-os.json` in your project root (the wizard creates it):

```json
{
  "workspace_id": "ws_01JR...",
  "project_id": "proj_01JR...",
  "monitor_port": 4721
}
```

Env-var overrides: `PI_OS_WORKSPACE_ID`, `PI_OS_PROJECT_ID`, `PI_OS_PORT`

## Multi-agent cockpit

All three CLI agents share the same Python backend:

| Agent | Integration | Cockpit access |
|---|---|---|
| PI | `cockpit/index.ts` — TUI widget, tools, commands | Full TUI dashboard |
| Claude Code | `agent-integration/claude/` — CLAUDE.md, .mcp.json | 13 MCP tools (`mcp__pi-os__*`) |
| Gemini CLI | `agent-integration/gemini/` — GEMINI.md, hook | 13 MCP tools (`mcp_pi-os_*`) |

When PI's cockpit is open and Claude Code or Gemini is running in another window,
all three write to the same monitor server — their runs appear in the PI dashboard.

## Slash commands

| Command | Description |
|---|---|
| `/pi-setup` | (Re-)run the setup wizard |
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

| Tool | Purpose |
|---|---|
| `pi_os_list_tasks` | List tasks |
| `pi_os_create_task` | Create a task |
| `pi_os_update_task` | Update status/note/assignment |
| `pi_os_recall_memory` | Semantic memory recall |
| `pi_os_write_memory` | Persist a memory note |
| `pi_os_start_run` | Register an agent run (returns run_id) |
| `pi_os_heartbeat` | Send heartbeat (current_step, progress_pct) |
| `pi_os_complete_run` | Mark run done |
| `pi_os_block_run` | Mark run blocked |
| `pi_os_workspace_status` | Full status snapshot |
| `pi_os_build_cos_context` | CoS world-state markdown |

## Monitor URLs

| Path | Description |
|---|---|
| `http://127.0.0.1:4721/docs` | Interactive API docs |
| `http://127.0.0.1:4721/api/v1/status?workspace_id=...` | Global status |
| `http://127.0.0.1:4721/api/v1/agents?workspace_id=...` | Agent fleet |
| `http://127.0.0.1:4721/api/v1/board?workspace_id=...` | Project board |
| `http://127.0.0.1:4721/api/v1/events/stream?workspace_id=...` | SSE event stream |
| `http://127.0.0.1:4721/api/v1/analytics/summary?workspace_id=...` | Analytics |
