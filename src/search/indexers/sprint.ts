import { injectable as Injectable } from "@needle-di/core";

import type { ProductDb } from "../../product-kernel/db/types.ts";
import { SearchIndexHook, type SearchDocumentInput } from "./base.ts";
import { tableColumns } from "./entity-helpers.ts";

interface SprintRow {
  id: string;
  org_id: string;
  project_id: string | null;
  name: string;
  goal: string | null;
  status?: string | null;
}

@Injectable()
export class SprintIndexer extends SearchIndexHook {
  override readonly kind = "sprint";

  constructor(db: ProductDb) {
    super(db);
  }

  protected override async buildDocument(entityId: string, orgId: string): Promise<SearchDocumentInput> {
    const columns = await tableColumns(this.db, "sprints");
    const optionalSelects = [
      columns.has("goal") ? "goal" : "NULL::text AS goal",
      columns.has("status") ? "status" : "'planned'::text AS status",
    ];
    const rows = await this.db.query<SprintRow>(
      `SELECT id, org_id, project_id, name, ${optionalSelects.join(", ")}
         FROM sprints
        WHERE id = $1 AND org_id = $2`,
      [entityId, orgId],
    );
    const sprint = rows[0];
    if (!sprint) throw new Error(`Sprint not found for search indexing: ${entityId}`);

    return {
      orgId: sprint.org_id,
      projectId: sprint.project_id,
      sourceKind: this.kind,
      sourceId: sprint.id,
      title: sprint.name,
      body: sprint.goal ?? "",
      labels: [],
      metadata: {
        status: sprint.status ?? "planned",
        project_id: sprint.project_id,
      },
    };
  }

  async listEntityIds(orgId: string): Promise<string[]> {
    const rows = await this.db.query<{ id: string }>(
      `SELECT id FROM sprints WHERE org_id = $1 ORDER BY id`,
      [orgId],
    );
    return rows.map((row) => row.id);
  }
}
