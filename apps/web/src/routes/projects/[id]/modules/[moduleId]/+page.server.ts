import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

import {
  getProjectModule,
  updateProjectModule,
  type ProjectModuleStatus,
} from "@work-management/interface/pm-structure.ts";
import { requestProjectScope } from "../../../project-request-scope";

const MODULE_STATUSES = ["planned", "active", "completed", "archived"] as const;

export const load: PageServerLoad = async ({ params, locals }) => {
  const { em, ctx } = await requestProjectScope(locals, params.id);
  const module = await getProjectModule(em, ctx, params.moduleId);
  if (!module) throw error(404, "Module not found");
  return { projectId: params.id, module };
};

export const actions: Actions = {
  update: async ({ params, request, locals }) => {
    const fd = await request.formData();
    const name = field(fd, "name");
    if (!name) return fail(400, { error: "Name is required" });
    const { em, ctx } = await requestProjectScope(locals, params.id);
    await updateProjectModule(em, ctx, {
      moduleId: params.moduleId,
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
