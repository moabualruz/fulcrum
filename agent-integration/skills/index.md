---
name: fulcrum-skills-index
description: Table of contents for the Fulcrum Claude Skills directory. Browse this first when you land in a Fulcrum-managed workspace for the first time.
---

# Fulcrum Skills — Index

These skills teach Claude Code agents how to interact with the Fulcrum
control plane (hooks first, CLI actions second, MCP only when required) in the right order and at the
right moments. When a skill needs to force a concrete path, it should use explicit shell commands like `fulcrum action exec ...`. Every skill is scoped to a specific trigger condition via
its frontmatter `description`; Claude Code surfaces the relevant skill
automatically when that condition is met.

## Lifecycle order

The skills are most useful in roughly this order within a session:

1. [workspace-status-on-session-start](./workspace-status-on-session-start/SKILL.md)
2. [recall-before-writing](./recall-before-writing/SKILL.md)
3. [start-every-task](./start-every-task/SKILL.md)
4. [heartbeat-during-long-operations](./heartbeat-during-long-operations/SKILL.md)
5. [block-when-stuck](./block-when-stuck/SKILL.md) (if applicable)
6. [complete-agent-run](./complete-agent-run/SKILL.md)
7. [write-memory-on-completion](./write-memory-on-completion/SKILL.md)

## Full table

| Skill | When to apply |
|-------|---------------|
| [start-every-task](./start-every-task/SKILL.md) | Before any Write/Edit/Bash call |
| [recall-before-writing](./recall-before-writing/SKILL.md) | Before writing new code, docs, or decisions |
| [complete-agent-run](./complete-agent-run/SKILL.md) | When finishing work with a real summary |
| [block-when-stuck](./block-when-stuck/SKILL.md) | When you can't proceed and would otherwise guess |
| [workspace-status-on-session-start](./workspace-status-on-session-start/SKILL.md) | At the very start of a session |
| [chief-of-staff-response-format](./chief-of-staff-response-format/SKILL.md) | Every CoS turn — structured handoff block |
| [write-memory-on-completion](./write-memory-on-completion/SKILL.md) | After completing a decision/trade-off/finding |
| [integration-worker-merge-gate](./integration-worker-merge-gate/SKILL.md) | Before any merge attempt as integration_worker |
| [invoke-team-only-from-cos](./invoke-team-only-from-cos/SKILL.md) | When a non-CoS role is tempted to call `invoke_team` |
| [run-workflow-not-freestyle](./run-workflow-not-freestyle/SKILL.md) | Named multi-step processes (PRD, plan, grill-me) |
| [secret-hygiene](./secret-hygiene/SKILL.md) | Any tool call that would embed credentials |
| [heartbeat-during-long-operations](./heartbeat-during-long-operations/SKILL.md) | Any run > ~60 seconds |

## Quick reference

- **Start** → `fulcrum action exec start_agent_run`
- **Context** → `fulcrum action exec recall_memory` + `fulcrum action exec get_workspace_status`
- **Long-running** → `fulcrum action exec heartbeat_agent_run`
- **Stuck** → `fulcrum action exec block_agent_run`
- **Done** → `fulcrum action exec complete_agent_run` + `fulcrum action exec write_memory`
- **CoS only** → `fulcrum action exec invoke_team`, `fulcrum action exec build_cos_context`
- **Merge** → `integration_worker` only, after code review and tests pass

## Skill Frontmatter Reference

Every `SKILL.md` uses YAML frontmatter.  Required and optional fields:

```yaml
---
name: <kebab-case-id>          # required — unique, stable identifier
description: <one-liner>       # required — Claude Code filters skills by this; be specific
version: 1.0.0                 # required — semver; bump on breaking behaviour change
author: fulcrum                # required — "fulcrum" for built-ins, your package name for plugins
user-invocable: true | false   # optional — false = auto-trigger only; true = user can /invoke
triggers:                      # optional — explicit conditions that activate this skill
  - before_tool_use            #   before_tool_use: fires on PreToolUse hook match
  - session_start              #   session_start: fires on SessionStart hook
  - on_demand                  #   on_demand: user explicitly requests it (implies user-invocable: true)
input:                         # optional — contract for callers (GAP-SKILLS-2)
  description: "When/how this skill is invoked."
  fields:
    - name: some_field
      type: string
      required: false
      description: "What this field means."
output:                        # optional — what this skill produces
  artifact: run_id             # artifact type (run_id | memory_id | report | commit_sha | ...)
  description: "What the skill returns or persists."
---
```

**`triggers` convention** (GAP-SKILLS-1 resolution):
| Value | When Claude Code activates the skill |
|---|---|
| `before_tool_use` | PreToolUse hook fires and `description` matches the tool context |
| `session_start` | SessionStart hook fires |
| `on_demand` | User explicitly types `/skill-name` or references it by name |
| *(omitted)* | Description-match only — Claude Code decides from the `description` field |

- Cross-links use relative paths so the directory is portable between
  `agent-integration/skills/` and `~/.claude/skills/`.
- Red flags in each skill are the fastest way to self-audit — scan them
  when a tool call fails or a hook denies you.
