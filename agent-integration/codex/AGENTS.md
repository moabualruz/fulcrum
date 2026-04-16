# Fulcrum Agent OS — Codex Integration

This file is auto-loaded by OpenAI Codex CLI (`AGENTS.md`). It configures your connection to the Fulcrum agent control plane.

---

## MCP Server

Fulcrum is CLI-first. Skills, hooks, and internal automation should prefer `fulcrum action exec <action>`; the `fulcrum` MCP server is the compatibility surface for runtimes that need MCP. It runs as a local stdio process via `fulcrum serve mcp`, and its exposed tool set can be filtered per runtime or agent.

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

## MCP Configuration

Add the following to `~/.codex/config.toml` (the global Codex config), or run `fulcrum init --codex` to merge it automatically:

```toml
[mcp_servers.fulcrum]
command = "fulcrum"
args = ["serve", "mcp", "--mode", "filtered"]
```

To add via the Codex CLI:

```bash
codex mcp add fulcrum -- fulcrum serve mcp --mode filtered
```

---

## Available MCP Tools

All tools are prefixed `fulcrum__` in Codex.

### Task Management
- `fulcrum__list_tasks` — List tasks in a workspace/project
- `fulcrum__create_task` — Create a new task
- `fulcrum__update_task` — Update task status, title, description, or priority

### Memory
- `fulcrum__recall_memory` — Hybrid semantic search (FTS5 + vector + rerank) over agent memory
- `fulcrum__write_memory` — Store a memory entry with optional tags and importance score

### Agent Runs
- `fulcrum__list_agent_profiles` — List all 24 canonical agent role profiles
- `fulcrum__start_agent_run` — Start a new agent run for a task
- `fulcrum__heartbeat_agent_run` — Send a heartbeat to keep a run alive
- `fulcrum__complete_agent_run` — Mark an agent run as complete with summary and artifacts
- `fulcrum__block_agent_run` — Block a run and request escalation
- `fulcrum__get_agent_run_status` — Get current status of an agent run

### Workspace Context
- `fulcrum__get_workspace_status` — Get workspace health and recent activity
- `fulcrum__build_cos_context` — Build a Chief-of-Staff context summary for a workspace/project

### Agent Definitions
- `fulcrum__create_agent_definition` — Create a custom agent definition
- `fulcrum__update_agent_definition` — Update an existing agent definition
- `fulcrum__get_agent_definition` — Get a specific agent definition
- `fulcrum__list_agent_definitions` — List all agent definitions in a workspace

### Teams
- `fulcrum__create_team_template` — Create a reusable team template
- `fulcrum__list_team_templates` — List team templates
- `fulcrum__invoke_team` — Invoke a team template to start coordinated agent runs
- `fulcrum__list_team_instances` — List active team instances

### Semantic Search
- `fulcrum__search_code` — Search code with semantic similarity

---

## Agent Lifecycle

When operating as part of a Fulcrum-managed workflow:

1. **On session start**: Call `fulcrum action exec get_workspace_status` to understand current state
2. **Before working on a task**: Call `fulcrum action exec start_agent_run` with your role and task_id
3. **During long tasks**: Call `fulcrum action exec heartbeat_agent_run` every few minutes
4. **When blocked**: Call `fulcrum action exec block_agent_run` with a clear reason
5. **On completion**: Call `fulcrum action exec complete_agent_run` with summary and artifact paths

If your Codex runtime is using MCP-native tool calls instead of shell commands, use the equivalent `fulcrum__*` compatibility tools from the catalog above.

---

## Role Boundaries

**`chief_of_staff`** (orchestration only):
- Creates tasks, delegates to specialist roles, synthesizes results
- Uses `fulcrum action exec build_cos_context` to orient before every session

**All other roles** (implementation):
- Focus on the assigned task; complete and report via `fulcrum action exec complete_agent_run`
