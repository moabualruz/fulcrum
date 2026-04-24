import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  LocalTaskService,
  ProjectRegistryService,
  type ProjectOverview,
  type ProjectRepositoryPort,
  type TaskRepositoryPort
} from "@fulcrum/core";
import type { Project, Task } from "@fulcrum/shared";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cliRoot = path.join(repoRoot, "apps/cli");

class MemoryProjectRepository implements ProjectRepositoryPort {
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

class MemoryTaskRepository implements TaskRepositoryPort {
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

describe("project cockpit parity projection", () => {
  it("reports same project/task counts for CLI JSON and cockpit/API projections", () => {
    const taskService = new LocalTaskService(new MemoryTaskRepository());
    const projectService = new ProjectRegistryService(new MemoryProjectRepository(), taskService);
    const first = projectService.register({
      rootPath: mkdtempSync(path.join(tmpdir(), "fulcrum-parity-a-"))
    });
    projectService.register({ rootPath: mkdtempSync(path.join(tmpdir(), "fulcrum-parity-b-")) });
    taskService.create({ projectId: first.projectId, title: "First local task" });

    const cliJson = projectService.overview();
    const cockpitProjection = projectService.overview();

    expect(cockpitProjection).toEqual(cliJson);
    expect(cockpitProjection).toHaveLength(2);
    expect(cockpitProjection[0]?.counts.tasks).toBe(1);
  });

  it("persists CLI project registrations across separate invocations", () => {
    const stateRoot = mkdtempSync(path.join(tmpdir(), "fulcrum-cli-state-"));
    const rootPath = mkdtempSync(path.join(tmpdir(), "fulcrum-cli-project-"));
    const env = { ...process.env, FULCRUM_STATE_ROOT: stateRoot };

    const registerOutput = execFileSync(
      "pnpm",
      ["exec", "tsx", "src/main.ts", "--json", "project", "register", rootPath],
      {
        cwd: cliRoot,
        env,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"]
      }
    );
    const registered = JSON.parse(registerOutput) as { data: Project };
    execFileSync(
      "pnpm",
      [
        "exec",
        "tsx",
        "src/main.ts",
        "--json",
        "task",
        "create",
        "--project",
        registered.data.projectId,
        "--title",
        "Merge task",
        "--label",
        "merge"
      ],
      {
        cwd: cliRoot,
        env,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"]
      }
    );
    const listOutput = execFileSync(
      "pnpm",
      ["exec", "tsx", "src/main.ts", "--json", "project", "list"],
      {
        cwd: cliRoot,
        env,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"]
      }
    );

    const parsed = JSON.parse(listOutput) as { data: ProjectOverview[] };
    expect(parsed.data).toHaveLength(1);
    expect(parsed.data[0]?.project.rootPath).toBe(rootPath);
    expect(parsed.data[0]?.counts.merge).toBe(1);
  });
});
