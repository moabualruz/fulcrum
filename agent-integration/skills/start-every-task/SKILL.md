---
name: start-every-task
description: Register an agent run before touching any code. Applies whenever the agent is about to call Write / Edit / MultiEdit / Bash for the first time in a session, or is targeted by a team invocation.
allowed-tools:
  - mcp__fulcrum__get_current_context
  - mcp__fulcrum__start_agent_run
  - mcp__fulcrum__list_tasks
  - mcp__fulcrum__create_task
  - mcp__fulcrum__list_agent_profiles
---

# Start every task with start_agent_run

Before doing ANY work in a Fulcrum-managed project, call
`mcp__fulcrum__start_agent_run` so the control plane knows you exist. This is
non-negotiable — the WIP limiter and the chief-of-staff context builder both
read from the `agent_runs` table, and a run that was never started cannot be
heartbeated, blocked, or completed.

## When to apply

- The user asks you to "implement X", "fix Y", "refactor Z", or "investigate Q"
- You are about to call `Write` / `Edit` / `MultiEdit` / `Bash` for the first
  time in this session
- You were invoked by a team (the PreToolUse hook has set `FULCRUM_RUN_ID` or
  `FULCRUM_TASK_ID` in env — honor those values instead of creating new ones)
- You transitioned from analysis/read-only mode into mutation mode

## How

Call the MCP tool with the required fields:

```
# Step 1: get workspace_id (no parameters needed)
mcp__fulcrum__get_current_context

# Step 2: start your run
mcp__fulcrum__start_agent_run
  workspace_id: <from get_current_context result>
  task_id:      (from the task you're working on)
  agent_role:   (your canonical role — see list_agent_profiles)
```

The call returns a `run_id`. Keep it in scope for every subsequent
`heartbeat_agent_run`, `complete_agent_run`, or `block_agent_run` call.

### If you don't have a task_id

1. Call `mcp__fulcrum__list_tasks` with a keyword from the user's request to
   check whether a matching task already exists.
2. If none matches, call `mcp__fulcrum__create_task` with a clear title,
   acceptance criteria, and the owning role. Use the returned `task_id`.
3. Never guess a task_id — a run with a bogus task_id will be rejected by the
   policy layer.

### If you don't know your role

Call `mcp__fulcrum__list_agent_profiles` and pick the one whose purpose
matches what you are about to do. Default to `software_engineer` for generic
implementation work; defer to `tech_lead` for architecture, `code_reviewer`
for review, and `integration_worker` for merges.

## Red flags

- You called `Write` / `Edit` without having started a run → stop, call
  `start_agent_run`, then re-do the edit so the tool call is logged against
  the correct run.
- You have more than one `run_id` in flight in the same session → call
  `block_agent_run` on the stale one before starting new work.
- You hit a WIP-limit error → don't loop. See
  [workspace-status-on-session-start](../workspace-status-on-session-start/SKILL.md)
  to diagnose who else is holding the budget.

## Worked example

**Scenario:** The user asks "fix the failing auth test in `packages/auth/src/tests/login.test.ts`".

```
# 1. Discover workspace context
mcp__fulcrum__get_current_context
→ { workspace_id: "ws_abc123", project_id: "proj_xyz" }

# 2. Find or create the task
mcp__fulcrum__list_tasks
  workspace_id: "ws_abc123"
  status: "open"
→ (search result includes) { task_id: "task_001", title: "Fix failing auth login test" }

# 3. Start the run
mcp__fulcrum__start_agent_run
  workspace_id: "ws_abc123"
  task_id: "task_001"
  agent_role: "software_engineer"
→ { run_id: "run_999" }

# 4. Proceed with the fix — run_id is now in scope for heartbeat/complete/block
```

See also: [recall-before-writing](../recall-before-writing/SKILL.md),
[complete-agent-run](../complete-agent-run/SKILL.md).
