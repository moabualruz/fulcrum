---
name: fulcrum-policy-check
description: Verify action permitted by current workspace policy before executing.
---
# Policy Check

Before any consequential action (spawn, merge, invoke team):

1. `fulcrum action exec get_workspace_status` with `workspace_id` → read `wip_headroom`, `active_runs`, `policy`.
2. Check WIP headroom before spawning. `wip_headroom <= 0` → do not spawn.
3. Team invocations: only `chief_of_staff` may `invoke_team`. Verify role first.
4. Secret-containing inputs: never pass credentials in tool inputs. PreToolUse hook blocks anyway. Avoid situation.
5. Policy would block → `fulcrum action exec block_agent_run` instead of working around.
