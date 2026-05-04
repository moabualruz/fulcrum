import type { ProductDb } from "../../../../product-kernel/db/types.ts";
import { newUlid } from "../../../../product-kernel/ids.ts";
import { eventDispatcher } from "../../../../product-kernel/event-dispatcher.ts";

export interface ProjectConnectorRow {
  id: string;
  org_id: string;
  project_id: string;
  connector_type: string;
  enabled: boolean;
  config: Record<string, unknown>;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertConnectorInput {
  orgId: string;
  projectId: string;
  connectorType: string;
  enabled?: boolean;
  config?: Record<string, unknown>;
}

export async function upsertProjectConnector(
  db: ProductDb,
  input: UpsertConnectorInput,
): Promise<{ id: string }> {
  // Check existing
  const existing = await db.query<{ id: string }>(
    `SELECT id FROM project_connectors WHERE project_id = $1 AND connector_type = $2`,
    [input.projectId, input.connectorType],
  );
  if (existing[0]) {
    const id = existing[0].id;
    const sets: string[] = [];
    const params: (string | number | boolean | null)[] = [];
    if (input.enabled !== undefined) {
      params.push(input.enabled);
      sets.push(`enabled = $${params.length}`);
    }
    if (input.config !== undefined) {
      params.push(JSON.stringify(input.config));
      sets.push(`config = $${params.length}::jsonb`);
    }
    if (sets.length > 0) {
      sets.push("updated_at = now()");
      params.push(id);
      await db.query(
        `UPDATE project_connectors SET ${sets.join(", ")} WHERE id = $${params.length}`,
        params,
      );
    }
    await eventDispatcher.dispatch(db, {
      orgId: input.orgId,
      projectId: input.projectId,
      actor: "system",
      subjectKind: "project_connector",
      subjectId: id,
      verb: "updated",
      payload: { connectorType: input.connectorType },
    });
    return { id };
  }

  const id = newUlid();
  await db.query(
    `INSERT INTO project_connectors (id, org_id, project_id, connector_type, enabled, config)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      id,
      input.orgId,
      input.projectId,
      input.connectorType,
      input.enabled ?? false,
      JSON.stringify(input.config ?? {}),
    ],
  );
  await eventDispatcher.dispatch(db, {
    orgId: input.orgId,
    projectId: input.projectId,
    actor: "system",
    subjectKind: "project_connector",
    subjectId: id,
    verb: "created",
    payload: { connectorType: input.connectorType },
  });
  return { id };
}

export async function syncProjectConnector(
  db: ProductDb,
  id: string,
): Promise<{ ok: true }> {
  const rows = await db.query<{ org_id: string; project_id: string; enabled: boolean }>(
    `UPDATE project_connectors SET last_synced_at = now(), updated_at = now() WHERE id = $1
       RETURNING org_id, project_id, enabled`,
    [id],
  );
  if (!rows[0]) throw new Error(`syncProjectConnector: not found: ${id}`);
  if (!rows[0].enabled) throw new Error(`syncProjectConnector: connector not enabled: ${id}`);
  await eventDispatcher.dispatch(db, {
    orgId: rows[0].org_id,
    projectId: rows[0].project_id,
    actor: "system",
    subjectKind: "project_connector",
    subjectId: id,
    verb: "synced",
  });
  return { ok: true };
}

export async function listProjectConnectors(
  db: ProductDb,
  projectId: string,
): Promise<ProjectConnectorRow[]> {
  return db.query<ProjectConnectorRow>(
    `SELECT * FROM project_connectors WHERE project_id = $1 ORDER BY connector_type ASC`,
    [projectId],
  );
}
