import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  FileProjectRepository,
  FileTaskRepository,
  FileWorkRepository,
  FileWorktreeRepository,
  LocalTaskService,
  ProjectRegistryService,
  WorktreeAllocationService,
  WorktreeStatusService
} from "@fulcrum/core";

function git(cwd: string, args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

function repo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "fulcrum-worktree-cleanup-"));
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "test@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  writeFileSync(path.join(root, "README.md"), "base\n");
  git(root, ["add", "README.md"]);
  git(root, ["commit", "-m", "init"]);
  return root;
}

describe("worktree cleanup safety", () => {
  it("blocks cleanup when dirty and untracked files exist", () => {
    const state = new FileWorkRepository(
      path.join(mkdtempSync(path.join(tmpdir(), "fulcrum-state-")), "work.json")
    );
    const taskRepo = new FileTaskRepository(state);
    const projectRepo = new FileProjectRepository(state);
    const worktreeRepo = new FileWorktreeRepository(state);
    const taskService = new LocalTaskService(taskRepo);
    const project = new ProjectRegistryService(projectRepo, taskService).register({
      rootPath: repo(),
      name: "Repo"
    });
    const task = taskService.create({ projectId: project.projectId, title: "Dirty worktree" });
    const allocator = new WorktreeAllocationService(worktreeRepo, taskRepo, projectRepo);
    const status = new WorktreeStatusService(worktreeRepo);
    const worktree = allocator.allocate({ taskId: task.taskId, branch: "fulcrum/dirty" });

    writeFileSync(path.join(worktree.path, "README.md"), "changed\n");
    writeFileSync(path.join(worktree.path, "scratch.txt"), "untracked\n");
    const preview = status.cleanupPreview(worktree.worktreeId);

    expect(preview.worktree.cleanupEligibility).toBe("blocked");
    expect(preview.worktree.blockReason).toContain("dirty");
    expect(preview.worktree.blockReason).toContain("untracked");
    expect(() => status.cleanup(worktree.worktreeId, { approved: true })).toThrow(/blocked/);
  });
});
