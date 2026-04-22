---
description: Create or update a task in Fulcrum
argument-hint: "[title or task_id]"
---

If the argument looks like a task ID (starts with `TSK-` or is a UUID), call `update_task` with the provided ID and any status/description changes requested. Otherwise, create a new task: first call `get_current_context` to obtain `workspace_id` and `project_id`, then call `create_task` with those IDs, `title` set to `$ARGUMENTS`, and `priority` defaulting to `medium`. Report the created or updated task ID.
