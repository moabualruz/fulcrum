import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

import {
  createPlanningStructureApiForEvent,
  PlanningStructureApiError,
} from "$lib/server/planning-structure-api";

const MODULE_STATUSES = ["planned", "active", "completed", "archived"] as const;
type ProjectModuleStatus = (typeof MODULE_STATUSES)[number];

export const load: PageServerLoad = async (event) => {
  const projectId = event.params.id;
  try {
    const modules = await createPlanningStructureApiForEvent(event).modules.list({ projectId });
    return {
      projectId,
      streamed: {
        data: Promise.resolve({ modules }),
      },
    };
  } catch (err) {
    if (err instanceof PlanningStructureApiError && err.status === 404) {
      throw error(404, "Project not found");
    }
    throw err;
  }
};

export const actions: Actions = {
  create: async (event) => {
    const fd = await event.request.formData();
    const name = stringField(fd, "name");
    if (!name) return fail(400, { error: "Name is required" });
    const status = moduleStatus(stringField(fd, "status")) ?? "planned";
    await createPlanningStructureApiForEvent(event).modules.create({
      projectId: event.params.id,
      name,
      status,
      leadUserId: nullableStringField(fd, "leadUserId"),
    });
    return { success: true };
  },
  update: async (event) => {
    const fd = await event.request.formData();
    const moduleId = stringField(fd, "moduleId");
    if (!moduleId) return fail(400, { error: "moduleId is required" });
    await createPlanningStructureApiForEvent(event).modules.update({
      id: moduleId,
      projectId: event.params.id,
      name: nullableStringField(fd, "name") ?? undefined,
      status: moduleStatus(stringField(fd, "status")) ?? undefined,
      leadUserId: nullableStringField(fd, "leadUserId"),
    });
    return { success: true };
  },
  delete: async (event) => {
    const fd = await event.request.formData();
    const moduleId = stringField(fd, "moduleId");
    if (!moduleId) return fail(400, { error: "moduleId is required" });
    await createPlanningStructureApiForEvent(event).modules.delete({
      id: moduleId,
      projectId: event.params.id,
    });
    return { success: true };
  },
};

function stringField(fd: FormData, name: string): string {
  const value = fd.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function nullableStringField(fd: FormData, name: string): string | null {
  const value = stringField(fd, name);
  return value || null;
}

function moduleStatus(value: string): ProjectModuleStatus | null {
  return (MODULE_STATUSES as readonly string[]).includes(value) ? value as ProjectModuleStatus : null;
}
