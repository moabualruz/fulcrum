---
trigger: model_decision
description: "Provision git worktree for isolated branch-based development."
---


# Worktree Checkout

Provision worktree:

1. Create worktree entry: worktree manager handles `git worktree add <path> -b <branch>` + records in Fulcrum `worktrees` table.
2. Linked to `task_id` + `run_id` — pass when creating.
3. Status transitions: `allocated` → `dirty` (after first write) → `ready_for_merge` (after work complete).
4. `fulcrum action exec write_memory` recording worktree path so other agents find it.

Branch convention: `feat/<task-display-id>-<slug>` unless task specifies otherwise.
