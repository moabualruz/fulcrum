---
name: run-workflow-not-freestyle
description: Run multi-step repeatable processes as registered workflows, not ad-hoc. Applies whenever you are about to execute a named process like grill-me, write-a-prd, prd-to-plan, or prd-to-issues.
allowed-tools: []
user-invocable: false
version: 1.0.0
author: fulcrum
---

# Run registered workflows, not freestyle scripts

Multi-step, repeatable processes should be executed as registered
workflows via `fulcrum workflow start` or the equivalent MCP tool, not
as ad-hoc chains of tool calls. Workflows give you retries, state
persistence, telemetry, and resumability — none of which you get when
you improvise.

## When to apply

- The user asks for a named process: "grill me on this idea",
  "write a PRD", "turn this PRD into a plan", "turn this plan into
  issues"
- You are about to execute more than ~3 steps that could be reproduced
  from a template
- You find yourself copy-pasting a prompt sequence you've used before
- Recovery from a failure in the middle of the process would be
  expensive if state were lost

## How

### CLI

```
fulcrum workflow start <workflow_name> \
  --workspace <workspace_id> \
  --input '{"key": "value"}'
```

### MCP

Call the registered workflow tool (exact name depends on registration —
check with `fulcrum workflow list` or the MCP `list_workflows` tool).

Pass structured input. The workflow engine will:

- Persist state to the control plane after every step
- Retry transient failures according to the workflow's retry policy
- Emit telemetry events you can inspect via `get_run_status`
- Let you resume from the last checkpoint if the session dies

## Known workflow names

At time of writing, the registered workflows in pi-agent-os include:

- `grill-me` — adversarial questioning of an idea or plan
- `write-a-prd` — product requirements drafting
- `prd-to-plan` — decompose a PRD into a sequenced implementation plan
- `prd-to-issues` — materialize a plan as tracked tasks / issues

If the workflow you need isn't registered, don't simulate it by hand:
either request registration via the chief_of_staff, or explicitly note
in your `complete_agent_run` summary that you ran an ad-hoc version and
why.

## Red flags

- You wrote a PRD by directly calling `Write` with a hand-rolled
  template → use `write-a-prd` instead so it's versioned and auditable.
- You ran five MCP calls in sequence to decompose a plan → check if
  `prd-to-plan` exists first.
- A workflow failed mid-run and you restarted from scratch → workflows
  are resumable; pass the previous run_id and continue.

See also: [start-every-task](../start-every-task/SKILL.md),
[heartbeat-during-long-operations](../heartbeat-during-long-operations/SKILL.md).
