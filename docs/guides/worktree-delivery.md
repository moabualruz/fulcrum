# Worktree Delivery Model

`fulcrum-worktree` models task worktree delivery without running Git directly. Runtime adapters provide filesystem and Git integration around this crate; tests use fake status providers.

## Lifecycle

1. Allocate a worktree for a task and run.
2. Attach artifacts such as review reports, test reports, logs, or conflict reports.
3. Open review and record findings.
4. Queue merge after review and required artifacts are present.
5. Apply merge only when injected Git status reports a clean tree.
6. Block merge for conflicts, dirty trees, missing gates, or blocking findings.
7. Cleanup only after merge or when unmerged work is clean.

## Git Boundary

Git state is reported through `GitStatusProvider`.

- `Clean`: merge can apply when review and artifact gates pass.
- `Dirty`: merge blocks and unmerged cleanup is refused.
- `Conflict`: merge blocks and a conflict report artifact is attached.

Unit tests must not shell out to Git. Integration code can map real `git status` and merge results into the provider and lifecycle calls.

## Merge Gates

Merge requires:

- Open review.
- No blocking review findings.
- Final `ReviewReport` artifact.
- Final `TestReport` artifact.
- Clean injected Git status.

Blocked merges remain in `MergeBlocked` with a concrete reason. A caller can resolve issues, requeue merge, then call `apply_merge` again.

## Cleanup Policy

Cleanup marks a worktree as cleaned when it is merged. For unmerged worktrees, cleanup is allowed only when status is clean. Dirty or conflicted unmerged work is refused so agent output cannot be discarded by accident.
