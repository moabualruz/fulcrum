---
name: worktree-checkout
description: Provision a git worktree for isolated branch-based development
triggers:
  - starting development on a feature branch
  - need isolated workspace for a task
  - provisioning code workspace for agent
---

# Worktree Checkout

To provision a worktree for development:

1. Create a worktree entry: the worktree manager handles `git worktree add <path> -b <branch>` and records it in Fulcrum's `worktrees` table.
2. The worktree is linked to a `task_id` and `run_id` — pass these when creating.
3. Status transitions: `allocated` → `dirty` (after first write) → `ready_for_merge` (after work complete).
4. Record the worktree path in a memory with `mcp__fulcrum__write_memory` so other agents can find it.

The branch name convention is `feat/<task-display-id>-<slug>` unless the task specifies otherwise.
