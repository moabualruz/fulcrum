---
trigger: model_decision
description: "Execute named Fulcrum workflow instead of improvising a process."
---


# Run Workflow

Named workflows, not ad-hoc multi-step:

1. Available workflows: `@moabualruz/fulcrum-workflows` defines `grill-me`, `write-a-prd`, `prd-to-plan`, `prd-to-issues`.
2. Start: `fulcrum action exec start_agent_run` with `agent_role` = workflow's designated role (e.g., `prd_planner` for `write-a-prd`).
3. Follow workflow's defined steps, not invented ad-hoc.
4. On complete: `fulcrum action exec complete_agent_run` with summary.

**Why**: workflows encode best practices + produce consistent outputs. Improvised = variance + harder debug.
