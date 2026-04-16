---
name: team-launch
description: Invoke a team template to orchestrate a multi-agent workstream
---

# Team Launch

**Only chief_of_staff may invoke teams.** L2 roles must not call `invoke_team`.

To launch a team:

1. Call `fulcrum action exec list_team_templates` to see available team blueprints.
2. Select the template that matches the work type (e.g. `code-review-team`, `feature-build-team`).
3. Call `fulcrum action exec invoke_team` with `template_id`, `workspace_id`, `project_id`, `task_id`, and any `overrides`.
4. Record the `instance_id` returned and monitor via `fulcrum action exec list_team_instances`.
5. Write a memory with `fulcrum action exec write_memory` documenting why this team was launched and what it's responsible for.
