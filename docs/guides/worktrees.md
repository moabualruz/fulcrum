# Worktrees

`@fulcrum/worktrees` is **not** a stub. It runs real `git` subprocesses and maintains a real merge queue with conflict detection and rollback.

---

## Allocation

```typescript
import { allocateWorktree } from '@fulcrum/worktrees'

const wt = await allocateWorktree({
  workspace_id: 'ws_1',
  project_id:   'proj_1',
  task_id:      task.task_id,
  run_id:       run.run_id,
  agent_role:   'software_engineer',
  base_branch:  'main',
  // branch_name optional — auto-generated from role + task
})
```

Behavior:

- **Git projects**: runs `git worktree add <project_root>/.fulcrum-worktrees/<worktree_id> -b <branch> <base_branch>` under the project root
- **Non-git projects**: falls back to `write_mode='sequential'` (no worktree, agents serialize in-place)
- Rejects if the branch already exists or the base branch is missing
- Emits `worktree_allocated` event + `worktree.allocate` span

---

## Marking Ready + Queuing

```typescript
import { markReady, enqueueMerge } from '@fulcrum/worktrees'

await markReady({ worktree_id: wt.worktree_id })
await enqueueMerge({ worktree_id: wt.worktree_id, priority: 10 })
```

---

## Processing the Merge Queue

```typescript
import { processMergeQueue } from '@fulcrum/worktrees'

const result = await processMergeQueue({
  workspace_id: 'ws_1',
  actor_role:   'integration_worker',
  project_id:   'proj_1',       // optional
})
// { merged: [...], skipped: [...], conflicts: [...], results: [...] }
```

Processing rules:

- **Policy gate**: only roles with `canMerge()` (i.e., `integration_worker`) may dequeue
- **FIFO** by `updated_at` (time the worktree entered `ready_for_merge`)
- **Gate artifacts**: worktree must have both a `review_report` and a `test_report` artifact with `status='final'`. Missing gates produce a `policy_denied` event and the worktree is skipped
- **Real merge**: runs `git merge --no-ff <branch>` in the project root against the base branch
- **Conflict**: on merge failure, runs `git merge --abort`, creates a `merge_conflict_report` artifact with the git output, sets the worktree to `status='conflict'`, and emits `merge_conflicted`
- **Success**: runs `git worktree remove --force <path>`, sets `status='merged'`, and emits `merge_completed`
- **Non-git / sequential**: nothing to merge, the worktree just transitions to `merged`

---

## CLI

```bash
fulcrum queue merge list [--workspace-id W]
fulcrum queue merge process --workspace-id W --actor-role R [--project-id P]
fulcrum queue review list [--workspace-id W] [--project-id P]
```
