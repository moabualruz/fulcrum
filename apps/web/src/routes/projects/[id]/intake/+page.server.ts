import { fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

import {
  createIntakeRequest,
  deleteIntakeRequest,
  listIntakeRequests,
  updateIntakeRequest,
  type IntakeStatus,
} from "@work-management/interface/pm-structure.ts";
import { requestProjectScope } from "../../project-request-scope";

const INTAKE_STATUSES = ["open", "accepted", "declined", "converted"] as const;

export const load: PageServerLoad = async ({ params, locals }) => {
  const { em, ctx } = await requestProjectScope(locals, params.id);
  return {
    projectId: params.id,
    streamed: {
      data: (async () => ({ intake: await listIntakeRequests(em, ctx) }))(),
    },
  };
};

export const actions: Actions = {
  create: async ({ params, request, locals }) => {
    const fd = await request.formData();
    const title = field(fd, "title");
    if (!title) return fail(400, { error: "Title is required" });
    const { em, ctx } = await requestProjectScope(locals, params.id);
    await createIntakeRequest(em, ctx, {
      title,
      description: field(fd, "description") || null,
      source: field(fd, "source") || "manual",
    });
    return { success: true };
  },
  update: async ({ params, request, locals }) => {
    const fd = await request.formData();
    const intakeId = field(fd, "intakeId");
    if (!intakeId) return fail(400, { error: "intakeId is required" });
    const { em, ctx } = await requestProjectScope(locals, params.id);
    await updateIntakeRequest(em, ctx, {
      intakeId,
      title: field(fd, "title") || undefined,
      description: field(fd, "description") || null,
      status: intakeStatus(field(fd, "status")) ?? undefined,
    });
    return { success: true };
  },
  delete: async ({ params, request, locals }) => {
    const fd = await request.formData();
    const intakeId = field(fd, "intakeId");
    if (!intakeId) return fail(400, { error: "intakeId is required" });
    const { em, ctx } = await requestProjectScope(locals, params.id);
    await deleteIntakeRequest(em, ctx, intakeId);
    return { success: true };
  },
};

function field(fd: FormData, name: string): string {
  const value = fd.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function intakeStatus(value: string): IntakeStatus | null {
  return (INTAKE_STATUSES as readonly string[]).includes(value) ? value as IntakeStatus : null;
}
