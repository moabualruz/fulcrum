---
name: delegate-task
description: Create and assign a task to another agent role
triggers:
  - need to assign work to a specialist
  - breaking down a large task
  - parallel workstreams needed
version: 1.0.0
author: fulcrum
---

# Delegate Task

To delegate work to another agent role:

1. Call `mcp__fulcrum__create_task` with `workspace_id`, `project_id`, a clear `title`, detailed `description` (goal, inputs, done criteria), `priority`, and `assigned_to` set to the target role slug (e.g. `software_engineer`, `qa_engineer`).
2. Write a memory with `mcp__fulcrum__write_memory` recording the delegation decision: why this task was split off, what the parent task is, and what the dependency relationship is.
3. Call `mcp__fulcrum__get_workspace_status` to confirm WIP headroom before delegating — don't delegate if the workspace is at WIP limit.

**Only chief_of_staff delegates between agents.** L2 roles complete their task; they don't spawn new agent workstreams.
