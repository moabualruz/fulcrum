---
description: show recent Fulcrum agent activity log
---

Run via bash and report:
```bash
fulcrum log --limit 20
```

Summarize recent agent activity: timestamps, roles, actions, errors, and blockers.
If a run_id or task_id was specified, filter for it with `--run <run_id>` or `--task <task_id>`.
