import type Database from "better-sqlite3";
import { TaskSchema, type Task } from "@fulcrum/shared";

type TaskRow = Record<string, unknown>;

function parseJsonArray(value: unknown): string[] {
  if (typeof value !== "string") {
    return [];
  }
  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed) ? parsed.map(String) : [];
}

function fromRow(row: TaskRow): Task {
  return TaskSchema.parse({
    taskId: row.task_id,
    projectId: row.project_id,
    title: row.title,
    descriptionSnapshot: row.description_snapshot ?? undefined,
    status: row.status,
    priority: row.priority,
    labels: parseJsonArray(row.labels_json),
    blockerState: row.blocker_state ?? undefined,
    currentRunId: row.current_run_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    schemaVersion: row.schema_version
  });
}

export class TaskRepository {
  constructor(private readonly db: Database.Database) {}

  save(task: Task): Task {
    const parsed = TaskSchema.parse(task);
    this.db
      .prepare(
        `INSERT INTO tasks (
          task_id, project_id, title, description_snapshot, status, priority, labels_json,
          blocker_state, current_run_id, created_at, updated_at, schema_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(task_id) DO UPDATE SET
          title = excluded.title,
          description_snapshot = excluded.description_snapshot,
          status = excluded.status,
          priority = excluded.priority,
          labels_json = excluded.labels_json,
          blocker_state = excluded.blocker_state,
          current_run_id = excluded.current_run_id,
          updated_at = excluded.updated_at,
          schema_version = excluded.schema_version`
      )
      .run(
        parsed.taskId,
        parsed.projectId,
        parsed.title,
        parsed.descriptionSnapshot ?? null,
        parsed.status,
        parsed.priority,
        JSON.stringify(parsed.labels),
        parsed.blockerState ?? null,
        parsed.currentRunId ?? null,
        parsed.createdAt,
        parsed.updatedAt,
        parsed.schemaVersion
      );
    return parsed;
  }

  get(taskId: string): Task | undefined {
    const row = this.db.prepare("SELECT * FROM tasks WHERE task_id = ?").get(taskId);
    return row ? fromRow(row as TaskRow) : undefined;
  }

  list(projectId?: string): Task[] {
    const statement = projectId
      ? this.db.prepare("SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at ASC")
      : this.db.prepare("SELECT * FROM tasks ORDER BY created_at ASC");
    return (projectId ? statement.all(projectId) : statement.all()).map((row) =>
      fromRow(row as TaskRow)
    );
  }
}
