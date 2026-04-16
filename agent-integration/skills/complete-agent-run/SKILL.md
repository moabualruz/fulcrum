---
name: complete-agent-run
description: Finalize an agent run with a meaningful summary and changed-file list. Applies whenever you finish work, hand off, or are about to stop responding on a run you started.
---

# Complete agent runs with a real summary

When you finish work, call `fulcrum action exec complete_agent_run` with the
`run_id` returned by `start_agent_run`. Do not just say "done" and exit —
the summary you pass is persisted as a `task_outcome` memory and is the
primary signal the chief-of-staff uses to decide what happens next.

## When to apply

- All acceptance criteria for the task are met and verified
- Tests pass (or the failing tests are knowingly out-of-scope, documented)
- You have committed and/or pushed, or produced the artifact the task asked
  for
- You are about to stop responding for any reason other than being blocked
  (if blocked, see [block-when-stuck](../block-when-stuck/SKILL.md) instead)

## How

```bash
fulcrum action exec complete_agent_run --json '{
  "run_id": "run_123",
  "output_summary": "What changed and why.",
  "files_changed": ["packages/core/src/memory/recall.ts"],
  "tests_passed": 91,
  "tests_failed": 0
}'
```

### What belongs in `output_summary`

- What changed and why — one paragraph. Not "fixed bug", but "fixed the FTS5
  fallback path so it catches any `SQLITE_ERROR` from a MATCH query, not just
  the keyword-specific parse error."
- Any decisions or trade-offs — a second paragraph, optional.
- Follow-ups the next agent should know about — a third paragraph, optional.

### What belongs in `files_changed`

Every path you mutated, relative to the workspace root. This feeds the
reviewer and the integration worker — an incomplete list produces incomplete
reviews.

## Red flags

- `output_summary` under 40 characters → almost certainly useless; expand it.
- `files_changed` is empty but you called `Edit` or `Write` → bug in your
  tracking; fix it before completing.
- You completed without running tests on a code change → the next agent
  will discover the regression; run tests first, or explicitly record the
  gap in `output_summary`.
- You completed a run that was never started → the call will fail; start
  a new run, do the minimum to represent the state, then complete it.

See also: [write-memory-on-completion](../write-memory-on-completion/SKILL.md),
[start-every-task](../start-every-task/SKILL.md).
