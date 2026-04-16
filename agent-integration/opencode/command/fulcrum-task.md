---
description: create or list Fulcrum tasks for the current project
---

Run via bash and report:

```bash
fulcrum task list --json
```

If the user wants to list tasks, show the results with id, title, status, and priority.

If the user wants to create a task, run:
```bash
fulcrum task create --title "<title>" [--priority low|medium|high|critical] [--assigned-to <role>]
```
Confirm the task was created by echoing the returned task_id.

If the user wants to update a task, run:
```bash
fulcrum task update --id <task_id> --status <status>
```
