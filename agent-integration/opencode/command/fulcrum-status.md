---
description: show Fulcrum workspace status (active agents, blockers, WIP, queued tasks)
agent: fulcrum-status
---

Run via bash and report:

```bash
fulcrum action exec get_current_context
fulcrum action exec get_workspace_status
```

Show: workspace_id, active agent runs, blocked runs, WIP count, queued tasks.
Highlight blocked runs prominently with their block reason.
