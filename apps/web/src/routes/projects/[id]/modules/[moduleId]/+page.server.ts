import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

import {
  createPlanningStructureApiForEvent,
  PlanningStructureApiError,
} from "$lib/server/planning-structure-api";

const MODULE_STATUSES = ["planned", "active", "completed", "archived"] as const;
type ProjectModuleStatus = (typeof MODULE_STATUSES)[number];

export const load: PageServerLoad = async (event) => {
  try {
    const projectModule = await createPlanningStructureApiForEvent(event).modules.get({
      id: event.params.moduleId,
      projectId: event.params.id,
    });
    return { projectId: event.params.id, module: projectModule };
  } catch (err) {
    if (err instanceof PlanningStructureApiError && err.status === 404) {
      throw error(404, "Module not found");
    }
    throw err;
  }
};

export const actions: Actions = {
  update: async (event) => {
    const fd = await event.request.formData();
    const name = field(fd, "name");
    if (!name) return fail(400, { error: "Name is required" });
    await createPlanningStructureApiForEvent(event).modules.update({
      id: event.params.moduleId,
      projectId: event.params.id,
      name,
      status: moduleStatus(field(fd, "status")) ?? "planned",
      leadUserId: field(fd, "leadUserId") || null,
    });
    return { success: true };
  },
};

function field(fd: FormData, name: string): string {
  const value = fd.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function moduleStatus(value: string): ProjectModuleStatus | null {
  return (MODULE_STATUSES as readonly string[]).includes(value) ? value as ProjectModuleStatus : null;
}
