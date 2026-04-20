---
name: fulcrum-heartbeat-during-long-operations
description: >-
  Emit heartbeat_agent_run every ~30s during any run >60s. Applies to long
  script runs, large-file edits, multi-step analysis.
---
# Heartbeat during long operations

Run >60s → call `fulcrum action exec heartbeat_agent_run` every ~30s with `current_step` + `progress_pct`. Janitor marks runs `stale` after 10 min silence. Stale run costs:

- Stops counting toward WIP → another run may take slot + silently supersede work.
- If `blocked`, auto-escalated (possibly wrong audience).
- Loses merge-queue spot.
- CoS context builder treats as "probably dead".

## When

- `Bash` you launched still running (build, test suite, long install).
- About to refactor across >5 files.
- Reading + analyzing many files before output.
- Dispatched agent via `start_agent_run`, waiting on result.
- Last heartbeat >30s ago, still alive.

## How

```
fulcrum action exec heartbeat_agent_run
  run_id:       (from start_agent_run)
  current_step: "refactoring auth module (3/5 files done)"
  progress_pct: 60
```

### `current_step`

Plain-english progress, not machine state:

- GOOD: `"running test suite — 142/300 tests, 2 failures"`.
- GOOD: `"refactoring auth module (3/5 files)"`.
- GOOD: `"waiting on code_reviewer run R-0817"`.
- BAD: `"working"`, `"processing"`, `"ok"`.

### Progress

Best-effort 0-100 integer. Don't stall at 99. Unsure? Report 50, move on. Heartbeat's real job = "still alive", not perfect tracker.

## Red flags

- `Bash` running 5 min, zero heartbeats → janitor about to mark stale. Heartbeat now with current state.
- `current_step` unchanged 3 calls → truly stuck (`block_agent_run`) or progress tracker broken.
- Heartbeated run never started → call fails. Fix missing `start_agent_run` upstream.

See also: [start-every-task](../start-every-task/SKILL.md), [block-when-stuck](../block-when-stuck/SKILL.md).
