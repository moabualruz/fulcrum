import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import {
  makeId,
  SCHEMA_VERSION,
  WorktreeAllocationSchema,
  type Project,
  type Task,
  type WorktreeAllocation
} from "@fulcrum/shared";
import type { ProjectRepositoryPort } from "../projects/service.js";
import type { TaskRepositoryPort } from "../tasks/service.js";
import type { WorktreeRepositoryPort } from "./status.js";

export interface AllocateWorktreeInput {
  taskId: string;
  runId?: string;
  branch?: string;
  baseBranch?: string;
  path?: string;
  existingPath?: string;
  approvedExistingWorkspace?: boolean;
}

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export class WorktreeAllocationService {
  constructor(
    private readonly worktrees: WorktreeRepositoryPort,
    private readonly tasks: Pick<TaskRepositoryPort, "get">,
    private readonly projects: Pick<ProjectRepositoryPort, "get">
  ) {}

  allocate(input: AllocateWorktreeInput): WorktreeAllocation {
    const task = this.requireTask(input.taskId);
    const project = this.requireProject(task.projectId);
    const now = new Date().toISOString();
    const baseBranch = input.baseBranch ?? project.defaultBranch;
    const branch = input.branch ?? `fulcrum/${slug(task.taskId)}-${Date.now()}`;
    const worktreePath =
      input.existingPath ??
      input.path ??
      path.join(path.dirname(project.rootPath), ".fulcrum-worktrees", project.projectId, branch);
    const baseCommit = git(["rev-parse", baseBranch], project.rootPath).trim();

    if (input.existingPath) {
      if (!input.approvedExistingWorkspace) {
        throw new Error("Existing workspace allocation requires operator approval.");
      }
    } else {
      mkdirSync(path.dirname(worktreePath), { recursive: true });
      git(["worktree", "add", "-b", branch, worktreePath, baseBranch], project.rootPath);
    }

    return this.worktrees.save(
      WorktreeAllocationSchema.parse({
        worktreeId: makeId("wt", `${task.taskId}-${branch}-${now}`),
        projectId: project.projectId,
        taskId: task.taskId,
        runId: input.runId,
        path: worktreePath,
        branch,
        baseBranch,
        baseCommit,
        status: "allocated",
        dirtyState: "clean",
        untrackedCount: 0,
        uncommittedCount: 0,
        unpushedCommitCount: 0,
        conflictState: "none",
        activeRunCount: 0,
        cleanupEligibility: "requires_approval",
        createdAt: now,
        updatedAt: now,
        schemaVersion: SCHEMA_VERSION
      })
    );
  }

  private requireTask(taskId: string): Task {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    return task;
  }

  private requireProject(projectId: string): Project {
    const project = this.projects.get(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }
    return project;
  }
}
