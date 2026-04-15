---
name: integration-worker-merge-gate
description: When operating as integration_worker, verify review and test artifacts exist before calling processMergeQueue. Applies to every merge attempt by the integration_worker role.
allowed-tools: []
user-invocable: false
version: 1.0.0
author: fulcrum
---

# Integration worker merge gate

When operating as `integration_worker`, before calling `processMergeQueue`
(or any merge-equivalent action), verify the gate conditions below. The
policy layer will refuse to merge otherwise and log a `merge_skipped`
event — don't force it, fix the missing input.

## Gate conditions

A worktree is mergeable if and only if ALL of the following are true:

1. **Review artifact exists**: a `review_report` artifact attached to the
   worktree with `status='final'`. Produced by `code_reviewer` via
   `review_artifact`.
2. **Test artifact exists**: a `test_report` artifact attached to the
   worktree with `status='final'`. Produced by running the project's
   test script via `run_script` or equivalent.
3. **Role allowed**: `canMerge(your_role)` returns `true`. It will for
   `integration_worker`. If you are any other role and reading this
   skill, you are not allowed to merge at all — hand off.

## How to verify

```
mcp__fulcrum__get_workspace_status
  workspace_id: ...
```

Check `runs` for any `code_reviewer` or `qa_engineer` run on the same task
with `status=finished` and a non-empty `output_summary`. A run with no
summary or still `running` counts as absent — reject the merge.

## If an artifact is missing

Do NOT skip the gate. Instead:

- **Missing review**: call `mcp__fulcrum__start_agent_run` with `agent_role=code_reviewer` (or
  block the run with reason `"review pending"` and let
  chief_of_staff schedule it).
- **Missing test_report**: run the project's test script via `run_script`,
  capture the output, and attach it as an artifact with `kind=test_report`
  and `status=final`.
- **Both missing**: block the run — a merge this early is a red flag.

## Red flags

- You called `processMergeQueue` without inspecting artifacts → the policy
  layer will log `merge_skipped`; read the event and fix the missing input.
- You attached a `test_report` without actually running the tests → that
  is a falsified artifact; subsequent failures will be traced to you via
  the run log.
- You are NOT `integration_worker` and considered calling a merge tool →
  stop; that capability is gated to `integration_worker` only. Delegate.

See also: [start-every-task](../start-every-task/SKILL.md),
[block-when-stuck](../block-when-stuck/SKILL.md).
