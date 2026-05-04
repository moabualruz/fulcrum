import type { ProductDb } from "../../../../product-kernel/db/types.ts";
import { newUlid } from "../../../../product-kernel/ids.ts";
import { eventDispatcher } from "../../../../product-kernel/event-dispatcher.ts";

export type ViewScope = "org" | "project" | "private";

export const VIEW_SCOPES: readonly ViewScope[] = ["org", "project", "private"] as const;

export interface SavedViewRow {
  id: string;
  org_id: string;
  project_id: string;
  name: string;
  scope: ViewScope;
  owner_id: string | null;
  filters: Record<string, unknown>;
  sort_by: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateViewInput {
  orgId: string;
  projectId: string;
  name: string;
  scope?: ViewScope;
  ownerId?: string | null;
  filters?: Record<string, unknown>;
  sortBy?: string | null;
  isDefault?: boolean;
}

export interface UpdateViewInput {
  id: string;
  name?: string;
  scope?: ViewScope;
  filters?: Record<string, unknown>;
  sortBy?: string | null;
  isDefault?: boolean;
}

function assertScope(v: unknown, label: string): asserts v is ViewScope {
  if (!VIEW_SCOPES.includes(v as ViewScope)) throw new Error(`${label}: invalid scope ${String(v)}`);
}

export async function createSavedView(
  db: ProductDb,
  input: CreateViewInput,
): Promise<{ id: string }> {
  const scope = input.scope ?? "project";
  assertScope(scope, "createSavedView");
  const id = newUlid();

  // If setting as default, clear other defaults for this project
  if (input.isDefault) {
    await db.query(
      `UPDATE saved_views SET is_default = false WHERE project_id = $1 AND is_default = true`,
      [input.projectId],
    );
  }

  await db.query(
    `INSERT INTO saved_views (id, org_id, project_id, name, scope, owner_id, filters, sort_by, is_default)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)`,
    [
      id,
      input.orgId,
      input.projectId,
      input.name,
      scope,
      input.ownerId ?? null,
      JSON.stringify(input.filters ?? {}),
      input.sortBy ?? null,
      input.isDefault ?? false,
    ],
  );
  await eventDispatcher.dispatch(db, {
    orgId: input.orgId,
    projectId: input.projectId,
    actor: "system",
    subjectKind: "saved_view",
    subjectId: id,
    verb: "created",
    payload: { name: input.name, scope },
  });
  return { id };
}

export async function updateSavedView(
  db: ProductDb,
  input: UpdateViewInput,
): Promise<{ ok: true }> {
  if (!input.id) throw new Error("updateSavedView: id required");
  const sets: string[] = [];
  const params: (string | number | boolean | null)[] = [];
  const changed: string[] = [];
  const push = (col: string, val: string | number | boolean | null) => {
    params.push(val);
    sets.push(`${col} = $${params.length}`);
    changed.push(col);
  };
  if (input.name !== undefined) push("name", input.name);
  if (input.scope !== undefined) {
    assertScope(input.scope, "updateSavedView");
    push("scope", input.scope);
  }
  if (input.filters !== undefined) {
    params.push(JSON.stringify(input.filters));
    sets.push(`filters = $${params.length}::jsonb`);
    changed.push("filters");
  }
  if (input.sortBy !== undefined) push("sort_by", input.sortBy);
  if (input.isDefault !== undefined) push("is_default", input.isDefault);
  if (changed.length === 0) throw new Error("updateSavedView: no fields to update");

  // If setting as default, clear other defaults first
  if (input.isDefault) {
    // Need project_id to scope the clear
    const viewRows = await db.query<{ project_id: string }>(
      `SELECT project_id FROM saved_views WHERE id = $1`,
      [input.id],
    );
    if (viewRows[0]) {
      await db.query(
        `UPDATE saved_views SET is_default = false WHERE project_id = $1 AND is_default = true AND id != $2`,
        [viewRows[0].project_id, input.id],
      );
    }
  }

  sets.push("updated_at = now()");
  params.push(input.id);
  const rows = await db.query<{ org_id: string; project_id: string }>(
    `UPDATE saved_views SET ${sets.join(", ")} WHERE id = $${params.length}
       RETURNING org_id, project_id`,
    params,
  );
  if (!rows[0]) throw new Error(`updateSavedView: not found: ${input.id}`);
  await eventDispatcher.dispatch(db, {
    orgId: rows[0].org_id,
    projectId: rows[0].project_id,
    actor: "system",
    subjectKind: "saved_view",
    subjectId: input.id,
    verb: "updated",
    payload: { changed },
  });
  return { ok: true };
}

export async function deleteSavedView(
  db: ProductDb,
  id: string,
): Promise<{ ok: true }> {
  const rows = await db.query<{ org_id: string; project_id: string }>(
    `DELETE FROM saved_views WHERE id = $1 RETURNING org_id, project_id`,
    [id],
  );
  if (rows[0]) {
    await eventDispatcher.dispatch(db, {
      orgId: rows[0].org_id,
      projectId: rows[0].project_id,
      actor: "system",
      subjectKind: "saved_view",
      subjectId: id,
      verb: "deleted",
    });
  }
  return { ok: true };
}

export async function listSavedViews(
  db: ProductDb,
  projectId: string,
): Promise<SavedViewRow[]> {
  return db.query<SavedViewRow>(
    `SELECT * FROM saved_views WHERE project_id = $1 ORDER BY is_default DESC, name ASC`,
    [projectId],
  );
}
