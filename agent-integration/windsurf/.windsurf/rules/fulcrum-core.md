---
trigger: always_on
description: Fulcrum agent OS — lifecycle, recall-before-search bias, role boundaries. Always applied.
---

# Fulcrum Agent OS

Fulcrum is your local-first agent control plane. All MCP tools are available via the `fulcrum` MCP server.

## Workspace Context

Workspace and project IDs are derived automatically from the current directory. No explicit init required — any `fulcrum` command auto-initializes the workspace on first run.

## Available MCP Tools

Key tools: `get_current_context`, `list_tasks`, `create_task`, `update_task`, `start_agent_run`, `heartbeat_agent_run`, `complete_agent_run`, `block_agent_run`, `recall_memory`, `write_memory`, `build_cos_context`, `get_workspace_status`.

## Agent Lifecycle

When working on a task:
1. Call `get_current_context` to get workspace_id and project_id
2. Call `start_agent_run` with your role and task_id
3. Call `heartbeat_agent_run` every few minutes on long tasks
4. Call `complete_agent_run` when done, or `block_agent_run` if blocked

## Recall Before Writing

Before producing novel output (new code, docs, decisions), search Fulcrum memory:

```
fulcrum action exec recall_memory query="what you are about to do"
```

Skipping = reinventing wheel or contradicting prior agent decisions.

## Role Boundaries

- `chief_of_staff`: orchestration only — creates tasks, delegates, MUST NOT write code
- All other roles: implementation only — MUST NOT invoke teams or create sub-orchestration

## Notes

- Monitor dashboard: http://localhost:4721 (when `fulcrum serve monitor` is running)
- Hook-based passive trace harvesting uses `.windsurf/hooks.json` events
