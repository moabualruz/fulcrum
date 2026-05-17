import type { EntityManager } from "typeorm";

import type {
  CreateViewInput,
  SavedViewRow,
  UpdateViewInput,
  ViewScope,
} from "@work-management/application/saved-views/queries.ts";

export type {
  CreateViewInput,
  SavedViewRow,
  UpdateViewInput,
  ViewScope,
};

export const VIEW_SCOPES: readonly ViewScope[] = ["org", "project", "private"] as const;

export async function createSavedView(em: EntityManager, input: CreateViewInput): Promise<{ id: string }> {
  const service = await import("@work-management/application/saved-views/queries.ts");
  return service.createSavedView(em, input);
}

export async function updateSavedView(em: EntityManager, input: UpdateViewInput): Promise<{ ok: true }> {
  const service = await import("@work-management/application/saved-views/queries.ts");
  return service.updateSavedView(em, input);
}

export async function deleteSavedView(em: EntityManager, id: string): Promise<{ ok: true }> {
  const service = await import("@work-management/application/saved-views/queries.ts");
  return service.deleteSavedView(em, id);
}

export async function listSavedViews(em: EntityManager, projectId: string): Promise<SavedViewRow[]> {
  const service = await import("@work-management/application/saved-views/queries.ts");
  return service.listSavedViews(em, projectId);
}
