import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  LocalTaskService,
  ProjectRegistryService,
  RunLifecycleService,
  WorktreeAllocationService,
  WorktreeStatusService,
  type RunRepositoryPort,
  type WorktreeRepositoryPort
} from "@fulcrum/core";
import type { Project, Run, RunEvent, Task, WorktreeAllocation } from "@fulcrum/shared";

class MemoryProjectRepository {
  projects = new Map<string, Project>();
  save(project: Project): Project {
    this.projects.set(project.projectId, project);
    return project;
  }
  get(projectId: string): Project | undefined {
    return this.projects.get(projectId);
  }
  findByRoot(rootPath: string): Project | undefined {
    return [...this.projects.values()].find((project) => project.rootPath === rootPath);
  }
  list(): Project[] {
    return [...this.projects.values()];
  }
}

class MemoryTaskRepository {
  tasks = new Map<string, Task>();
  save(task: Task): Task {
    this.tasks.set(task.taskId, task);
    return task;
  }
  get(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }
  list(projectId?: string): Task[] {
    return [...this.tasks.values()].filter((task) => !projectId || task.projectId === projectId);
  }
}

class MemoryWorktreeRepository implements WorktreeRepositoryPort {
  worktrees = new Map<string, WorktreeAllocation>();
  save(worktree: WorktreeAllocation): WorktreeAllocation {
    this.worktrees.set(worktree.worktreeId, worktree);
    return worktree;
  }
  get(worktreeId: string): WorktreeAllocation | undefined {
    return this.worktrees.get(worktreeId);
  }
  list(projectId?: string): WorktreeAllocation[] {
    return [...this.worktrees.values()].filter(
      (worktree) => !projectId || worktree.projectId === projectId
    );
  }
}

class MemoryRunRepository implements RunRepositoryPort {
  runs = new Map<string, Run>();
  events: RunEvent[] = [];
  save(run: Run): Run {
    this.runs.set(run.runId, run);
    return run;
  }
  get(runId: string): Run | undefined {
    return this.runs.get(runId);
  }
  list(projectId?: string): Run[] {
    return [...this.runs.values()].filter((run) => !projectId || run.projectId === projectId);
  }
  appendEvent(event: Omit<RunEvent, "sequence">): RunEvent {
    const saved = { ...event, sequence: this.events.length };
    this.events.push(saved);
    return saved;
  }
  listEvents(runId: string): RunEvent[] {
    return this.events.filter((event) => event.runId === runId);
  }
}

function git(cwd: string, args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

function repo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "fulcrum-worktree-contract-"));
  git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.email", "test@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  writeFileSync(path.join(root, "README.md"), "base\n");
  git(root, ["add", "README.md"]);
  git(root, ["commit", "-m", "init"]);
  return root;
}

describe("worktree allocation contract", () => {
  it("allocates isolated worktree and reports clean merge readiness with approval required", () => {
    const root = repo();
    const projects = new MemoryProjectRepository();
    const taskRepo = new MemoryTaskRepository();
    const worktreeRepo = new MemoryWorktreeRepository();
    const projectService = new ProjectRegistryService(projects, new LocalTaskService(taskRepo));
    const project = projectService.register({ rootPath: root, name: "Repo" });
    const tasks = new LocalTaskService(taskRepo);
    const task = tasks.create({ projectId: project.projectId, title: "Deliver change" });
    const allocator = new WorktreeAllocationService(worktreeRepo, taskRepo, projects);
    const status = new WorktreeStatusService(worktreeRepo);

    const worktree = allocator.allocate({ taskId: task.taskId, branch: "fulcrum/test" });
    const inspected = status.inspect(worktree.worktreeId);

    expect(worktree.worktreeId).toMatch(/^wt_/);
    expect(worktree.path).toContain(".fulcrum-worktrees");
    expect(inspected.worktree.dirtyState).toBe("clean");
    expect(inspected.worktree.cleanupEligibility).toBe("requires_approval");
    expect(inspected.mergeReadiness).toBe("requires_approval");
  });

  it("removes a clean worktree only after operator approval", () => {
    const root = repo();
    const projects = new MemoryProjectRepository();
    const taskRepo = new MemoryTaskRepository();
    const worktreeRepo = new MemoryWorktreeRepository();
    const projectService = new ProjectRegistryService(projects, new LocalTaskService(taskRepo));
    const project = projectService.register({ rootPath: root, name: "Repo" });
    const tasks = new LocalTaskService(taskRepo);
    const task = tasks.create({ projectId: project.projectId, title: "Clean cleanup" });
    const allocator = new WorktreeAllocationService(worktreeRepo, taskRepo, projects);
    const status = new WorktreeStatusService(worktreeRepo);
    const worktree = allocator.allocate({ taskId: task.taskId, branch: "fulcrum/cleanup" });

    expect(() => status.cleanup(worktree.worktreeId)).toThrow(/approval/);
    const cleaned = status.cleanup(worktree.worktreeId, { approved: true });

    expect(cleaned.status).toBe("cleaned");
    expect(existsSync(worktree.path)).toBe(false);
  });

  it("allocates and activates a worktree when a run starts", () => {
    const root = repo();
    const projects = new MemoryProjectRepository();
    const taskRepo = new MemoryTaskRepository();
    const worktreeRepo = new MemoryWorktreeRepository();
    const runRepo = new MemoryRunRepository();
    const projectService = new ProjectRegistryService(projects, new LocalTaskService(taskRepo));
    const project = projectService.register({ rootPath: root, name: "Repo" });
    const tasks = new LocalTaskService(taskRepo);
    const task = tasks.create({ projectId: project.projectId, title: "Run allocation" });
    tasks.transition(task.taskId, "ready");
    const allocator = new WorktreeAllocationService(worktreeRepo, taskRepo, projects);
    const runs = new RunLifecycleService(runRepo, taskRepo, allocator, worktreeRepo);

    const run = runs.start({ taskId: task.taskId, agentId: "adapter_validation" });
    const worktree = worktreeRepo.get(run.worktreeId ?? "");

    expect(run.worktreeId).toMatch(/^wt_/);
    expect(worktree?.runId).toBe(run.runId);
    expect(worktree?.status).toBe("active");
  });
});
