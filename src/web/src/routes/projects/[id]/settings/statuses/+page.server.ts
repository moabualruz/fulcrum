import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { openProductDb, getDefaultOrgId } from "@fulcrum/lib/server/db";
import {
  createProjectStatus,
  updateProjectStatus,
  deleteProjectStatus,
  listProjectStatuses,
} from "@fulcrum/lib/server/project-statuses";

export const load: PageServerLoad = async ({ params }) => {
  const db = await openProductDb();
  try {
    const orgId = await getDefaultOrgId(db);
    const projRows = await db.query<{ id: string }>(
      `SELECT id FROM projects WHERE id = $1 AND org_id = $2`,
      [params.id, orgId],
    );
    if (projRows.length === 0) throw error(404, "Project not found");
    const statuses = await listProjectStatuses(db, params.id);
    return { statuses, projectId: params.id };
  } finally {
    await db.close();
  }
};

export const actions: Actions = {
  create: async ({ params, request }) => {
    const fd = await request.formData();
    const name = (fd.get("name") as string | null)?.trim();
    const color = (fd.get("color") as string | null)?.trim() || "#6b7280";
    const isFinal = fd.get("isFinal") === "on";
    if (!name) return fail(400, { error: "Name is required" });
    const db = await openProductDb();
    try {
      const orgId = await getDefaultOrgId(db);
      await createProjectStatus(db, {
        orgId,
        projectId: params.id!,
        name,
        color,
        isFinal,
      });
    } finally {
      await db.close();
    }
    return { success: true };
  },
  update: async ({ request }) => {
    const fd = await request.formData();
    const id = fd.get("id") as string | null;
    if (!id) return fail(400, { error: "id required" });
    const name = fd.get("name") as string | null;
    const color = fd.get("color") as string | null;
    const isFinalRaw = fd.get("isFinal");
    const sortOrderRaw = fd.get("sortOrder") as string | null;
    const db = await openProductDb();
    try {
      await updateProjectStatus(db, {
        id,
        ...(name ? { name: name.trim() } : {}),
        ...(color ? { color: color.trim() } : {}),
        ...(isFinalRaw != null ? { isFinal: isFinalRaw === "on" } : {}),
        ...(sortOrderRaw != null ? { sortOrder: Number(sortOrderRaw) } : {}),
      });
    } finally {
      await db.close();
    }
    return { success: true };
  },
  delete: async ({ request }) => {
    const fd = await request.formData();
    const id = fd.get("id") as string | null;
    if (!id) return fail(400, { error: "id required" });
    const db = await openProductDb();
    try {
      await deleteProjectStatus(db, id);
    } finally {
      await db.close();
    }
    return { success: true };
  },
};
