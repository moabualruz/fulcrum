---
name: block-when-stuck
description: Call block_agent_run instead of guessing when you cannot proceed. Applies whenever you hit missing info, a failing dependency, ambiguous requirements, or a permission denial.
---

# Block when stuck — do not guess

When you cannot proceed, call `mcp__fulcrum__block_agent_run` with a clear
`reason`. A blocked run is a first-class signal the control plane knows how
to handle. A run that silently invents an answer is a liability.

## When to apply

- **Missing information**: you need a value, file, or env var you cannot
  find and the user did not provide.
- **Failing dependency**: a required service, build, or migration is broken
  in a way you cannot fix within your role.
- **Ambiguous requirements**: two reasonable interpretations of the task
  would produce meaningfully different output.
- **Permission denial**: a PreToolUse hook denied a tool call and you have
  no alternative path (see [secret-hygiene](./secret-hygiene.md) and
  [invoke-team-only-from-cos](./invoke-team-only-from-cos.md)).
- **WIP exhaustion**: a downstream role you need to invoke is at WIP limit
  and not draining.

## How

```
mcp__fulcrum__block_agent_run
  run_id: (from start_agent_run)
  reason: (specific, actionable — see below)
```

`reason` is not optional and not cosmetic. It determines how fast the
chief-of-staff can unblock you. Good vs bad examples:

- BAD: `"stuck"`
- BAD: `"can't figure out the auth config"`
- GOOD: `"missing STRIPE_WEBHOOK_SECRET env var for integration tests in
  packages/billing — need it set in the worker adapter before I can verify
  the refund flow"`
- GOOD: `"spec in T-0412 says 'idempotent upsert' but the existing schema
  has no unique constraint on (workspace_id, slug); need decision: add the
  constraint or use a different key"`

## Escalation

Blocked runs auto-escalate to `chief_of_staff` after
`escalation_timeout_minutes` (default 30). During that window the CoS sees
your `reason` in `build_cos_context` output and can unblock you by:

- Supplying the missing value
- Re-scoping the task via `update_task`
- Dispatching a different role to fix the dependency

If the block is a secret, state `"needs secret: <name>"` — the hook layer
routes those separately so credentials flow through env vars, not prompts.

## Red flags

- You looped trying the same failing tool call three times → stop, block
  the run.
- You picked one interpretation of an ambiguous spec and wrote code →
  revert and block with both options listed.
- You blocked a run and kept writing code → that's not blocked, that's
  hiding work; complete or cancel the run first.

See also: [heartbeat-during-long-operations](./heartbeat-during-long-operations.md),
[secret-hygiene](./secret-hygiene.md).
