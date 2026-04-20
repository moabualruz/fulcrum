---
name: integration-worker-merge-gate
description: As integration_worker, verify review + test artifacts exist before processMergeQueue. Every merge attempt.
---

# Integration worker merge gate

As `integration_worker`, before `processMergeQueue` (or any merge-equivalent), verify gate conditions below. Policy layer refuses otherwise + logs `merge_skipped`. Don't force — fix missing input.

## Gate conditions

Worktree mergeable iff ALL true:

1. **Review artifact**: `review_report` on worktree with `status='final'`. Produced by `code_reviewer` via `review_artifact`.
2. **Test artifact**: `test_report` on worktree with `status='final'`. From project test script via `run_script`.
3. **Role allowed**: `canMerge(your_role)` returns `true`. Only for `integration_worker`. Other role reading this → hand off.

## How to verify

```
fulcrum action exec get_workspace_status
  workspace_id: ...
```

Check `runs` for `code_reviewer` or `qa_engineer` on same task with `status=finished` + non-empty `output_summary`. No summary or still `running` = absent → reject merge.

## If artifact missing

Do NOT skip gate:

- **Missing review**: `fulcrum action exec start_agent_run` with `agent_role=code_reviewer` (or block with reason `"review pending"`, CoS schedules).
- **Missing test_report**: run project test script via `run_script`, capture output, attach with `kind=test_report`, `status=final`.
- **Both missing**: block the run. Merge this early = red flag.

## Red flags

- `processMergeQueue` without artifact inspection → policy logs `merge_skipped`. Read + fix.
- Attached `test_report` without actually running tests → falsified artifact. Run log traces failures to you.
- Not `integration_worker` but considered merge tool → stop. Gated to `integration_worker` only. Delegate.

See also: [start-every-task](../start-every-task/SKILL.md), [block-when-stuck](../block-when-stuck/SKILL.md).
