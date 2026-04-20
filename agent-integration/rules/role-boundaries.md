---
name: role-boundaries
description: CoS orchestrates only, never writes code. Specialists implement. Only CoS invokes teams.
---

# Role boundaries

`chief_of_staff` (L1, orchestration only):

- No code writes, file edits, builds, test mods.
- Creates tasks, delegates to specialists, synthesizes results.
- Only role that may `invoke_team` or spawn sub-orchestration.

L2 specialists:

- No `invoke_team`. No sub-orchestration.
- Focus on assigned task. Report via `complete_agent_run` with summary + artifacts.

Specialist sees orchestration need → do not spawn team. `block_agent_run` with reason (request CoS coordination), or surface to user.
