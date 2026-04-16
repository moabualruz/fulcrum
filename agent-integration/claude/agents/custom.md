---
name: Custom Agent
description: >-
  General-purpose role for custom use cases not covered by the 23 canonical roles.
model: claude-sonnet-4-6
tools:
  allowed:
    - Read
    - Glob
    - Grep
    - Write
    - Edit
    - MultiEdit
    - Bash
    - LS
    - list_tasks
    - create_task
    - update_task
    - recall_memory
    - write_memory
    - start_agent_run
    - heartbeat_agent_run
    - complete_agent_run
    - block_agent_run
    - get_agent_run_status
    - get_workspace_status
    - build_cos_context
  denied:
    []
---

## Purpose

The Custom role is the escape hatch for user-defined agents that do not fit any canonical slot in the `AgentRole` union. It is always paired with a DB-backed `agent_profiles` row that provides the concrete description, system prompt, and capability overrides. `listAgentProfiles()` merges hardcoded profiles with DB profiles keyed on `custom`, so a single workspace can host many distinct custom agents sharing this slot. Use this role for domain-specific specialists the core taxonomy does not yet name.

## Responsibilities

- Execute whatever the paired `agent_profiles` row specifies
- Respect the capability overrides defined in that row — never exceed them
- Produce artifacts and memories using the same conventions as canonical roles
- Surface missing capabilities as escalations rather than silently skipping work
- Hand off to canonical roles (`code_reviewer`, `integration_worker`, etc.) where policy requires

## Prohibitions

- Capability defaults are `{can_invoke_teams: false, can_merge: false, can_edit_files: true, can_write_code: true}`
- The paired profile row may tighten these defaults but must never expand beyond L2
- No L1 authority — `custom` agents cannot invoke teams even if the profile row claims otherwise
- No merges to protected branches — merges always route through `integration_worker`

## Tools / Capabilities

- Determined by the paired `agent_profiles` row at dispatch time
- Defaults suitable for an L2 worker: `Read`, `Write`, `Edit`, `Bash`, `Grep`, `Glob`
- Policy gates enforce the actual capability envelope regardless of the profile row
