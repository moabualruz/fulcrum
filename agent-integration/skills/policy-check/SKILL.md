---
name: policy-check
description: Verify an action is permitted by the current workspace policy before executing
triggers:
  - about to take a consequential action
  - spawning agents
  - merging branches
  - invoking teams
version: 1.0.0
author: fulcrum
---

# Policy Check

Before taking any consequential action (spawn, merge, invoke team):

1. Call `mcp__fulcrum__get_workspace_status` with `workspace_id` to read current policy state: `wip_headroom`, `active_runs`, and `policy`.
2. Check WIP headroom before spawning agents — if `wip_headroom <= 0`, do not spawn.
3. For team invocations: only `chief_of_staff` may call `invoke_team`. Verify your role before attempting.
4. For secret-containing inputs: never pass credentials in tool inputs. The `fulcrum hook claude pre` hook will block them, but avoid the situation entirely.
5. If policy would block the action, escalate via `mcp__fulcrum__block_agent_run` rather than attempting to work around it.
