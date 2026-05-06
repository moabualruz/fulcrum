import { injectable as Injectable } from "@needle-di/core";

import type { SqlExecutor } from "../../db/sql.ts";
import { SearchIndexHook, type SearchDocumentInput } from "./base.ts";
import { tableColumns, textFromUnknown } from "./entity-helpers.ts";

interface TaskRow {
  id: string;
  org_id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  status: string | null;
  assignee_id?: string | null;
  sprint_id?: string | null;
  custom_fields?: unknown;
}

@Injectable()
export class TaskIndexer extends SearchIndexHook {
  override readonly kind = "task";

  constructor(db: SqlExecutor) {
    super(db);
  }

  protected override async buildDocument(entityId: string, orgId: string): Promise<SearchDocumentInput> {
    const columns = await tableColumns(this.db, "tasks");
    const optionalSelects = [
      columns.has("assignee_id") ? "assignee_id" : "NULL::text AS assignee_id",
      columns.has("sprint_id") ? "sprint_id" : "NULL::text AS sprint_id",
      columns.has("custom_fields") ? "custom_fields" : "'{}'::jsonb AS custom_fields",
    ];
    const rows = await this.db.query<TaskRow>(
      `SELECT id, org_id, project_id, title, description, status, ${optionalSelects.join(", ")}
         FROM tasks
        WHERE id = $1 AND org_id = $2`,
      [entityId, orgId],
    );
    const task = rows[0];
    if (!task) throw new Error(`Task not found for search indexing: ${entityId}`);

    return {
      orgId: task.org_id,
      projectId: task.project_id,
      sourceKind: this.kind,
      sourceId: task.id,
      title: task.title,
      body: [task.description ?? "", textFromUnknown(task.custom_fields)].filter(Boolean).join(" "),
      labels: [],
      metadata: {
        status: task.status,
        assignee_id: task.assignee_id ?? null,
        sprint_id: task.sprint_id ?? null,
      },
    };
  }

  async listEntityIds(orgId: string): Promise<string[]> {
    const rows = await this.db.query<{ id: string }>(
      `SELECT id FROM tasks WHERE org_id = $1 ORDER BY id`,
      [orgId],
    );
    return rows.map((row) => row.id);
  }
}
