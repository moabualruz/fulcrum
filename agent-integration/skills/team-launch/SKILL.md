---
name: team-launch
description: Invoke a team template to orchestrate a multi-agent workstream
triggers:
  - launching a multi-agent team
  - complex task requiring multiple specialists
  - chief_of_staff orchestration
version: 1.0.0
author: fulcrum
user-invocable: true
allowed-tools:
  - mcp__fulcrum__list_team_templates
  - mcp__fulcrum__invoke_team
  - mcp__fulcrum__list_team_instances
  - mcp__fulcrum__write_memory
---

# Team Launch

**Only chief_of_staff may invoke teams.** L2 roles must not call `invoke_team`.

To launch a team:

1. Call `mcp__fulcrum__list_team_templates` to see available team blueprints.
2. Select the template that matches the work type (e.g. `code-review-team`, `feature-build-team`).
3. Call `mcp__fulcrum__invoke_team` with `template_id`, `workspace_id`, `project_id`, `task_id`, and any `overrides`.
4. Record the `instance_id` returned and monitor via `mcp__fulcrum__list_team_instances`.
5. Write a memory with `mcp__fulcrum__write_memory` documenting why this team was launched and what it's responsible for.
