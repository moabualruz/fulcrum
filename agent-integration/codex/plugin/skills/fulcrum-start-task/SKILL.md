---
name: fulcrum-start-task
description: Use when starting any new task or work assignment to register it in Fulcrum and track the agent run lifecycle
---

# Start Task in Fulcrum

When beginning a task:

```bash
# 1. Get workspace context (auto-detected from $CWD)
fulcrum action exec get_current_context

# 2. Find or create the task
fulcrum task list --json                              # check existing tasks
fulcrum task create --title "Fix auth regression"    # or create one

# 3. Start your agent run
fulcrum action exec start_agent_run --json '{"agent_role":"software_engineer","task_id":"task_XXX"}'
```

Save the returned `run_id`.

## During long operations (every ~30 s)

```bash
fulcrum action exec heartbeat_agent_run --json '{"run_id":"run_XXX","current_step":"Running tests","progress_pct":60}'
```

## On completion

```bash
fulcrum action exec complete_agent_run --json '{
  "run_id": "run_XXX",
  "output_summary": "Fixed auth regression — tests pass",
  "artifact_paths": ["packages/auth/src/login.ts"]
}'
```

## If blocked

```bash
fulcrum action exec block_agent_run --json '{"run_id":"run_XXX","reason":"Need DB schema decision before proceeding"}'
```

Omit `task_id` if no task exists — Fulcrum creates a stub task automatically.
