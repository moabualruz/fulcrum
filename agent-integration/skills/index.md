---
name: fulcrum-skills-index
description: Table of contents for the Fulcrum Claude Skills directory. Browse this first when you land in a Fulcrum-managed workspace for the first time.
---

# Fulcrum Skills — Index

These skills teach Claude Code agents how to interact with the Fulcrum
control plane (MCP tools, CLI, and hooks) in the right order and at the
right moments. Every skill is scoped to a specific trigger condition via
its frontmatter `description`; Claude Code surfaces the relevant skill
automatically when that condition is met.

## Lifecycle order

The skills are most useful in roughly this order within a session:

1. [workspace-status-on-session-start](./workspace-status-on-session-start.md)
2. [recall-before-writing](./recall-before-writing.md)
3. [start-every-task](./start-every-task.md)
4. [heartbeat-during-long-operations](./heartbeat-during-long-operations.md)
5. [block-when-stuck](./block-when-stuck.md) (if applicable)
6. [complete-agent-run](./complete-agent-run.md)
7. [write-memory-on-completion](./write-memory-on-completion.md)

## Full table

| Skill | When to apply |
|-------|---------------|
| [start-every-task](./start-every-task.md) | Before any Write/Edit/Bash call |
| [recall-before-writing](./recall-before-writing.md) | Before writing new code, docs, or decisions |
| [complete-agent-run](./complete-agent-run.md) | When finishing work with a real summary |
| [block-when-stuck](./block-when-stuck.md) | When you can't proceed and would otherwise guess |
| [workspace-status-on-session-start](./workspace-status-on-session-start.md) | At the very start of a session |
| [chief-of-staff-response-format](./chief-of-staff-response-format.md) | Every CoS turn — structured handoff block |
| [write-memory-on-completion](./write-memory-on-completion.md) | After completing a decision/trade-off/finding |
| [integration-worker-merge-gate](./integration-worker-merge-gate.md) | Before `processMergeQueue` as integration_worker |
| [invoke-team-only-from-cos](./invoke-team-only-from-cos.md) | When a non-CoS role is tempted to call `invoke_team` |
| [run-workflow-not-freestyle](./run-workflow-not-freestyle.md) | Named multi-step processes (PRD, plan, grill-me) |
| [secret-hygiene](./secret-hygiene.md) | Any tool call that would embed credentials |
| [heartbeat-during-long-operations](./heartbeat-during-long-operations.md) | Any run > ~60 seconds |

## Quick reference

- **Start** → `mcp__fulcrum__start_agent_run`
- **Context** → `mcp__fulcrum__recall_memory` + `mcp__fulcrum__get_workspace_status`
- **Long-running** → `mcp__fulcrum__heartbeat_agent_run`
- **Stuck** → `mcp__fulcrum__block_agent_run`
- **Done** → `mcp__fulcrum__complete_agent_run` + `mcp__fulcrum__write_memory`
- **CoS only** → `mcp__fulcrum__invoke_team`, `mcp__fulcrum__spawn_agent`, `mcp__fulcrum__build_cos_context`
- **Merge** → `integration_worker` only, with review + test artifacts in place

## Conventions

- Every skill file has YAML frontmatter with `name` and `description` —
  Claude Code filters skills by the `description`, so keep it specific.
- Cross-links use relative paths so the directory is portable between
  `agent-integration/skills/` and `~/.claude/skills/`.
- Red flags in each skill are the fastest way to self-audit — scan them
  when a tool call fails or a hook denies you.
