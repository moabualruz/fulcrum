import type { SqlExecutor } from "../../../../db/sql.ts";
import { createProject, eventDispatcher } from "../../../../application/legacy/web-runtime.ts";

export interface CreateProjectInput {
  orgId: string;
  slug: string;
  name: string;
  description?: string | null;
}

export interface UpdateProjectInput {
  id: string;
  orgId: string;
  name?: string;
  description?: string | null;
}

export async function createProjectAction(
  db: SqlExecutor,
  input: CreateProjectInput,
): Promise<{ id: string }> {
  const project = await createProject(db, input);
  return { id: project.id };
}

export async function updateProjectAction(
  db: SqlExecutor,
  input: UpdateProjectInput,
): Promise<{ ok: true }> {
  if (!input.id) throw new Error("updateProjectAction: id is required");
  const sets: string[] = [];
  const params: (string | null)[] = [];
  const changed: string[] = [];
  if (input.name !== undefined) {
    params.push(input.name);
    sets.push(`name = $${params.length}`);
    changed.push("name");
  }
  if (input.description !== undefined) {
    params.push(input.description);
    sets.push(`description = $${params.length}`);
    changed.push("description");
  }
  if (changed.length === 0) throw new Error("updateProjectAction: no fields to update");
  sets.push(`updated_at = now()`);
  params.push(input.id);
  const idIdx = params.length;
  params.push(input.orgId);
  const orgIdx = params.length;
  const rows = await db.query<{ org_id: string }>(
    `UPDATE projects SET ${sets.join(", ")}
       WHERE id = $${idIdx} AND org_id = $${orgIdx}
     RETURNING org_id`,
    params,
  );
  const orgId = rows[0]?.org_id;
  if (!orgId) throw new Error(`updateProjectAction: project not found: ${input.id}`);
  await eventDispatcher.dispatch(db, {
    orgId,
    projectId: input.id,
    actor: "system",
    subjectKind: "project",
    subjectId: input.id,
    verb: "updated",
    payload: { changed },
  });
  return { ok: true };
}

export async function deleteProjectAction(
  db: SqlExecutor,
  id: string,
  orgId: string,
): Promise<{ ok: true }> {
  // events.project_id has an FK to projects(id); strip dependents first so the
  // delete is permitted. Both DELETEs scope by org_id so a forged ULID from
  // another tenant cannot reach into our row.
  await db.query(
    `DELETE FROM events WHERE project_id = $1 AND org_id = $2`,
    [id, orgId],
  );
  const rows = await db.query<{ org_id: string }>(
    `DELETE FROM projects WHERE id = $1 AND org_id = $2 RETURNING org_id`,
    [id, orgId],
  );
  if (rows.length > 0) {
    await eventDispatcher.dispatch(db, {
      orgId,
      projectId: null,
      actor: "system",
      subjectKind: "project",
      subjectId: id,
      verb: "deleted",
    });
  }
  return { ok: true };
}
