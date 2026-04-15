---
name: heartbeat-during-long-operations
description: Emit heartbeat_agent_run every ~30 seconds during any run that takes more than ~60 seconds. Applies to long script runs, large-file edits, and multi-step analysis.
allowed-tools:
  - mcp__fulcrum__heartbeat_agent_run
user-invocable: false
version: 1.0.0
author: fulcrum
---

# Heartbeat during long operations

For any run that takes more than ~60 seconds, call
`mcp__fulcrum__heartbeat_agent_run` every ~30 seconds with a
`current_step` and `progress_pct`. The janitor marks runs as `stale`
after 10 minutes of silence and a stale run has real costs:

- It stops counting toward WIP — another run may take its place and
  silently supersede your work
- If it was `blocked`, it is auto-escalated (possibly to the wrong
  audience)
- It loses its spot in any merge queue
- The chief-of-staff context builder treats it as "probably dead"

## When to apply

- A `Bash` call you launched is still running (build, test suite,
  long install)
- You're about to do a multi-step refactor touching > 5 files
- You're reading and analysing many files before producing output
- You dispatched another agent via `start_agent_run` and are waiting for its
  result
- You issued a heartbeat more than ~30 seconds ago and are still alive

## How

```
mcp__fulcrum__heartbeat_agent_run
  run_id:       (from start_agent_run)
  current_step: "refactoring auth module (3/5 files done)"
  progress_pct: 60
```

### What belongs in `current_step`

Plain-english progress, not machine state:

- GOOD: `"running test suite — 142/300 tests, 2 failures so far"`
- GOOD: `"refactoring auth module (3/5 files done)"`
- GOOD: `"waiting on spawned code_reviewer run R-0817"`
- BAD: `"working"`, `"processing"`, `"ok"`

### Progress percentage

Best-effort integer 0-100. Don't stall at 99 — if you're unsure,
report 50 and move on; the heartbeat's real job is to say "still
alive", not to be a perfect tracker.

## Red flags

- A `Bash` command has been running for 5 minutes and you have emitted
  zero heartbeats → the janitor is about to mark you stale; heartbeat
  immediately with the current state.
- Your heartbeat `current_step` hasn't changed in three calls → either
  you are truly stuck (call `block_agent_run`) or your progress tracker
  is broken.
- You heartbeated a run you never started → the call will fail; fix
  the missing `start_agent_run` upstream.

See also: [start-every-task](../start-every-task/SKILL.md),
[block-when-stuck](../block-when-stuck/SKILL.md).
