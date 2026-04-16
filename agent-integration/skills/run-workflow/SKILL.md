---
name: run-workflow
description: Execute a named Fulcrum workflow rather than improvising a process
---

# Run Workflow

Use named workflows instead of improvising multi-step processes:

1. Check available workflows: the `@moabualruz/fulcrum-workflows` package defines `grill-me`, `write-a-prd`, `prd-to-plan`, `prd-to-issues`.
2. Start the workflow: call `fulcrum action exec start_agent_run` with `agent_role` set to the workflow's designated role (e.g. `prd_planner` for `write-a-prd`).
3. Follow the workflow's defined steps rather than inventing a process ad hoc.
4. When the workflow completes, call `fulcrum action exec complete_agent_run` with a summary.

**Why**: Workflows encode best practices and produce consistent outputs. Improvised processes introduce variance and are harder to debug.
