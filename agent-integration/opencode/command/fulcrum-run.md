---
description: manage Fulcrum agent run lifecycle (start, heartbeat, complete, block)
---

Manage agent run lifecycle for the current task. Run the relevant command via bash:

**Start a run** (call at the beginning of every task):
```bash
fulcrum action exec start_agent_run --json '{"agent_role":"software_engineer","task_id":"task_XXX"}'
```

**Send heartbeat** during long work (every ~30 s):
```bash
fulcrum action exec heartbeat_agent_run --json '{"run_id":"run_XXX","current_step":"Running tests","progress_pct":60}'
```

**Complete a run**:
```bash
fulcrum action exec complete_agent_run --json '{"run_id":"run_XXX","output_summary":"What was done","artifact_paths":["path/to/file"]}'
```

**Block a run** (needs human input):
```bash
fulcrum action exec block_agent_run --json '{"run_id":"run_XXX","reason":"Need DB schema decision before proceeding"}'
```

Execute the action the user requested, or show current runs with:
```bash
fulcrum action exec get_workspace_status
```
