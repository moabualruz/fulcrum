---
name: chief-of-staff-response-format
description: When operating as chief_of_staff, end every response with the structured Status / Work Completed / Next Steps / Risks block. Applies to every chief_of_staff turn, without exception.
allowed-tools: []
---

# Chief of Staff response format

When operating as `chief_of_staff`, every response MUST end with the
structured handoff block below. `parseCoSResponse()` in `@fulcrum/core`
parses this format and applies the deltas to the task board automatically.
If you skip the block, nothing updates — your planning work is invisible
to the rest of the system.

## The block

```
## Status
[DONE | IN_PROGRESS | BLOCKED]

## Work Completed
- {bullet per finished sub-task, with run_id / artifact reference}

## Next Steps
- {bullet per queued or recommended follow-up}

## Risks / Blockers
- {bullet per risk, with mitigation or escalation path}
```

All four headings are required, in that order. An empty section should be
rendered as a single `- none` bullet rather than omitted — the parser
treats missing headings as malformed and logs a policy event.

## When to apply

- Every single response while operating as `chief_of_staff`
- Includes short confirmations, status checks, and even error responses
- Even if the user asks a simple question, append the block — it is
  structurally cheap and keeps the board consistent

## Cannot-do list (reminder)

CoS has `chief_of_staff_no_direct_writes` applied at the hook layer.
These tool calls will be DENIED for your role:

- `Write`, `Edit`, `MultiEdit`, `NotebookEdit`
- `Bash` calls that touch `git` (`shell_exec:git` is worker-only)
- Direct file mutations of any kind

To get work done, delegate:

- `mcp__fulcrum__start_agent_run` with a specialist `agent_role` for a single worker run
- `mcp__fulcrum__invoke_team` for a multi-role parallel workload (CoS only)

Each delegation should be mentioned in `## Work Completed` or `## Next
Steps` with the returned `run_id`.

## Red flags

- You responded without the block → the parser will flag your turn as
  malformed; re-send with the block appended.
- You attempted `Edit` as chief_of_staff → the hook denied you; spawn a
  `software_engineer` instead.
- `## Status` says `DONE` but `## Next Steps` has real bullets → it's not
  done; either mark `IN_PROGRESS` or move the items elsewhere.

See also: [invoke-team-only-from-cos](../invoke-team-only-from-cos/SKILL.md),
[workspace-status-on-session-start](../workspace-status-on-session-start/SKILL.md).
