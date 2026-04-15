---
name: run-workflow
description: Execute a named Fulcrum workflow rather than improvising a process
triggers:
  - executing a multi-step process
  - PRD generation
  - issue decomposition
  - code review pipeline
version: 1.0.0
author: fulcrum
user-invocable: true
allowed-tools:
  - mcp__fulcrum__start_agent_run
  - mcp__fulcrum__complete_agent_run
---

# Run Workflow

Use named workflows instead of improvising multi-step processes:

1. Check available workflows: the `@fulcrum/workflows` package defines `grill-me`, `write-a-prd`, `prd-to-plan`, `prd-to-issues`.
2. Start the workflow: call `mcp__fulcrum__start_agent_run` with `agent_role` set to the workflow's designated role (e.g. `prd_planner` for `write-a-prd`).
3. Follow the workflow's defined steps rather than inventing a process ad hoc.
4. When the workflow completes, call `mcp__fulcrum__complete_agent_run` with a summary.

**Why**: Workflows encode best practices and produce consistent outputs. Improvised processes introduce variance and are harder to debug.
