---
applyTo: "**"
description: "Fulcrum skill: Run multi-step repeatable processes as registered workflows, not ad-hoc. Applies to named processes like grill-me, write-a-prd, prd-to-plan, prd-to-issues."
---

---
name: run-workflow-not-freestyle
description: Run multi-step repeatable processes as registered workflows, not ad-hoc. Applies to named processes like grill-me, write-a-prd, prd-to-plan, prd-to-issues.
---

# Run registered workflows, not freestyle scripts

Multi-step repeatable processes → registered workflows via `fulcrum workflow start` or MCP tool. Not ad-hoc tool-call chains. Workflows give retries, state persistence, telemetry, resumability. Improvising gives none.

## When

- User asks for named process: "grill me", "write a PRD", "turn PRD into plan", "turn plan into issues".
- About to execute >3 steps reproducible from template.
- Copy-pasting a prompt sequence used before.
- Mid-process failure recovery would cost state.

## How

### CLI

```
fulcrum workflow start <workflow_name> \
  --workspace <workspace_id> \
  --input '{"key": "value"}'
```

### MCP

Call registered workflow tool (exact name depends on registration — check `fulcrum workflow list` or MCP `list_workflows`).

Pass structured input. Engine will:

- Persist state after every step.
- Retry transients per workflow policy.
- Emit telemetry (inspect via `get_run_status`).
- Resume from last checkpoint if session dies.

## Known workflows

pi-agent-os registered workflows:

- `grill-me` — adversarial questioning of idea/plan.
- `write-a-prd` — product requirements drafting.
- `prd-to-plan` — decompose PRD into sequenced impl plan.
- `prd-to-issues` — materialize plan as tracked tasks/issues.

Workflow not registered? Do not simulate by hand. Request registration via CoS, or explicitly note in `complete_agent_run` summary that you ran ad-hoc + why.

## Red flags

- Wrote PRD via hand-rolled `Write` template → use `write-a-prd` (versioned + auditable).
- Ran five MCP calls in sequence to decompose plan → check `prd-to-plan` first.
- Workflow failed mid-run, restarted from scratch → workflows resumable; pass prior `run_id`.

See also: [start-every-task](../start-every-task/SKILL.md), [heartbeat-during-long-operations](../heartbeat-during-long-operations/SKILL.md).
