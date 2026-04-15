---
name: worktree-merge
description: Merge a completed worktree branch back to the base branch
triggers:
  - feature branch is ready
  - code review approved
  - ready to merge worktree
version: 1.0.0
author: fulcrum
---

# Worktree Merge

Before merging:

1. Verify status is `ready_for_merge` — do not merge `dirty` or `allocated` worktrees.
2. Confirm any required code review is `approved` (status in `reviews` table).
3. Check policy: `mcp__fulcrum__get_workspace_status` to ensure no merge freeze is active.
4. Merge the branch: `git merge --no-ff <branch>` from the base branch.
5. Update worktree status to `merged` and complete the agent run if this was the final step.
6. Write a memory with `mcp__fulcrum__write_memory` recording what was merged, what changed, and any notable implementation decisions (`kind: "task_outcome"`).
