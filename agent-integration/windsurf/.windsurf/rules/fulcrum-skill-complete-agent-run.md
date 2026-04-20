---
trigger: model_decision
description: "Finalize agent run with meaningful summary + changed-file list. When work finishes, handoff, or stopping a run you started."
---


# Complete agent runs with real summary

Finished work → `fulcrum action exec complete_agent_run` with `run_id` from `start_agent_run`. Do not just say "done" + exit. Summary persists as `task_outcome` memory + is primary signal CoS uses for next decision.

## When

- All acceptance criteria met + verified.
- Tests pass (or failing tests knowingly out-of-scope, documented).
- Committed/pushed, or produced artifact task asked for.
- About to stop responding for any reason other than blocked (blocked → see [block-when-stuck](../block-when-stuck/SKILL.md)).

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

### `output_summary`

- What changed + why — one paragraph. Not "fixed bug", but "fixed FTS5 fallback path so it catches any `SQLITE_ERROR` from a MATCH query, not just keyword-specific parse error."
- Decisions / trade-offs — second paragraph, optional.
- Follow-ups for next agent — third paragraph, optional.

### `files_changed`

Every path mutated, relative to workspace root. Feeds reviewer + integration worker. Incomplete list = incomplete reviews.

## Red flags

- `output_summary` <40 chars → almost certainly useless. Expand.
- `files_changed` empty but called `Edit`/`Write` → tracking bug. Fix before completing.
- Completed without running tests on code change → next agent discovers regression. Run tests, or explicitly record gap in `output_summary`.
- Completed run never started → call fails. Start new run, do minimum to represent state, then complete.

See also: [write-memory-on-completion](../write-memory-on-completion/SKILL.md), [start-every-task](../start-every-task/SKILL.md).
