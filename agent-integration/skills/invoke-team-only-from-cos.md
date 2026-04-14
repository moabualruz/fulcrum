---
name: invoke-team-only-from-cos
description: Only chief_of_staff may call invoke_team. Applies whenever a non-CoS role is about to call mcp__fulcrum__invoke_team — escalate instead of attempting the call.
---

# invoke_team is chief-of-staff only

The policy invariant `only_l1_invokes_teams` denies
`mcp__fulcrum__invoke_team` from any role other than `chief_of_staff`.
If you are not chief_of_staff, the call will be rejected with a clear
error before it reaches the control plane. Don't attempt it.

## Why

Team invocation spans multiple L2 roles, consumes multiple WIP slots
simultaneously, and coordinates artifacts across workers. That kind of
fan-out is L1 orchestration work, and allowing any L2 role to do it
would let a single specialist reshape the task board without visibility.

## What to do instead

If you are an L2 role (software_engineer, code_reviewer, tech_lead,
integration_worker, etc.) and you have work that genuinely needs a team:

1. Call `mcp__fulcrum__escalate_run` on your current run with a clear
   `reason` describing:
   - What kind of team you need (roles)
   - Why your current role cannot finish the work alone
   - What the success criteria for the team would be
2. The escalation is delivered to `chief_of_staff`, who can then
   `invoke_team` on your behalf.
3. Continue heartbeating until the CoS responds, or call
   `block_agent_run` if you cannot make any progress while waiting.

## Example escalation reason

```
Need team: software_engineer + code_reviewer + security_reviewer.
I can implement the auth middleware but the change touches the
session storage layer (packages/core/src/session) which needs a
security review I can't perform from my role. Success = middleware
merged with both reviews passing and no new CVE surface.
```

## Red flags

- You are `software_engineer` and you just called `invoke_team` → the
  call failed; don't retry, escalate instead.
- You are `chief_of_staff` and you called `Write` or `Edit` to avoid
  invoking a team → that's a different violation; see
  [chief-of-staff-response-format](./chief-of-staff-response-format.md).
- You escalated without a clear `reason` → CoS has nothing to act on;
  write the full context up front.

See also: [chief-of-staff-response-format](./chief-of-staff-response-format.md),
[block-when-stuck](./block-when-stuck.md).
