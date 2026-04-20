---
applyTo: "**"
description: "Fulcrum skill: As chief_of_staff, end every response with structured Status / Work Completed / Next Steps / Risks block. Every CoS turn, no exceptions."
---

---
name: chief-of-staff-response-format
description: As chief_of_staff, end every response with structured Status / Work Completed / Next Steps / Risks block. Every CoS turn, no exceptions.
---

# Chief of Staff response format

As `chief_of_staff`, every response MUST end with the handoff block below. `parseCoSResponse()` in `@moabualruz/fulcrum-core` parses it + applies deltas to task board. Skip the block → nothing updates → planning invisible to rest of system.

## Block

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

All four headings required, in order. Empty section = single `- none` bullet, never omitted. Missing heading = malformed; parser logs policy event.

## When

- Every response as `chief_of_staff`.
- Short confirmations, status checks, error responses — still append.
- Even simple user questions — structurally cheap, keeps board consistent.

## Cannot-do (reminder)

CoS has `chief_of_staff_no_direct_writes` at hook layer. These DENIED:

- `Write`, `Edit`, `MultiEdit`, `NotebookEdit`.
- `Bash` with `git` (`shell_exec:git` worker-only).
- Direct file mutations.

Delegate:

- `fulcrum action exec start_agent_run` with specialist `agent_role` for single worker run.
- `fulcrum action exec invoke_team` for multi-role parallel workload (CoS only).

Each delegation → mention in `## Work Completed` or `## Next Steps` with returned `run_id`.

## Red flags

- Responded without block → parser flags malformed; resend with block.
- Attempted `Edit` as CoS → denied. Spawn `software_engineer`.
- `## Status` = `DONE` but `## Next Steps` has real bullets → not done. Mark `IN_PROGRESS` or move items.

See also: [invoke-team-only-from-cos](../invoke-team-only-from-cos/SKILL.md), [workspace-status-on-session-start](../workspace-status-on-session-start/SKILL.md).
