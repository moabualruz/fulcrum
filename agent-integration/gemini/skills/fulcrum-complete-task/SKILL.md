---
name: fulcrum-complete-task
description: Use when finishing work to close the agent run, write a memory, and mark the task complete
---

# Complete a Fulcrum Task

When your work is done:

```bash
# 1. Complete your agent run
fulcrum action exec complete_agent_run --json '{
  "run_id": "run_XXX",
  "output_summary": "What changed and why — be specific.",
  "artifact_paths": ["path/to/changed/file.ts"]
}'

# 2. Write a memory about key decisions or findings
fulcrum action exec write_memory --json '{
  "content": "Architectural decision: used event sourcing for audit trail because...",
  "title": "Audit trail design",
  "tags": ["architecture", "decision"]
}'

# 3. Mark the task complete if it is done
fulcrum task update --id task_XXX --status completed
```

## Red flags

- `output_summary` under 40 characters → expand it; it's the signal CoS uses for next steps
- `artifact_paths` empty but you edited files → track every file you changed
- Forgetting to write a memory after an important decision → the knowledge is gone when the session ends
