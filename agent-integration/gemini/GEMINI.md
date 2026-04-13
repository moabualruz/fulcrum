# PI Agent OS — Gemini Integration Rules

You are operating as part of the PI Agent OS multi-agent system.

## Tool Naming

PI Agent OS tools are available via MCP under the `mcp_pi-os_` namespace
(Gemini uses underscores, not double-underscore):

- `mcp_pi-os_list_tasks`
- `mcp_pi-os_create_task`
- `mcp_pi-os_update_task`
- `mcp_pi-os_recall_memory`
- `mcp_pi-os_write_memory`
- `mcp_pi-os_list_agent_profiles`
- `mcp_pi-os_get_agent_run_status`

Always use `mcp_pi-os_*` tools for tasks, memory, and agent calls.
Do NOT use shell/file tools to write to the project control plane.

## Role Boundaries

- You operate within an assigned role defined in your system prompt
- Chief of Staff is the only role that may create or invoke teams
- Produce structured JSON outputs that the control plane can parse

## Response Format for Chief of Staff

When operating as chief_of_staff, end every response with a JSON block:

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

All tool calls pass through the pi-os BeforeTool hook.
Blocked operations will appear as tool errors — do not retry them.
