# PI Agent OS — PI Integration Rules

You are operating as part of the PI Agent OS multi-agent system.
All PI Agent OS control plane tools are available natively — no external calls needed.

## MCP Tool Namespace

PI Agent OS tools are available under the `mcp__pi-os__` namespace:

### Task Management
- `mcp__pi-os__list_tasks` — list tasks for a project (filtered by status)
- `mcp__pi-os__create_task` — create a new task in the project
- `mcp__pi-os__update_task` — update task status, add a note/blocker, or reassign

### Memory
- `mcp__pi-os__recall_memory` — semantic/lexical recall from project memory store
- `mcp__pi-os__write_memory` — persist a memory note to the project store

### Agent Profiles
- `mcp__pi-os__list_agent_profiles` — list available PI roles
- `mcp__pi-os__get_agent_run_status` — check live status of a running agent run

### Lifecycle (called by PI runtime, not the LLM)
- `mcp__pi-os__start_agent_run` — register a new agent run at task start
- `mcp__pi-os__heartbeat_agent_run` — send a heartbeat every ~30s
- `mcp__pi-os__complete_agent_run` — mark run completed with output summary
- `mcp__pi-os__block_agent_run` — mark run blocked with a reason
- `mcp__pi-os__build_cos_context` — build world-state snapshot for chief_of_staff
- `mcp__pi-os__get_workspace_status` — full workspace status in one call

Do NOT use file or bash tools to interact with the control plane.
Always use `mcp__pi-os__*` tools for tasks, memory, and agent calls.

## Role Boundaries

- Each agent runs within an assigned role: `chief_of_staff`, `implementer`, `tester`, `reviewer`, `researcher`, etc.
- Only `chief_of_staff` may create or invoke teams
- Do not skip task creation for non-trivial work (more than one atomic step, or produces a durable artifact)
- Produce structured outputs the control plane can parse

## PI Runtime Lifecycle Integration

PI should call lifecycle tools at these points:

```
task assigned to PI role
  └─► mcp__pi-os__start_agent_run(task_id, agent_role, workspace_id, ...)
        → returns { run_id }

while running:
  every ~30s → mcp__pi-os__heartbeat_agent_run(run_id, workspace_id, current_step, progress_pct)

on success:
  → mcp__pi-os__complete_agent_run(run_id, workspace_id, output_summary, artifact_paths)

on blocker:
  → mcp__pi-os__block_agent_run(run_id, workspace_id, reason)
```

When dispatching a `chief_of_staff` agent, first call `build_cos_context` and inject
`context_markdown` into the agent's system prompt for stateless world-state coherence.

## Response Format for Chief of Staff

When operating as `chief_of_staff`, end every response with a JSON block:

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

Fields:
- `create_tasks`: list of `{ title, description, priority, assigned_to, done_criteria }`
- `update_tasks`: list of `{ task_id, status?, note?, assigned_to? }`
- `memory_notes`: list of strings to persist
- `done`: `true` when the goal is fully decomposed and all tasks are created

## Security

All tool calls pass through the pi-os policy engine before execution.
If a tool call is blocked, the reason appears as a tool error — do not retry blocked operations.
Secret patterns (API keys, tokens) are automatically intercepted — never pass secrets as tool arguments.

## Context IDs

Always pass `workspace_id` and `project_id` when calling task and memory tools.
These are injected by the PI runtime into the agent's initial context as `PI_WORKSPACE_ID`
and `PI_PROJECT_ID` environment variables or system prompt fields.
