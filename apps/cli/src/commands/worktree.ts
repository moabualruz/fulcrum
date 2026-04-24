import type { WorktreeAllocationService, WorktreeStatusService } from "@fulcrum/core";

export function allocateWorktreeCommand(
  worktrees: WorktreeAllocationService,
  input: { taskId: string; branch?: string; path?: string }
) {
  return worktrees.allocate({
    taskId: input.taskId,
    branch: input.branch,
    path: input.path
  });
}

export function worktreeStatusCommand(worktrees: WorktreeStatusService, worktreeId: string) {
  return worktrees.inspect(worktreeId);
}

export function worktreeCleanupPreviewCommand(
  worktrees: WorktreeStatusService,
  worktreeId: string
) {
  return worktrees.cleanupPreview(worktreeId);
}

export function worktreeCleanupCommand(
  worktrees: WorktreeStatusService,
  worktreeId: string,
  approved: boolean
) {
  return worktrees.cleanup(worktreeId, { approved });
}

export function worktreeDiffCommand(worktrees: WorktreeStatusService, worktreeId: string) {
  return worktrees.diff(worktreeId);
}
