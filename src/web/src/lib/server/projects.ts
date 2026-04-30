import type { ProductDb } from "../../../../product-kernel/db/types.ts";
import { createProject, appendEvent } from "../../../../product-kernel/store/repositories.ts";

export interface CreateProjectInput {
  orgId: string;
  slug: string;
  name: string;
  description?: string | null;
}

export interface UpdateProjectInput {
  id: string;
  name?: string;
  description?: string | null;
}

export async function createProjectAction(
  db: ProductDb,
  input: CreateProjectInput,
): Promise<{ id: string }> {
  const project = await createProject(db, input);
  return { id: project.id };
}

export async function updateProjectAction(
  db: ProductDb,
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
  const rows = await db.query<{ org_id: string }>(
    `UPDATE projects SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING org_id`,
    params,
  );
  const orgId = rows[0]?.org_id;
  if (!orgId) throw new Error(`updateProjectAction: project not found: ${input.id}`);
  await appendEvent(db, {
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
  db: ProductDb,
  id: string,
): Promise<{ ok: true }> {
  // events.project_id has an FK to projects(id); strip dependents first so the
  // delete is permitted. The kernel does not yet ship a cascade or a helper
  // here — see "Kernel surface notes" in the issue Comments.
  await db.query(`DELETE FROM events WHERE project_id = $1`, [id]);
  const rows = await db.query<{ org_id: string }>(
    `DELETE FROM projects WHERE id = $1 RETURNING org_id`,
    [id],
  );
  const orgId = rows[0]?.org_id;
  if (orgId) {
    await appendEvent(db, {
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
