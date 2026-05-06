/**
 * Project statuses — migrated from raw LegacyDatabaseHandle to MikroORM EntityManager.
 * ARCH-01/ARCH-02: All DB access via MikroORM EM connection.
 */

import type { EntityManager } from "@mikro-orm/postgresql";
import { randomUUID } from "node:crypto";
import { eventDispatcher } from "./application-compat";
import { ormSqlConnection } from "./orm-helpers.ts";

export interface ProjectStatusRow {
  id: string;
  org_id: string;
  project_id: string;
  name: string;
  color: string;
  sort_order: number;
  is_final: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateStatusInput {
  orgId: string;
  projectId: string;
  name: string;
  color?: string;
  isFinal?: boolean;
}

export interface UpdateStatusInput {
  id: string;
  name?: string;
  color?: string;
  sortOrder?: number;
  isFinal?: boolean;
}

export async function createProjectStatus(
  em: EntityManager,
  input: CreateStatusInput,
): Promise<{ id: string }> {
  const id = randomUUID();
  const conn = ormSqlConnection(em);
  const maxRows = await conn.execute<{ mx: number | null }[]>(
    `SELECT MAX(sort_order) AS mx FROM project_statuses WHERE project_id = $1`,
    [input.projectId],
  );
  const nextOrder = ((maxRows[0]?.mx as number | null) ?? -1) + 1;
  await conn.execute(
    `INSERT INTO project_statuses (id, org_id, project_id, name, color, sort_order, is_final)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, input.orgId, input.projectId, input.name, input.color ?? "#6b7280", nextOrder, input.isFinal ?? false],
  );
  await eventDispatcher.dispatch(em, {
    orgId: input.orgId,
    projectId: input.projectId,
    actor: "system",
    subjectKind: "project_status",
    subjectId: id,
    verb: "created",
    payload: { name: input.name },
  });
  return { id };
}

export async function updateProjectStatus(
  em: EntityManager,
  input: UpdateStatusInput,
): Promise<{ ok: true }> {
  const sets: string[] = [];
  const params: (string | number | boolean | null)[] = [];
  const changed: string[] = [];
  const push = (col: string, val: string | number | boolean | null) => {
    params.push(val);
    sets.push(`${col} = $${params.length}`);
    changed.push(col);
  };
  if (input.name !== undefined) push("name", input.name);
  if (input.color !== undefined) push("color", input.color);
  if (input.sortOrder !== undefined) push("sort_order", input.sortOrder);
  if (input.isFinal !== undefined) push("is_final", input.isFinal);
  if (changed.length === 0) throw new Error("updateProjectStatus: no fields to update");
  sets.push("updated_at = now()");
  params.push(input.id);
  const conn = ormSqlConnection(em);
  const rows = await conn.execute<{ org_id: string; project_id: string }[]>(
    `UPDATE project_statuses SET ${sets.join(", ")} WHERE id = $${params.length}
       RETURNING org_id, project_id`,
    params,
  );
  if (!rows[0]) throw new Error(`updateProjectStatus: not found: ${input.id}`);
  await eventDispatcher.dispatch(em, {
    orgId: rows[0].org_id,
    projectId: rows[0].project_id,
    actor: "system",
    subjectKind: "project_status",
    subjectId: input.id,
    verb: "updated",
    payload: { changed },
  });
  return { ok: true };
}

export async function deleteProjectStatus(
  em: EntityManager,
  id: string,
): Promise<{ ok: true }> {
  const conn = ormSqlConnection(em);
  const rows = await conn.execute<{ org_id: string; project_id: string }[]>(
    `DELETE FROM project_statuses WHERE id = $1 RETURNING org_id, project_id`,
    [id],
  );
  if (rows[0]) {
    await eventDispatcher.dispatch(em, {
      orgId: rows[0].org_id,
      projectId: rows[0].project_id,
      actor: "system",
      subjectKind: "project_status",
      subjectId: id,
      verb: "deleted",
    });
  }
  return { ok: true };
}

export async function listProjectStatuses(
  em: EntityManager,
  projectId: string,
): Promise<ProjectStatusRow[]> {
  const conn = ormSqlConnection(em);
  return conn.execute<ProjectStatusRow[]>(
    `SELECT * FROM project_statuses WHERE project_id = $1 ORDER BY sort_order ASC, created_at ASC`,
    [projectId],
  );
}
