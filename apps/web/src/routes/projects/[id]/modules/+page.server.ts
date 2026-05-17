import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

import {
  createProjectModule,
  deleteProjectModule,
  listProjectModules,
  updateProjectModule,
  type ProjectModuleStatus,
} from "@work-management/interface/pm-structure.ts";
import { requestProjectScope } from "../../project-request-scope";

const MODULE_STATUSES = ["planned", "active", "completed", "archived"] as const;

export const load: PageServerLoad = async ({ params, locals }) => {
  const { em, ctx } = await requestProjectScope(locals, params.id);
  return {
    projectId: params.id,
    streamed: {
      data: (async () => ({ modules: await listProjectModules(em, ctx) }))(),
    },
  };
};

export const actions: Actions = {
  create: async ({ params, request, locals }) => {
    const fd = await request.formData();
    const name = stringField(fd, "name");
    if (!name) return fail(400, { error: "Name is required" });
    const status = moduleStatus(stringField(fd, "status")) ?? "planned";
    const { em, ctx } = await requestProjectScope(locals, params.id);
    await createProjectModule(em, ctx, { name, status, leadUserId: nullableStringField(fd, "leadUserId") });
    return { success: true };
  },
  update: async ({ params, request, locals }) => {
    const fd = await request.formData();
    const moduleId = stringField(fd, "moduleId");
    if (!moduleId) return fail(400, { error: "moduleId is required" });
    const { em, ctx } = await requestProjectScope(locals, params.id);
    await updateProjectModule(em, ctx, {
      moduleId,
      name: nullableStringField(fd, "name") ?? undefined,
      status: moduleStatus(stringField(fd, "status")) ?? undefined,
      leadUserId: nullableStringField(fd, "leadUserId"),
    });
    return { success: true };
  },
  delete: async ({ params, request, locals }) => {
    const fd = await request.formData();
    const moduleId = stringField(fd, "moduleId");
    if (!moduleId) return fail(400, { error: "moduleId is required" });
    const { em, ctx } = await requestProjectScope(locals, params.id);
    await deleteProjectModule(em, ctx, moduleId);
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
