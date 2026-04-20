---
name: block-when-stuck
description: Call block_agent_run instead of guessing when you cannot proceed. Applies on missing info, failing dependency, ambiguous requirements, or permission denial.
---

# Block when stuck — do not guess

Cannot proceed? Call `fulcrum action exec block_agent_run` with clear `reason`. Blocked run = first-class signal control plane handles. Run that silently invents = liability.

## When

- **Missing info**: need value/file/env var you cannot find, user did not provide.
- **Failing dependency**: required service/build/migration broken beyond your role.
- **Ambiguous requirements**: two reasonable interpretations produce different output.
- **Permission denial**: PreToolUse hook denied call, no alternative. See [secret-hygiene](../secret-hygiene/SKILL.md) + [invoke-team-only-from-cos](../invoke-team-only-from-cos/SKILL.md).
- **WIP exhaustion**: downstream role at WIP limit, not draining.

## How

```bash
fulcrum action exec block_agent_run --json '{
  "run_id": "run_123",
  "reason": "specific, actionable blocker"
}'
```

`reason` = not optional, not cosmetic. Determines CoS unblock speed.

- BAD: `"stuck"`
- BAD: `"can't figure out the auth config"`
- GOOD: `"missing STRIPE_WEBHOOK_SECRET env var for integration tests in packages/billing — need set in worker adapter before verifying refund flow"`
- GOOD: `"spec T-0412 says 'idempotent upsert' but schema has no unique constraint on (workspace_id, slug); need decision: add constraint or use different key"`

## Escalation

Blocked runs auto-escalate to `chief_of_staff` after `escalation_timeout_minutes` (default 30). CoS sees `reason` in `build_cos_context` and unblocks by:

- Supplying missing value.
- Re-scoping via `update_task`.
- Dispatching different role to fix dependency.

Block is secret? State `"needs secret: <name>"` — hook layer routes separately; credentials flow env vars, not prompts.

## Red flags

- Looped same failing tool call 3x → stop, block.
- Picked one ambiguous interpretation, wrote code → revert, block with both options listed.
- Blocked run + kept writing code → not blocked, hiding work. Complete or cancel first.

See also: [heartbeat-during-long-operations](../heartbeat-during-long-operations/SKILL.md), [secret-hygiene](../secret-hygiene/SKILL.md).
