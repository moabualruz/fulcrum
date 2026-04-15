# @fulcrum/cli

Command-line interface and MCP server for Fulcrum. Entry point for all agent runtimes (Claude Code, Gemini CLI, Codex, opencode, PI).

## Commands

```
fulcrum
├── serve
│   ├── mcp          stdio MCP server — 13 control-plane tools
│   ├── mcp-http     HTTP MCP server (StreamableHTTP, default port 4722)
│   ├── monitor      HTTP monitor + control API (default port 4721)
│   └── all          both MCP + monitor
│
├── doctor [--json]  environment health check — 8 checks, exits 1 on FAIL
│
├── task             create / list / get / update tasks
├── issue            create / list / get / update issues
├── epic             create / list / get epics
├── board            show kanban board
├── queue            merge / review queue operations
├── sync             push / pull / status for Plane sync
├── team             create / list / invoke / instances
├── workflow         start / run / status / resume workflows
├── agent            list / status / spawn agent runs
├── workspaces       list / create workspaces
├── projects         list / create projects
├── memory           init / accelerate / rebuild / status
│
├── hook
│   ├── claude       Claude Code PreToolUse hook
│   ├── gemini       Gemini CLI BeforeTool hook
│   └── pi           PI BeforeTool hook
│
└── --version / version
```

All commands accept `--json` for machine-readable output.

## MCP tools (13)

| Tool | Description |
|------|-------------|
| `list_tasks` | List tasks in a workspace/project |
| `create_task` | Create a task |
| `update_task` | Update task status/title/assignment |
| `recall_memory` | Hybrid semantic + keyword search (optional `max_chars`) |
| `write_memory` | Store a memory entry |
| `list_agent_profiles` | List 24 canonical role profiles |
| `get_agent_run_status` | Get run status |
| `start_agent_run` | Start an agent run |
| `heartbeat_agent_run` | Heartbeat a run |
| `complete_agent_run` | Complete a run with artifacts |
| `block_agent_run` | Block a run for escalation |
| `build_cos_context` | Build Chief-of-Staff context block |
| `get_workspace_status` | Workspace health + recent activity |

## Auto-init

Every `fulcrum` command auto-initializes the current directory as a Fulcrum project on first run. Creates `.fulcrum.json` with deterministic `workspace_id`/`project_id` derived from the absolute path, plus a global SQLite DB at `$FULCRUM_DATA_DIR` (default `~/.local/share/fulcrum`).

## Plugin discovery

Fulcrum discovers plugins via `package.json` manifest keys. Any installed npm package with `"fulcrum": { "type": "plugin" }` is loaded automatically on server start. Plugins can register additional MCP tools, adapters, and workflow step handlers.

## Hook system

Install the PreToolUse hook to get audit logging and policy enforcement on every tool call:

```bash
pnpm run setup:claude   # installs Claude Code hook + MCP registration
pnpm run setup:gemini   # installs Gemini CLI extension
pnpm run setup:pi       # installs PI cockpit extension
```

Hooks read a tool-call JSON from stdin, normalise the event format across runtimes, log a `hook_executed` event, and enforce the `chief_of_staff_no_direct_writes` invariant.

### Hook isolation model (GAP-PLUGIN-6)

**Current trust level: full in-process.** Hook modules (`hook claude`, `hook gemini`, `hook pi`) run as Node.js child processes spawned by the agent runtime, not as dynamically-loaded in-process modules. Each hook invocation is a short-lived process that:

1. Receives the tool-call event on **stdin** (never directly touches the DB connection of the parent).
2. Calls back into the Fulcrum MCP server via the standard JSON-RPC stdio transport if it needs to read/write state — going through the same policy gate as any other caller.
3. Exits after processing one event; the agent runtime waits for exit code 0 (allow) or non-zero (block).

**Consequences:**
- A buggy or malicious hook cannot corrupt the in-process DB connection or memory state of the parent process.
- A hook CAN read any file accessible to the user running the agent (it runs with the same OS privileges).
- There is no sandboxing of filesystem or network access; operators must trust hook modules they install.

**Roadmap:** A future release will add a manifest-level `trust` declaration (`"trust": "sandboxed"`) and optionally run hook processes inside a seccomp/landlock container on Linux. For now, treat hook modules the same as any other local CLI tool: install only from trusted sources.
