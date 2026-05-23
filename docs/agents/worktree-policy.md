# Worktree Policy

Every PRD-driven adoption slice runs in its own git worktree. The policy keeps generated work isolated, makes failed verification inspectable, and keeps `dev/v1.0` as the only merge target.

## Lifecycle

1. Select one eligible PRD from the local PRD glossary (kept locally, not tracked).
2. Create `.claude/worktrees/<id>/` from `dev/v1.0` on branch `feat/prd-<id>`.
3. Implement only the PRD's assigned paths unless verification exposes a directly related prerequisite.
4. Run every command in the PRD's `verify` list.
5. Run `bun run typecheck` and `bun run lint`.
6. Commit the slice in the PRD worktree when all gates exit 0.
7. Fast-forward merge `feat/prd-<id>` into `dev/v1.0`.
8. Prune `.claude/worktrees/<id>/`.

## Verify-Fail Recovery

If any verify command fails, stop the slice before merge.

- Leave `.claude/worktrees/<id>/` intact for inspection.
- Update the PRD entry with `status: "blocked"`, `blocked_reason`, and `blocked_at`.
- Append a `BLOCKED:<id>` line to the adoption progress log.
- Do not flip `passes` to `true`.
- Do not prune the worktree until a later pass resolves the blocker.

## Merge Rules

- Use fast-forward merges only.
- Never merge a dirty worktree.
- Never force-push or reset shared branches to recover a PRD slice.
- If `dev/v1.0` moved, rebase the PRD branch inside its worktree, rerun all gates, then merge.
- Keep one commit per PRD unless a separate prerequisite fix is required and verified independently.
