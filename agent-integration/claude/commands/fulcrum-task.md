---
description: Create or update a task in Fulcrum
argument-hint: "[title or task_id]"
---

If the argument looks like a task ID (starts with `TSK-` or is a UUID), call `mcp__fulcrum__update_task` with the provided ID and any status/description changes requested. Otherwise, create a new task: call `mcp__fulcrum__create_task` with `workspace_id` from `.fulcrum.json`, `title` set to `$ARGUMENTS`, and `priority` defaulting to `medium`. Report the created or updated task ID.
