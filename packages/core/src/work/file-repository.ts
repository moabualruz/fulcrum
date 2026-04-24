import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ProjectSchema, TaskSchema, type Project, type Task } from "@fulcrum/shared";
import type { ProjectRepositoryPort } from "../projects/service.js";
import type { TaskRepositoryPort } from "../tasks/service.js";

interface WorkState {
  projects: Project[];
  tasks: Task[];
}

const emptyState: WorkState = { projects: [], tasks: [] };

export class FileWorkRepository {
  constructor(private readonly stateFile: string) {}

  save(projectOrTask: Project | Task): Project | Task {
    return "projectId" in projectOrTask && "rootPath" in projectOrTask
      ? this.saveProject(projectOrTask)
      : this.saveTask(projectOrTask as Task);
  }

  get(id: string): Project | Task | undefined {
    return this.getProject(id) ?? this.getTask(id);
  }

  findByRoot(rootPath: string): Project | undefined {
    return this.read().projects.find((project) => project.rootPath === rootPath);
  }

  list(projectId?: string): Array<Project | Task> {
    const state = this.read();
    return projectId ? state.tasks.filter((task) => task.projectId === projectId) : state.projects;
  }

  saveProject(project: Project): Project {
    const parsed = ProjectSchema.parse(project);
    const state = this.read();
    state.projects = [
      parsed,
      ...state.projects.filter((item) => item.projectId !== parsed.projectId)
    ];
    this.write(state);
    return parsed;
  }

  getProject(projectId: string): Project | undefined {
    return this.read().projects.find((project) => project.projectId === projectId);
  }

  listProjects(): Project[] {
    return this.read().projects;
  }

  saveTask(task: Task): Task {
    const parsed = TaskSchema.parse(task);
    const state = this.read();
    state.tasks = [parsed, ...state.tasks.filter((item) => item.taskId !== parsed.taskId)];
    this.write(state);
    return parsed;
  }

  getTask(taskId: string): Task | undefined {
    return this.read().tasks.find((task) => task.taskId === taskId);
  }

  listTasks(projectId?: string): Task[] {
    const tasks = this.read().tasks;
    return projectId ? tasks.filter((task) => task.projectId === projectId) : tasks;
  }

  private read(): WorkState {
    try {
      const data = JSON.parse(readFileSync(this.stateFile, "utf8")) as Partial<WorkState>;
      return {
        projects: (data.projects ?? []).map((project) => ProjectSchema.parse(project)),
        tasks: (data.tasks ?? []).map((task) => TaskSchema.parse(task))
      };
    } catch {
      return { ...emptyState };
    }
  }

  private write(state: WorkState): void {
    mkdirSync(path.dirname(this.stateFile), { recursive: true });
    writeFileSync(this.stateFile, JSON.stringify(state, null, 2));
  }
}

export class FileProjectRepository implements ProjectRepositoryPort {
  constructor(private readonly work: FileWorkRepository) {}

  save(project: Project): Project {
    return this.work.saveProject(project);
  }

  get(projectId: string): Project | undefined {
    return this.work.getProject(projectId);
  }

  findByRoot(rootPath: string): Project | undefined {
    return this.work.findByRoot(rootPath);
  }

  list(): Project[] {
    return this.work.listProjects();
  }
}

export class FileTaskRepository implements TaskRepositoryPort {
  constructor(private readonly work: FileWorkRepository) {}

  save(task: Task): Task {
    return this.work.saveTask(task);
  }

  get(taskId: string): Task | undefined {
    return this.work.getTask(taskId);
  }

  list(projectId?: string): Task[] {
    return this.work.listTasks(projectId);
  }
}
