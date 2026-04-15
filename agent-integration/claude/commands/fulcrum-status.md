---
description: Show Fulcrum workspace status and active agent runs
---

Call `mcp__fulcrum__get_current_context` (no parameters) to obtain `workspace_id`, then call `mcp__fulcrum__get_workspace_status` with that `workspace_id`. Present the result as a concise status summary covering: active runs, WIP headroom, task counts by status, and any blockers.
