import { Injectable } from "@nestjs/common";

import type { SqlExecutor } from "@platform-core/infrastructure/application-database/sql.ts";
import { SearchIndexHook, type SearchDocumentInput } from "./base.ts";
import { tableColumns } from "./entity-helpers.ts";

interface RepoRow {
  id: string;
  org_id: string;
  project_id: string | null;
  slug: string;
  root_path?: string | null;
  default_branch: string | null;
  remote_url: string | null;
  name?: string | null;
  description?: string | null;
}

@Injectable()
export class RepoIndexer extends SearchIndexHook {
  override readonly kind = "repo";

  constructor(db: SqlExecutor) {
    super(db);
  }

  protected override async buildDocument(entityId: string, orgId: string): Promise<SearchDocumentInput> {
    const columns = await tableColumns(this.db, "repos");
    const optionalSelects = [
      columns.has("name") ? "name" : "NULL::text AS name",
      columns.has("description") ? "description" : "NULL::text AS description",
      columns.has("root_path") ? "root_path" : "NULL::text AS root_path",
      columns.has("default_branch") ? "default_branch" : "NULL::text AS default_branch",
      columns.has("remote_url") ? "remote_url" : "NULL::text AS remote_url",
    ];
    const rows = await this.db.query<RepoRow>(
      `SELECT id, org_id, project_id, slug, ${optionalSelects.join(", ")}
         FROM repos
        WHERE id = $1 AND org_id = $2`,
      [entityId, orgId],
    );
    const repo = rows[0];
    if (!repo) throw new Error(`Repo not found for search indexing: ${entityId}`);

    return {
      orgId: repo.org_id,
      projectId: repo.project_id,
      sourceKind: this.kind,
      sourceId: repo.id,
      title: repo.name || repo.slug,
      body: [repo.description ?? "", repo.default_branch ?? "", repo.remote_url ?? "", repo.root_path ?? ""]
        .filter(Boolean)
        .join(" "),
      labels: [],
      metadata: {
        default_branch: repo.default_branch,
        project_id: repo.project_id,
      },
    };
  }

  async listEntityIds(orgId: string): Promise<string[]> {
    const rows = await this.db.query<{ id: string }>(
      `SELECT id FROM repos WHERE org_id = $1 ORDER BY id`,
      [orgId],
    );
    return rows.map((row) => row.id);
  }
}
