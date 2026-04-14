---
description: Show Fulcrum workspace status and active agent runs
---

Call `mcp__fulcrum__get_workspace_status` with `workspace_id` read from `.fulcrum.json` in the current directory (or `$FULCRUM_WORKSPACE_ID` env var if set). Present the result as a concise status summary covering: active runs, WIP headroom, task counts by status, and any blockers.
