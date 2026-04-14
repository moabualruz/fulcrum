---
name: create-plan
description: Generate a structured implementation plan from a PRD or issue
triggers:
  - planning implementation from requirements
  - breaking down a PRD into tasks
  - generating issue decomposition
---

# Create Plan

To generate an implementation plan:

1. Recall relevant memories first: `mcp__fulcrum__recall_memory` with the PRD or issue title as query.
2. Identify the PRD or issue: call `mcp__fulcrum__list_tasks` to find the parent issue or PRD ID.
3. Decompose into concrete, testable tasks. Each task should:
   - Be completable by one agent in one session
   - Have a clear done criterion
   - Reference the files or systems it touches
4. Create each task with `mcp__fulcrum__create_task`, setting `assigned_to` to the appropriate role.
5. Write a `summary` memory capturing the plan rationale with `mcp__fulcrum__write_memory` (`kind: "summary"`).
