import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

import {
  getIntakeRequest,
  updateIntakeRequest,
  type IntakeStatus,
} from "@work-management/interface/pm-structure.ts";
import { requestProjectScope } from "../../../project-request-scope";

const INTAKE_STATUSES = ["open", "accepted", "declined", "converted"] as const;

export const load: PageServerLoad = async ({ params, locals }) => {
  const { em, ctx } = await requestProjectScope(locals, params.id);
  const intake = await getIntakeRequest(em, ctx, params.intakeId);
  if (!intake) throw error(404, "Intake request not found");
  return { projectId: params.id, intake };
};

export const actions: Actions = {
  update: async ({ params, request, locals }) => {
    const fd = await request.formData();
    const title = field(fd, "title");
    if (!title) return fail(400, { error: "Title is required" });
    const { em, ctx } = await requestProjectScope(locals, params.id);
    await updateIntakeRequest(em, ctx, {
      intakeId: params.intakeId,
      title,
      description: field(fd, "description") || null,
      status: intakeStatus(field(fd, "status")) ?? "open",
    });
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
