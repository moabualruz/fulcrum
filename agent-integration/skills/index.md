---
name: skills
description: Table of contents for Fulcrum skills. Browse first when landing in a Fulcrum-managed workspace.
---

# Fulcrum Skills — Index

Skills teach agents how to interact with Fulcrum control plane (hooks first, CLI actions second, MCP only when required). Each skill scoped to trigger condition via frontmatter `description`; Claude Code surfaces relevant skill automatically.

## Lifecycle order (within session)

1. [workspace-status-on-session-start](./workspace-status-on-session-start/SKILL.md)
2. [recall-before-writing](./recall-before-writing/SKILL.md)
3. [start-every-task](./start-every-task/SKILL.md)
4. [heartbeat-during-long-operations](./heartbeat-during-long-operations/SKILL.md)
5. [block-when-stuck](./block-when-stuck/SKILL.md) (if applicable)
6. [complete-agent-run](./complete-agent-run/SKILL.md)
7. [write-memory-on-completion](./write-memory-on-completion/SKILL.md)

## Full table

| Skill | When |
|-------|------|
| [start-every-task](./start-every-task/SKILL.md) | Before any Write/Edit/Bash |
| [recall-before-writing](./recall-before-writing/SKILL.md) | Before writing new code/docs/decisions |
| [complete-agent-run](./complete-agent-run/SKILL.md) | Finishing work with real summary |
| [block-when-stuck](./block-when-stuck/SKILL.md) | Can't proceed, would otherwise guess |
| [workspace-status-on-session-start](./workspace-status-on-session-start/SKILL.md) | Very start of session |
| [chief-of-staff-response-format](./chief-of-staff-response-format/SKILL.md) | Every CoS turn |
| [write-memory-on-completion](./write-memory-on-completion/SKILL.md) | After decision/trade-off/finding |
| [integration-worker-merge-gate](./integration-worker-merge-gate/SKILL.md) | Merge attempt as integration_worker |
| [invoke-team-only-from-cos](./invoke-team-only-from-cos/SKILL.md) | Non-CoS tempted to `invoke_team` |
| [run-workflow-not-freestyle](./run-workflow-not-freestyle/SKILL.md) | Named multi-step (PRD, plan, grill-me) |
| [secret-hygiene](./secret-hygiene/SKILL.md) | Tool call with credentials |
| [heartbeat-during-long-operations](./heartbeat-during-long-operations/SKILL.md) | Run >~60s |

## Quick reference

- **Start** → `fulcrum action exec start_agent_run`
- **Context** → `fulcrum action exec recall_memory` + `fulcrum action exec get_workspace_status`
- **Long-running** → `fulcrum action exec heartbeat_agent_run`
- **Stuck** → `fulcrum action exec block_agent_run`
- **Done** → `fulcrum action exec complete_agent_run` + `fulcrum action exec write_memory`
- **CoS only** → `fulcrum action exec invoke_team`, `fulcrum action exec build_cos_context`
- **Merge** → `integration_worker` only, after review + tests pass

## Skill Frontmatter

```yaml
---
name: <kebab-case-id>          # required — unique, stable
description: <one-liner>       # required — Claude Code filters by this; be specific
version: 1.0.0                 # required — semver; bump on breaking change
author: fulcrum                # required — "fulcrum" for built-ins
user-invocable: true | false   # optional — false = auto-trigger only
triggers:                      # optional
  - before_tool_use            #   PreToolUse hook match
  - session_start              #   SessionStart hook
  - on_demand                  #   explicit /invoke (implies user-invocable: true)
input:                         # optional
  description: "When/how invoked."
  fields:
    - name: some_field
      type: string
      required: false
      description: "What it means."
output:                        # optional
  artifact: run_id             # run_id | memory_id | report | commit_sha
  description: "What the skill returns or persists."
---
```

**`triggers`**:

| Value | When |
|---|---|
| `before_tool_use` | PreToolUse fires + `description` matches |
| `session_start` | SessionStart fires |
| `on_demand` | User types `/skill-name` |
| *(omitted)* | Description-match only |

## Notes

- Cross-links use relative paths — directory portable between `agent-integration/skills/` and `~/.claude/skills/`.
- Red flags in each skill = fastest self-audit.
- **Style**: caveman mode. Drop articles/filler/hedging. Fragments OK. Technical terms exact. Code blocks unchanged. Errors quoted exact.
