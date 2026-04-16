# Fulcrum Agent OS — opencode Integration

This file configures your connection to the Fulcrum agent control plane when using opencode.

---

## MCP Server

Fulcrum is CLI-first. Prefer `fulcrum action exec <action>` for skills and automation; use the `fulcrum` MCP server as the compatibility surface when opencode needs MCP. It runs as a local stdio process via `fulcrum serve mcp`, and its exposed tool set can be filtered per runtime or agent.

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

Add the following to your opencode config (`~/.config/opencode/config.json` or `.opencode/config.json`):

```json
{
  "mcp": {
    "fulcrum": {
      "command": ["fulcrum", "serve", "mcp"],
      "enabled": true
    }
  }
}
```

---

## Available MCP Tools

All tools are available under the `fulcrum` MCP server namespace.

### Task Management
- `list_tasks` — List tasks in a workspace/project
- `create_task` — Create a new task
- `update_task` — Update task status, title, description, or priority

### Memory
- `recall_memory` — Hybrid semantic search (FTS5 + vector + rerank) over agent memory
- `write_memory` — Store a memory entry with optional tags and importance score

### Agent Runs
- `list_agent_profiles` — List all 24 canonical agent role profiles
- `start_agent_run` — Start a new agent run for a task
- `heartbeat_agent_run` — Send a heartbeat to keep a run alive
- `complete_agent_run` — Mark an agent run as complete with summary and artifacts
- `block_agent_run` — Block a run and request escalation
- `get_agent_run_status` — Get current status of an agent run

### Workspace Context
- `get_workspace_status` — Get workspace health and recent activity
- `build_cos_context` — Build a Chief-of-Staff context summary for a workspace/project

### Agent Definitions
- `create_agent_definition` — Create a custom agent definition
- `update_agent_definition` — Update an existing agent definition
- `get_agent_definition` — Get a specific agent definition
- `list_agent_definitions` — List all agent definitions in a workspace

### Teams
- `create_team_template` — Create a reusable team template
- `list_team_templates` — List team templates
- `invoke_team` — Invoke a team template to start coordinated agent runs
- `list_team_instances` — List active team instances

### Semantic Search
- `search_code` — Search code with semantic similarity

---

## Agent Lifecycle

When operating as part of a Fulcrum-managed workflow:

1. **On session start**: Call `fulcrum action exec get_workspace_status` to understand current state
2. **Before working on a task**: Call `fulcrum action exec start_agent_run` with your role and task_id
3. **During long tasks**: Call `fulcrum action exec heartbeat_agent_run` every few minutes
4. **When blocked**: Call `fulcrum action exec block_agent_run` with a clear reason
5. **On completion**: Call `fulcrum action exec complete_agent_run` with summary and artifact paths

If opencode is invoking Fulcrum through MCP rather than shell commands, use the equivalent compatibility tools from the catalog above.

---

## Role Boundaries

**`chief_of_staff`** (orchestration only):
- Creates tasks, delegates to specialist roles, synthesizes results
- Uses `fulcrum action exec build_cos_context` to orient before every session

**All other roles** (implementation):
- Focus on the assigned task; complete and report via `fulcrum action exec complete_agent_run`
