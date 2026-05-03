import { injectable as Injectable } from "@needle-di/core";

import type { ProductDb } from "../../product-kernel/db/types.ts";
import { SearchIndexHook, type SearchDocumentInput } from "./base.ts";
import { tableColumns } from "./entity-helpers.ts";

interface AgentRunRow {
  id: string;
  org_id: string;
  project_id: string | null;
  task_id: string | null;
  agent: string;
  agent_name?: string | null;
  prompt: string | null;
  status: string;
}

@Injectable()
export class AgentRunIndexer extends SearchIndexHook {
  override readonly kind = "run";

  constructor(db: ProductDb) {
    super(db);
  }

  protected override async buildDocument(entityId: string, orgId: string): Promise<SearchDocumentInput> {
    const columns = await tableColumns(this.db, "agent_runs");
    const optionalSelects = [
      columns.has("agent_name") ? "agent_name" : "NULL::text AS agent_name",
      columns.has("task_id") ? "task_id" : "NULL::text AS task_id",
      columns.has("prompt") ? "prompt" : "NULL::text AS prompt",
    ];
    const rows = await this.db.query<AgentRunRow>(
      `SELECT id, org_id, project_id, agent, status, ${optionalSelects.join(", ")}
         FROM agent_runs
        WHERE id = $1 AND org_id = $2`,
      [entityId, orgId],
    );
    const run = rows[0];
    if (!run) throw new Error(`Agent run not found for search indexing: ${entityId}`);
    const agent = run.agent_name || run.agent;

    return {
      orgId: run.org_id,
      projectId: run.project_id,
      sourceKind: this.kind,
      sourceId: run.id,
      title: `${agent} run`,
      body: [run.prompt ?? "", run.status, agent].filter(Boolean).join(" "),
      labels: [],
      metadata: {
        status: run.status,
        task_id: run.task_id ?? null,
        agent,
      },
    };
  }

  async listEntityIds(orgId: string): Promise<string[]> {
    const rows = await this.db.query<{ id: string }>(
      `SELECT id FROM agent_runs WHERE org_id = $1 ORDER BY id`,
      [orgId],
    );
    return rows.map((row) => row.id);
  }
}
