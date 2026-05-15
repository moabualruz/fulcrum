import { Injectable } from "@nestjs/common";

import type { SqlExecutor } from "@platform-core/infrastructure/application-database/sql.ts";
import { SearchIndexHook, type SearchDocumentInput } from "./base.ts";
import { tableColumns } from "./entity-helpers.ts";

interface MemoryRow {
  id: string;
  org_id: string;
  project_id: string | null;
  scope?: string | null;
  global?: boolean | null;
  kind: string;
  body: string;
  tags?: string[];
  importance?: string | null;
}

@Injectable()
export class MemoryIndexer extends SearchIndexHook {
  override readonly kind = "memory";

  constructor(db: SqlExecutor) {
    super(db);
  }

  protected override async buildDocument(entityId: string, orgId: string): Promise<SearchDocumentInput> {
    const columns = await tableColumns(this.db, "memories");
    const optionalSelects = [
      columns.has("tags") ? "tags" : "'{}'::text[] AS tags",
      columns.has("importance") ? "importance" : "'medium'::text AS importance",
      columns.has("global") ? "global" : "NULL::boolean AS global",
    ];
    const rows = await this.db.query<MemoryRow>(
      `SELECT id, org_id, project_id, scope, kind, body, ${optionalSelects.join(", ")}
         FROM memories
        WHERE id = $1 AND org_id = $2`,
      [entityId, orgId],
    );
    const memory = rows[0];
    if (!memory) throw new Error(`Memory not found for search indexing: ${entityId}`);
    const scope = memory.scope ?? (memory.global ? "global" : "project");

    return {
      orgId: memory.org_id,
      projectId: memory.project_id,
      sourceKind: this.kind,
      sourceId: memory.id,
      title: `${memory.kind} memory`,
      body: memory.body,
      labels: memory.tags ?? [],
      metadata: {
        importance: memory.importance ?? "medium",
        scope,
      },
    };
  }

  async listEntityIds(orgId: string): Promise<string[]> {
    const rows = await this.db.query<{ id: string }>(
      `SELECT id FROM memories WHERE org_id = $1 ORDER BY id`,
      [orgId],
    );
    return rows.map((row) => row.id);
  }
}
