---
name: fulcrum-start-task
description: Register this session as a Fulcrum agent run before starting work
---

Before starting work on a task:

1. `fulcrum action exec get_current_context` — get workspace_id + project_id
2. `fulcrum action exec start_agent_run --role software_engineer --task_id <task_id>`
3. Save the returned `run_id` for heartbeats and completion
