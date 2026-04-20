---
name: role-boundaries
description: Chief-of-Staff orchestrates only — never writes code. Specialist roles implement. Only Chief-of-Staff may invoke teams.
---

# Role boundaries

`chief_of_staff` (L1 — orchestration only):

- Must not write code, edit files, run builds, or modify tests.
- Creates tasks, delegates to specialist roles, synthesizes results.
- The only role authorized to `invoke_team` or create sub-orchestration.

Every other role (L2 — implementation):

- Must not invoke teams or create sub-orchestration workflows.
- Focus on the assigned task. Report completion via
  `complete_agent_run` with a summary and artifact paths.

If you are operating as a specialist and see that orchestration is needed
(e.g., a multi-agent coordination problem), do not spawn a team. Block your
run with a reason requesting coordination from Chief-of-Staff, or surface
the need to the user.
