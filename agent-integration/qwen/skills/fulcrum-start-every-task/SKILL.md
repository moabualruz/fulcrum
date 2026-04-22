---
name: fulcrum-start-every-task
description: >-
  Register agent run before touching code. Applies before first
  Write/Edit/MultiEdit/Bash in session, or when targeted by team invocation.
---
# Start every task with start_agent_run

Before ANY work in Fulcrum-managed project, call `fulcrum action exec start_agent_run`. Control plane must know agent exists. Non-negotiable — WIP limiter + CoS context builder both read `agent_runs`; run never started cannot be heartbeated, blocked, or completed.

## When

- User says "implement X", "fix Y", "refactor Z", "investigate Q".
- About to call `Write`/`Edit`/`MultiEdit`/`Bash` first time this session.
- Invoked by team (PreToolUse hook set `FULCRUM_RUN_ID` / `FULCRUM_TASK_ID` in env — honor those, do not create new).
- Transitioned from read-only to mutation mode.

## How

```bash
# Step 1: workspace_id (no params)
fulcrum action exec get_current_context

# Step 2: start run
fulcrum action exec start_agent_run --json '{
  "workspace_id": "ws_123",
  "task_id": "task_123",
  "agent_role": "software_engineer"
}'
```

Returns `run_id`. Keep in scope for every `heartbeat_agent_run` / `complete_agent_run` / `block_agent_run`.

### No task_id

1. `fulcrum action exec list_tasks` with keyword from user request — check for match.
2. No match → `fulcrum action exec create_task` with title + acceptance + owning role. Use returned `task_id`.
3. Never guess `task_id`. Bogus id = policy-layer reject.

### Unknown role

`fulcrum action exec list_agent_profiles`, pick by purpose. Default `software_engineer` for generic impl; `tech_lead` for architecture; `code_reviewer` for review; `integration_worker` for merges.

## Red flags

- Called `Write`/`Edit` without starting run → stop, `start_agent_run`, redo edit so tool call logs against correct run.
- Multiple `run_id` in flight same session → `block_agent_run` stale one before new work.
- WIP-limit error → do not loop. See [workspace-status-on-session-start](../workspace-status-on-session-start/SKILL.md) to diagnose budget holder.

## Worked example

User: "fix the failing auth test in `packages/auth/src/tests/login.test.ts`".

```
# 1. Discover workspace context
fulcrum action exec get_current_context
→ { workspace_id: "ws_abc123", project_id: "proj_xyz" }

# 2. Find or create task
fulcrum action exec list_tasks
  workspace_id: "ws_abc123"
  status: "open"
→ { task_id: "task_001", title: "Fix failing auth login test" }

# 3. Start run
fulcrum action exec start_agent_run
  workspace_id: "ws_abc123"
  task_id: "task_001"
  agent_role: "software_engineer"
→ { run_id: "run_999" }

# 4. Proceed with fix — run_id in scope for heartbeat/complete/block
```

See also: [recall-before-writing](../recall-before-writing/SKILL.md), [complete-agent-run](../complete-agent-run/SKILL.md).
