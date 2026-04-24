import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  FileProjectRepository,
  FileRunRepository,
  FileTaskRepository,
  FileWorkRepository,
  FileWorktreeRepository,
  LocalTaskService,
  ProjectRegistryService,
  WorktreeAllocationService,
  WorktreeStatusService
} from "@fulcrum/core";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function tryGit(cwd: string, args: string[]): void {
  try {
    git(cwd, args);
  } catch {
    // Expected for commands that intentionally create an unsafe repository state.
  }
}

function repo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "fulcrum-worktree-unsafe-"));
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "test@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  writeFileSync(path.join(root, "README.md"), "base\n");
  git(root, ["add", "README.md"]);
  git(root, ["commit", "-m", "init"]);
  const remote = mkdtempSync(path.join(tmpdir(), "fulcrum-remote-"));
  git(remote, ["init", "--bare"]);
  git(root, ["remote", "add", "origin", remote]);
  git(root, ["push", "-u", "origin", "main"]);
  return root;
}

describe("worktree unsafe states recovery", () => {
  it("blocks cleanup and merge readiness for unpushed commits", () => {
    const state = new FileWorkRepository(
      path.join(mkdtempSync(path.join(tmpdir(), "fulcrum-state-")), "work.json")
    );
    const taskRepo = new FileTaskRepository(state);
    const projectRepo = new FileProjectRepository(state);
    const runRepo = new FileRunRepository(state);
    const worktreeRepo = new FileWorktreeRepository(state);
    const taskService = new LocalTaskService(taskRepo);
    const project = new ProjectRegistryService(projectRepo, taskService).register({
      rootPath: repo(),
      name: "Repo"
    });
    const task = taskService.create({ projectId: project.projectId, title: "Unpushed work" });
    const worktree = new WorktreeAllocationService(worktreeRepo, taskRepo, projectRepo).allocate({
      taskId: task.taskId,
      branch: "fulcrum/unpushed"
    });
    writeFileSync(path.join(worktree.path, "README.md"), "committed\n");
    git(worktree.path, ["add", "README.md"]);
    git(worktree.path, ["commit", "-m", "local change"]);

    const status = new WorktreeStatusService(worktreeRepo, runRepo).cleanupPreview(
      worktree.worktreeId
    );

    expect(status.worktree.unpushedCommitCount).toBe(1);
    expect(status.worktree.cleanupEligibility).toBe("blocked");
    expect(status.mergeReadiness).toBe("blocked");
    expect(status.worktree.blockReason).toContain("unpushed");
  });

  it("blocks cleanup and merge readiness for conflicted worktrees", () => {
    const state = new FileWorkRepository(
      path.join(mkdtempSync(path.join(tmpdir(), "fulcrum-state-")), "work.json")
    );
    const taskRepo = new FileTaskRepository(state);
    const projectRepo = new FileProjectRepository(state);
    const runRepo = new FileRunRepository(state);
    const worktreeRepo = new FileWorktreeRepository(state);
    const taskService = new LocalTaskService(taskRepo);
    const project = new ProjectRegistryService(projectRepo, taskService).register({
      rootPath: repo(),
      name: "Repo"
    });
    const task = taskService.create({ projectId: project.projectId, title: "Conflicted work" });
    const worktree = new WorktreeAllocationService(worktreeRepo, taskRepo, projectRepo).allocate({
      taskId: task.taskId,
      branch: "fulcrum/conflict"
    });

    writeFileSync(path.join(project.rootPath, "README.md"), "main change\n");
    git(project.rootPath, ["add", "README.md"]);
    git(project.rootPath, ["commit", "-m", "main change"]);
    writeFileSync(path.join(worktree.path, "README.md"), "worktree change\n");
    git(worktree.path, ["add", "README.md"]);
    git(worktree.path, ["commit", "-m", "worktree change"]);
    tryGit(worktree.path, ["merge", "main"]);

    const status = new WorktreeStatusService(worktreeRepo, runRepo).cleanupPreview(
      worktree.worktreeId
    );

    expect(status.worktree.conflictState).toBe("conflicted");
    expect(status.conflictedFiles).toContain("README.md");
    expect(status.worktree.cleanupEligibility).toBe("blocked");
    expect(status.mergeReadiness).toBe("blocked");
    expect(status.worktree.blockReason).toContain("conflict");
  });
});
