import {
  makeId,
  SCHEMA_VERSION,
  TaskSchema,
  assertTaskTransition,
  type Task
} from "@fulcrum/shared";

export interface TaskRepositoryPort {
  save(task: Task): Task;
  get(taskId: string): Task | undefined;
  list(projectId?: string): Task[];
}

export interface LocalTaskInput {
  projectId: string;
  title: string;
  description?: string;
  priority?: Task["priority"];
  labels?: string[];
}

export class LocalTaskService {
  constructor(private readonly tasks: TaskRepositoryPort) {}

  create(input: LocalTaskInput): Task {
    const now = new Date().toISOString();
    return this.tasks.save(
      TaskSchema.parse({
        taskId: makeId("task", `${input.projectId}-${input.title}-${now}`),
        projectId: input.projectId,
        title: input.title,
        descriptionSnapshot: input.description,
        status: "pending",
        priority: input.priority ?? "normal",
        labels: input.labels ?? [],
        createdAt: now,
        updatedAt: now,
        schemaVersion: SCHEMA_VERSION
      })
    );
  }

  list(projectId?: string): Task[] {
    return this.tasks.list(projectId);
  }

  get(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  transition(taskId: string, status: Task["status"]): Task {
    const current = this.tasks.get(taskId);
    if (!current) {
      throw new Error(`Task not found: ${taskId}`);
    }
    assertTaskTransition(current.status, status);
    return this.tasks.save({
      ...current,
      status,
      updatedAt: new Date().toISOString()
    });
  }
}
